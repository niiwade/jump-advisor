import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { processCalendarUpdate } from "@/lib/webhooks/calendar-handler";

/**
 * Google Calendar Webhook Handler
 * 
 * This endpoint receives notifications from Google Calendar when events change.
 * It processes the updates and syncs the changes to our database.
 * 
 * Documentation: https://developers.google.com/calendar/api/guides/push
 */
export async function POST(req: Request) {
  try {
    // Parse the request body
    const body = await req.json();
    
    // Headers can be used for verification if needed
    // const headers = Object.fromEntries(req.headers);
    
    // Extract data from the notification
    const { 
      resourceId,   // The ID of the resource that changed
      channelId,    // The ID of the notification channel
      resourceState // The state of the resource (exists, sync, not_exists)
    } = body;
    
    if (!resourceId || !channelId) {
      console.error("Missing required fields in Calendar notification", { resourceId, channelId });
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    
    // Find the user associated with this channel
    const subscription = await prisma.webhookSubscription.findFirst({
      where: {
        externalId: channelId,  // Correct field from schema
        service: "CALENDAR"
      },
      include: {
        user: true
      }
    });
    
    if (!subscription || !subscription.user) {
      console.error(`No user found for channel: ${channelId}`);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    
    // Process the calendar update asynchronously
    processCalendarUpdate(subscription.user.id, resourceId, resourceState)
      .catch(error => console.error("Error processing calendar update:", error));
    
    // Respond immediately to the webhook
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error handling Calendar webhook:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
