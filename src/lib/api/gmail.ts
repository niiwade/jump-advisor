import { google } from "googleapis";
import { prisma } from "@/lib/db/prisma";
import { generateEmbedding } from "@/lib/rag/embeddings";

// Function to get Gmail client for a user
export async function getGmailClient(userId: string) {
  // Get the user's Google OAuth tokens
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "google",
    },
  });

  if (!account) {
    throw new Error("Google account not connected");
  }

  // Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  // Set credentials
  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });

  // Create Gmail client
  return google.gmail({ version: "v1", auth: oauth2Client });
}

// Send an email
export async function sendEmail(
  userId: string,
  to: string,
  subject: string,
  body: string
) {
  try {
    const gmail = await getGmailClient(userId);

    // Create email content
    const emailContent = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/html; charset=utf-8",
      "",
      body,
    ].join("\r\n");

    // Encode the email
    const encodedEmail = Buffer.from(emailContent)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Send the email
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedEmail,
      },
    });

    return {
      success: true,
      messageId: response.data.id,
    };
  } catch (error) {
    console.error("Error sending email:", error);
    return {
      success: false,
      error: "Failed to send email",
    };
  }
}

// Import emails for RAG
export async function importEmails(userId: string) {
  try {
    const gmail = await getGmailClient(userId);

    // Get list of emails
    const response = await gmail.users.messages.list({
      userId: "me",
      maxResults: 100, // Adjust as needed
    });

    if (!response.data.messages) {
      return { success: true, count: 0 };
    }

    // Process each email
    for (const message of response.data.messages) {
      // Get email details
      const email = await gmail.users.messages.get({
        userId: "me",
        id: message.id!,
      });

      // Extract email data
      const headers = email.data.payload?.headers || [];
      const subject = headers.find(h => h.name === "Subject")?.value || "";
      const from = headers.find(h => h.name === "From")?.value || "";
      const to = headers.find(h => h.name === "To")?.value || "";
      const dateHeader = headers.find(h => h.name === "Date")?.value || "";
      
      // Parse email date safely
      function parseEmailDate(dateStr: string): Date {
        if (!dateStr) return new Date(); // Default to current date if empty
        
        try {
          // Try standard date parsing
          const parsedDate = new Date(dateStr);
          
          // Check if the date is valid
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate;
          }
          
          // If we get here, the date wasn't parsed correctly
          console.warn(`Invalid date format: ${dateStr}, using current date instead`);
          return new Date();
        } catch (error) {
          console.warn(`Error parsing date: ${dateStr}`, error);
          return new Date(); // Fallback to current date
        }
      }
      
      const date = parseEmailDate(dateHeader);

      // Extract email body
      let body = "";
      if (email.data.payload?.parts) {
        for (const part of email.data.payload.parts) {
          if (part.mimeType === "text/plain" && part.body?.data) {
            body += Buffer.from(part.body.data, "base64").toString("utf-8");
          }
        }
      } else if (email.data.payload?.body?.data) {
        body = Buffer.from(email.data.payload.body.data, "base64").toString("utf-8");
      }

      // Generate embedding for the email content
      const content = `Subject: ${subject}\n\nFrom: ${from}\n\nBody: ${body}`;
      const embedding = await generateEmbedding(content);

      // Store in database - use upsert to handle duplicate emails
      await prisma.emailDocument.upsert({
        where: {
          emailId: message.id!
        },
        update: {
          subject,
          content: body,
          sender: from,
          recipients: [to],
          sentAt: date,
          embedding,
          updatedAt: new Date()
        },
        create: {
          emailId: message.id!,
          userId,
          subject,
          content: body,
          sender: from,
          recipients: [to],
          sentAt: date,
          embedding, // This would be stored using pgvector in a real implementation
        },
      });
    }

    return {
      success: true,
      count: response.data.messages.length,
    };
  } catch (error) {
    console.error("Error importing emails:", error);
    return {
      success: false,
      error: "Failed to import emails",
    };
  }
}

// Interface for email webhook data
interface EmailWebhookData {
  messageId: string;
  // Add other properties as needed based on the actual structure
}

// Listen for new emails (webhook handler)
export async function handleNewEmail(userId: string, emailData: EmailWebhookData) {
  try {
    const gmail = await getGmailClient(userId);

    // Get email details
    const email = await gmail.users.messages.get({
      userId: "me",
      id: emailData.messageId,
    });

    // Extract email data
    const headers = email.data.payload?.headers || [];
    const subject = headers.find(h => h.name === "Subject")?.value || "";
    const from = headers.find(h => h.name === "From")?.value || "";
    const to = headers.find(h => h.name === "To")?.value || "";
    const dateHeader = headers.find(h => h.name === "Date")?.value || "";
    
    // Parse email date safely
    function parseEmailDate(dateStr: string): Date {
      if (!dateStr) return new Date(); // Default to current date if empty
      
      try {
        // Try standard date parsing
        const parsedDate = new Date(dateStr);
        
        // Check if the date is valid
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate;
        }
        
        // If we get here, the date wasn't parsed correctly
        console.warn(`Invalid date format: ${dateStr}, using current date instead`);
        return new Date();
      } catch (error) {
        console.warn(`Error parsing date: ${dateStr}`, error);
        return new Date(); // Fallback to current date
      }
    }
    
    const date = parseEmailDate(dateHeader);

    // Extract email body
    let body = "";
    if (email.data.payload?.parts) {
      for (const part of email.data.payload.parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
          body += Buffer.from(part.body.data, "base64").toString("utf-8");
        }
      }
    } else if (email.data.payload?.body?.data) {
      body = Buffer.from(email.data.payload.body.data, "base64").toString("utf-8");
    }

    // Generate embedding for the email content
    const content = `Subject: ${subject}\n\nFrom: ${from}\n\nBody: ${body}`;
    const embedding = await generateEmbedding(content);

    // Store in database
    await prisma.emailDocument.create({
      data: {
        emailId: emailData.messageId,
        userId,
        subject,
        content: body,
        sender: from,
        recipients: [to],
        sentAt: date,
        embedding, // This would be stored using pgvector in a real implementation
      },
    });

    // Check for ongoing instructions related to emails
    const instructions = await prisma.instruction.findMany({
      where: {
        userId,
        active: true,
        instruction: {
          contains: "email",
        },
      },
    });

    // Process instructions if any
    if (instructions.length > 0) {
      // This would trigger the agent to process the email based on instructions
      // For example, creating a contact in HubSpot if the sender is not already there
    }

    return {
      success: true,
      emailId: emailData.messageId,
    };
  } catch (error) {
    console.error("Error handling new email:", error);
    return {
      success: false,
      error: "Failed to process new email",
    };
  }
}
