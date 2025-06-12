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

  if (!account.access_token || !account.refresh_token) {
    throw new Error("Google OAuth tokens are missing. Please reconnect your Google account.");
  }

  // Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXTAUTH_URL ? `${process.env.NEXTAUTH_URL}/api/auth/callback/google` : "http://localhost:3000/api/auth/callback/google"
  );

  // Set credentials
  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  // Set up token refresh callback
  oauth2Client.on('tokens', async (tokens) => {
    console.log('Token refresh occurred');
    
    // Update the tokens in the database when they refresh
    if (tokens.access_token) {
      await prisma.account.update({
        where: { id: account.id },
        data: {
          access_token: tokens.access_token,
          expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : account.expires_at,
        },
      });
    }
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
  // Validate inputs
  const validationErrors = [];
  
  if (!userId) validationErrors.push("User ID is required");
  if (!to) validationErrors.push("Recipient email is required");
  if (!to.includes('@')) validationErrors.push("Invalid recipient email format");
  if (!subject) validationErrors.push("Email subject is required");
  if (!body) validationErrors.push("Email body is required");
  
  if (validationErrors.length > 0) {
    console.error("Email validation errors:", validationErrors);
    return {
      success: false,
      error: "Validation failed",
      validationErrors,
      message: "Unable to send email: " + validationErrors.join(", ")
    };
  }
  
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
      message: `Email successfully sent to ${to}`
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error sending email:", error);
    return {
      success: false,
      error: errorMessage,
      message: `Failed to send email: ${errorMessage}`
    };
  }
}

// Define interface for progress updates
interface ImportProgress {
  percentage: number;
  total: number;
  processed: number;
  failed: number;
  skipped: number;
  errors?: string[];
  warnings?: string[];
}

// Define interface for import options
interface ImportOptions {
  onProgress?: (progress: ImportProgress) => Promise<void>;
}

// Import emails for RAG
export async function importEmails(userId: string, options?: ImportOptions) {
  try {
    console.log(`Starting Gmail import for user ${userId}`);
    
    // Get Gmail client with proper authentication
    let gmail;
    try {
      gmail = await getGmailClient(userId);
      console.log('Successfully created Gmail client');
    } catch (authError) {
      console.error('Gmail authentication error:', authError);
      return { 
        success: false, 
        error: `Gmail authentication failed: ${authError instanceof Error ? authError.message : 'Unknown error'}`,
        count: 0 
      };
    }

    // Get list of emails with error handling
    let response;
    try {
      console.log('Fetching Gmail messages...');
      response = await gmail.users.messages.list({
        userId: "me",
        maxResults: 5, // Limited to 5 emails as requested
      });
      console.log(`Found ${response.data.messages?.length || 0} messages (limited to 5 max)`);
    } catch (apiError) {
      console.error('Gmail API error:', apiError);
      return { 
        success: false, 
        error: `Gmail API error: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`,
        count: 0 
      };
    }

    if (!response.data.messages) {
      console.log('No messages found in Gmail');
      return { success: true, count: 0 };
    }

    const totalEmails = response.data.messages.length;
    let processedEmails = 0;
    let failedEmails = 0;
    const skippedEmails = 0; // This is a constant since we don't skip emails yet
    const errors: string[] = [];
    const warnings: string[] = [];

    // Process each email
    for (const message of response.data.messages) {
      try {
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
            warnings.push(`Invalid date format: ${dateStr}, using current date instead`);
            return new Date();
          } catch {
            warnings.push(`Error parsing date: ${dateStr}`);
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
            messageId: message.id!
          },
          update: {
            subject,
            content: body,
            sender: from,
            recipient: to,
            sentAt: date,
            embedding,
            updatedAt: new Date()
          },
          create: {
            messageId: message.id!,
            userId,
            subject,
            content: body,
            sender: from,
            recipient: to,
            sentAt: date,
            embedding,
          },
        });

        processedEmails++;
      } catch (error) {
        failedEmails++;
        errors.push(`Failed to process email ${message.id}: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Update progress
      if (options?.onProgress) {
        await options.onProgress({
          percentage: Math.round((processedEmails + failedEmails + skippedEmails) / totalEmails * 100),
          total: totalEmails,
          processed: processedEmails,
          failed: failedEmails,
          skipped: skippedEmails,
          errors,
          warnings
        });
      }
    }

    return {
      success: true,
      count: processedEmails,
      stats: {
        totalEmails,
        processedEmails,
        failedEmails,
        skippedEmails
      },
      errors,
      warnings
    };
  } catch (error) {
    console.error("Error importing emails:", error);
    return {
      success: false,
      error: "Failed to import emails",
      stats: {
        totalEmails: 0,
        processedEmails: 0,
        failedEmails: 0,
        skippedEmails: 0
      },
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: []
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
        messageId: emailData.messageId,
        userId,
        subject,
        content: body,
        sender: from,
        recipient: to,
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
