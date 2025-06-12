import { prisma } from "@/lib/db/prisma";
import { getGmailClient } from "@/lib/api/gmail";
import { generateEmbedding } from "@/lib/rag/search";
import { processUserRequest } from "@/lib/agents/financial-advisor-agent";

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
      await updateLastSyncHistoryId(userId, historyId);
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
      await processMessage(userId, gmail, messageId);
    }
    
    // Update the last sync history ID
    await updateLastSyncHistoryId(userId, historyId);
    
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
 * @param gmail The Gmail client
 * @param messageId The message ID
 */
import { gmail_v1 } from 'googleapis';

async function processMessage(
  userId: string,
  gmail: gmail_v1.Gmail,
  messageId: string
): Promise<void> {
  try {
    // Get the message
    const message = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });
    
    // Extract email data
    const headers = message.data.payload?.headers || [];
    
    // Use the correct Schema type from Gmail API
    const subject = headers.find((h) => h.name === "Subject")?.value || "";
    const from = headers.find((h) => h.name === "From")?.value || "";
    const to = headers.find((h) => h.name === "To")?.value || "";
    const date = headers.find((h) => h.name === "Date")?.value || "";
    
    // Extract email body
    let content = "";
    
    if (message.data.payload?.parts) {
      // Multipart message
      for (const part of message.data.payload.parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
          content += Buffer.from(part.body.data, "base64").toString("utf-8");
        }
      }
    } else if (message.data.payload?.body?.data) {
      // Simple message
      content = Buffer.from(message.data.payload.body.data, "base64").toString("utf-8");
    }
    
    // Generate embedding for the email content
    const combinedText = `Subject: ${subject}\nFrom: ${from}\n\n${content}`;
    const embedding = await generateEmbedding(combinedText);
    
    // Store the email in the database
    const email = await prisma.emailDocument.create({
      data: {
        userId,
        messageId,
        subject,
        sender: from,
        recipient: to,
        content,
        sentAt: new Date(date),
        embedding,
      },
    });
    
    console.log(`Stored email: ${email.id}`);
    
  } catch (error) {
    console.error(`Error processing message ${messageId}:`, error);
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
  const syncState = await prisma.syncState.findUnique({
    where: {
      userId_service: {
        userId,
        service: "GMAIL",
      },
    },
  });
  
  return syncState?.lastSyncToken || "1";
}

/**
 * Update the last sync history ID for a user
 * 
 * @param userId The user ID
 * @param historyId The new history ID
 */
async function updateLastSyncHistoryId(userId: string, historyId: string): Promise<void> {
  await prisma.syncState.upsert({
    where: {
      userId_service: {
        userId,
        service: "GMAIL",
      },
    },
    update: {
      lastSyncToken: historyId,
      lastSyncAt: new Date(),
    },
    create: {
      userId,
      service: "GMAIL",
      lastSyncToken: historyId,
      lastSyncAt: new Date(),
    },
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
      // Remove the type field if it's not part of InstructionWhereInput
    },
  });
  
  if (instructions.length === 0) {
    return;
  }
  
  // Get the most recent emails
  const recentEmails = await prisma.emailDocument.findMany({
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
  for (const email of recentEmails) {
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
              type: "EMAIL", // Using a valid TaskType enum value
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
