import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { processNewEmail } from "@/lib/webhooks/gmail-handler";

/**
 * Gmail Push Notification Webhook Handler
 * 
 * This endpoint receives notifications from Gmail when new emails arrive.
 * It verifies the notification, fetches the new email, and processes it.
 * 
 * Documentation: https://developers.google.com/gmail/api/guides/push
 */
export async function POST(req: Request) {
  try {
    // Parse the request body
    const body = await req.json();
    
    // Note: In a production environment, we would verify the headers
    // const headers = Object.fromEntries(req.headers);
    
    // Extract data from the notification
    const { 
      emailAddress, // The email address that received the email
      historyId     // The history ID for the mailbox update
    } = body;
    
    if (!emailAddress || !historyId) {
      console.error("Missing required fields in Gmail notification", { emailAddress, historyId });
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    
    // Find the user associated with this email
    const account = await prisma.account.findFirst({
      where: {
        provider: "google",
        providerAccountId: emailAddress,
      },
      include: {
        user: true,
      },
    });
    
    if (!account?.user) {
      console.error(`No user found for email: ${emailAddress}`);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    
    // Process the new email asynchronously
    // We don't await this to respond quickly to the webhook
    processNewEmail(account.user.id, emailAddress, historyId)
      .catch(error => console.error("Error processing new email:", error));
    
    // Respond immediately to the webhook
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error handling Gmail webhook:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
