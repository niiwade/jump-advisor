import { prisma } from "@/lib/db/prisma";
import { getGmailClient } from "@/lib/api/gmail";
import { getCalendarClient } from "@/lib/api/calendar";
import { getHubspotClient } from "@/lib/api/hubspot";

/**
 * Service types for webhook subscriptions
 */
export type WebhookService = "GMAIL" | "CALENDAR" | "HUBSPOT";

/**
 * Create or update webhook subscriptions for a user
 * 
 * @param userId The user ID
 * @param services Array of services to subscribe to
 */
export async function setupWebhookSubscriptions(
  userId: string,
  services: WebhookService[] = ["GMAIL", "CALENDAR", "HUBSPOT"]
): Promise<void> {
  try {
    console.log(`Setting up webhook subscriptions for user ${userId}`);
    
    // Get the user's accounts
    const accounts = await prisma.account.findMany({
      where: {
        userId,
      },
    });
    
    const googleAccount = accounts.find(a => a.provider === "google");
    const hubspotAccount = accounts.find(a => a.provider === "hubspot");
    
    // Setup subscriptions for each requested service
    for (const service of services) {
      switch (service) {
        case "GMAIL":
          if (googleAccount) {
            await setupGmailSubscription(userId);
          }
          break;
          
        case "CALENDAR":
          if (googleAccount) {
            await setupCalendarSubscription(userId);
          }
          break;
          
        case "HUBSPOT":
          if (hubspotAccount) {
            await setupHubspotSubscription(userId);
          }
          break;
      }
    }
    
  } catch (error) {
    console.error("Error setting up webhook subscriptions:", error);
    throw error;
  }
}

/**
 * Setup Gmail push notifications
 * 
 * @param userId The user ID
 * @param account The Google account
 */
async function setupGmailSubscription(
  userId: string
): Promise<void> {
  try {
    // Check if there's an existing subscription
    const existingSubscription = await prisma.webhookSubscription.findFirst({
      where: {
        userId,
        service: "GMAIL",
        expiresAt: {
          gt: new Date(),
        },
      },
    });
    
    if (existingSubscription) {
      console.log(`Gmail subscription already exists for user ${userId}, expires at ${existingSubscription.expiresAt}`);
      return;
    }
    
    // Initialize Gmail client
    const gmail = await getGmailClient(userId);
    
    // Generate a unique channel ID
    const channelId = `gmail-${userId}-${Date.now()}`;
    
    // Set up push notifications
    const response = await gmail.users.watch({
      userId: "me",
      requestBody: {
        labelIds: ["INBOX"],
        topicName: process.env.GMAIL_PUBSUB_TOPIC,
        labelFilterAction: "include",
      },
    });
    
    // Calculate expiration date (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    // Store the subscription in the database
    await prisma.webhookSubscription.create({
      data: {
        userId,
        service: "GMAIL",
        channelId,
        resourceId: response.data.historyId,
        externalId: response.data.historyId,
        expiresAt,
      },
    });
    
    console.log(`Created Gmail subscription for user ${userId}`);
    
  } catch (error) {
    console.error(`Error setting up Gmail subscription for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Setup Google Calendar push notifications
 * 
 * @param userId The user ID
 * @param account The Google account
 */
async function setupCalendarSubscription(
  userId: string
): Promise<void> {
  try {
    // Check if there's an existing subscription
    const existingSubscription = await prisma.webhookSubscription.findFirst({
      where: {
        userId,
        service: "CALENDAR",
        expiresAt: {
          gt: new Date(),
        },
      },
    });
    
    if (existingSubscription) {
      console.log(`Calendar subscription already exists for user ${userId}, expires at ${existingSubscription.expiresAt}`);
      return;
    }
    
    // Initialize Calendar client
    const calendar = await getCalendarClient(userId);
    
    // Generate a unique channel ID
    const channelId = `calendar-${userId}-${Date.now()}`;
    
    // Set up push notifications
    const response = await calendar.events.watch({
      calendarId: "primary",
      requestBody: {
        id: channelId,
        type: "web_hook",
        address: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/calendar`,
      },
    });
    
    // Store the subscription in the database
    await prisma.webhookSubscription.create({
      data: {
        userId,
        service: "CALENDAR",
        channelId,
        resourceId: response.data.resourceId,
        externalId: response.data.resourceId,
        expiresAt: new Date(Number(response.data.expiration)),
      },
    });
    
    console.log(`Created Calendar subscription for user ${userId}`);
    
  } catch (error) {
    console.error(`Error setting up Calendar subscription for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Setup HubSpot webhooks
 * 
 * @param userId The user ID
 * @param account The HubSpot account
 */
async function setupHubspotSubscription(
  userId: string
): Promise<void> {
  try {
    // Check if there's an existing subscription
    const existingSubscription = await prisma.webhookSubscription.findFirst({
      where: {
        userId,
        service: "HUBSPOT",
      },
    });
    
    if (existingSubscription) {
      console.log(`HubSpot subscription already exists for user ${userId}`);
      return;
    }
    
    // Initialize HubSpot client
    const hubspot = await getHubspotClient(userId);
    
    // Create a subscription for contacts
    const contactSubscription = await hubspot.post("/webhooks/v3/app/subscriptions", {
      eventType: "contact.creation",
      propertyName: "*",
      active: true,
    });
    
    // Create a subscription for notes
    const noteSubscription = await hubspot.post("/webhooks/v3/app/subscriptions", {
      eventType: "note.creation",
      propertyName: "*",
      active: true,
    });
    
    // Store the subscriptions in the database
    await prisma.webhookSubscription.createMany({
      data: [
        {
          userId,
          service: "HUBSPOT",
          channelId: "hubspot-contact-" + userId,
          resourceId: "contact",
          externalId: contactSubscription.data?.id || `contact-${Date.now()}`,
          expiresAt: null, // HubSpot subscriptions don't expire
        },
        {
          userId,
          service: "HUBSPOT",
          channelId: "hubspot-note-" + userId,
          resourceId: "note",
          externalId: noteSubscription.data?.id || `note-${Date.now()}`,
          expiresAt: null, // HubSpot subscriptions don't expire
        },
      ],
    });
    
    console.log(`Created HubSpot subscriptions for user ${userId}`);
    
  } catch (error) {
    console.error(`Error setting up HubSpot subscription for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Renew webhook subscriptions that are about to expire
 */
export async function renewWebhookSubscriptions(): Promise<void> {
  try {
    // Find subscriptions that expire in the next 24 hours
    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() + 24);
    
    const expiringSubscriptions = await prisma.webhookSubscription.findMany({
      where: {
        expiresAt: {
          lt: expirationDate,
          not: null,
        },
      },
      include: {
        user: true,
      },
    });
    
    console.log(`Found ${expiringSubscriptions.length} expiring webhook subscriptions`);
    
    // Renew each subscription
    for (const subscription of expiringSubscriptions) {
      const accounts = await prisma.account.findMany({
        where: {
          userId: subscription.userId,
        },
      });
      
      const googleAccount = accounts.find(a => a.provider === "google");
      
      if (subscription.service === "GMAIL" && googleAccount) {
        await setupGmailSubscription(subscription.userId);
      } else if (subscription.service === "CALENDAR" && googleAccount) {
        await setupCalendarSubscription(subscription.userId);
      }
    }
    
  } catch (error) {
    console.error("Error renewing webhook subscriptions:", error);
    throw error;
  }
}
