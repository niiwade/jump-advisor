import { prisma } from "@/lib/db/prisma";
import { getGmailClient } from "@/lib/api/gmail";
import { generateEmbedding } from "@/lib/rag/search";
import { processUserRequest } from "@/lib/agents/financial-advisor-agent";
import type { gmail_v1 } from 'googleapis';

/**
 * Process a new email notification from Gmail
 * 
 * @param userId The user ID
 * @param emailAddress The email address that received the email
 * @param historyId The history ID for the mailbox update
 */
export async function processNewEmail(
  userId: string,
  emailAddress: string,
  historyId: string
): Promise<void> {
  try {
    console.log(`Processing new email for user ${userId} with historyId ${historyId}`);
    
    // Get the user's Gmail token
    const account = await prisma.account.findFirst({
      where: {
        userId,
        provider: "google",
      },
    });
    
    if (!account) {
      throw new Error(`No Google account found for user ${userId}`);
    }
    
    // Initialize Gmail client
    const gmail = await getGmailClient(userId);
    
    // Get history since last sync
    const lastSyncHistoryId = await getLastSyncHistoryId(userId);
    
    const history = await gmail.users.history.list({
      userId: "me",
      startHistoryId: lastSyncHistoryId,
      historyTypes: ["messageAdded"],
    });
    
    if (!history.data.history || history.data.history.length === 0) {
      console.log("No new messages found in history");
      await updateSyncState(userId);
      return;
    }
    
    // Process each new message
    const messageIds = new Set<string>();
    
    for (const record of history.data.history) {
      if (record.messagesAdded) {
        for (const messageAdded of record.messagesAdded) {
          if (messageAdded.message?.id) {
            messageIds.add(messageAdded.message.id);
          }
        }
      }
    }
    
    console.log(`Found ${messageIds.size} new messages`);
    
    // Process each new message
    for (const messageId of messageIds) {
      const message = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });
      await processMessage(userId, message.data);
    }
    
    // Update the last sync history ID
    await updateSyncState(userId);
    
    // Check for any instructions that need to be processed
    await processInstructions(userId);
    
  } catch (error) {
    console.error("Error processing new email:", error);
    throw error;
  }
}

/**
 * Process a single email message
 * 
 * @param userId The user ID
 * @param message The Gmail message
 */
async function processMessage(
  userId: string,
  message: gmail_v1.Schema$Message
): Promise<void> {
  try {
    if (!message.payload) {
      // If payload is missing, fetch full message using the gmail client
      const gmail = await getGmailClient(userId);
      const fullMessage = await gmail.users.messages.get({
        userId: 'me',
        id: message.id!,
        format: 'FULL'
      });
      message = fullMessage.data;
      
      if (!message.payload) {
        throw new Error('Message has no payload after full fetch');
      }
    }

    // Extract message data with proper types
    const subjectHeader = message.payload.headers?.find((h: gmail_v1.Schema$MessagePartHeader) => h.name === 'Subject');
    const fromHeader = message.payload.headers?.find((h: gmail_v1.Schema$MessagePartHeader) => h.name === 'From');
    const toHeader = message.payload.headers?.find((h: gmail_v1.Schema$MessagePartHeader) => h.name === 'To');

    const subject = subjectHeader?.value || '';
    const from = fromHeader?.value || '';
    const to = toHeader?.value?.split(',') || [];
    const content = message.snippet || '';
    const date = message.internalDate ? new Date(parseInt(message.internalDate)) : new Date();

    // Store the email in the database
    await prisma.emailDocument.create({
      data: {
        emailId: message.id || '',
        messageId: message.id || '',
        userId,
        subject,
        content,
        sender: from,
        recipients: to,
        sentAt: date,
        embedding: await generateEmbedding(`${subject} ${content}`),
      }
    });

  } catch (error) {
    console.error(`Error processing message ${message.id}:`, error);
    throw error;
  }
}

/**
 * Get the last sync history ID for a user
 * 
 * @param userId The user ID
 * @returns The last sync history ID
 */
async function getLastSyncHistoryId(userId: string): Promise<string> {
  const existingSyncState = await prisma.syncState.findUnique({
    where: {
      sync_state_user_service: {
        userId,
        service: 'gmail'
      }
    }
  });
  
  return existingSyncState?.lastSyncTime?.getTime().toString() || '1';
}

/**
 * Update the sync state for a user
 * 
 * @param userId The user ID
 */
async function updateSyncState(userId: string): Promise<void> {
  await prisma.syncState.upsert({
    where: {
      sync_state_user_service: {
        userId,
        service: 'gmail'
      }
    },
    create: {
      userId,
      service: 'gmail',
      lastSyncTime: new Date(),
      status: 'SYNCING'
    },
    update: {
      lastSyncTime: new Date(),
      status: 'SYNCING'
    }
  });
}

/**
 * Process any instructions that might apply to new emails
 * 
 * @param userId The user ID
 */
async function processInstructions(userId: string): Promise<void> {
  // Get active instructions
  const instructions = await prisma.instruction.findMany({
    where: {
      userId,
      active: true,
    },
  });
  
  if (instructions.length === 0) {
    return;
  }
  
  // Get the most recent unprocessed emails
  const unprocessedEmails = await prisma.emailDocument.findMany({
    where: {
      userId,
      processed: false,
    },
    orderBy: {
      sentAt: "desc",
    },
    take: 10,
  });
  
  // Process each email against the instructions
  for (const email of unprocessedEmails) {
    for (const instruction of instructions) {
      try {
        // Use the agent to process the instruction
        const prompt = `
          I have a new email:
          From: ${email.sender}
          Subject: ${email.subject}
          Content: ${email.content.substring(0, 500)}...
          
          I have the following instruction: "${instruction.instruction}"
          
          Should I take any action based on this email and instruction? If yes, what action should I take?
        `;
        
        const response = await processUserRequest(userId, prompt, []);
        
        // If the response indicates action is needed, create a task
        if (response.toLowerCase().includes("yes") && !response.toLowerCase().includes("no action")) {
          await prisma.task.create({
            data: {
              userId,
              title: `Process email: ${email.subject}`,
              description: response,
              type: "EMAIL",
              status: "PENDING",
              metadata: {
                emailId: email.id,
                instructionId: instruction.id,
              },
            },
          });
        }
        
        // Mark the email as processed
        await prisma.emailDocument.update({
          where: { id: email.id },
          data: { processed: true },
        });
        
      } catch (error) {
        console.error(`Error processing instruction for email ${email.id}:`, error);
      }
    }
  }
}
