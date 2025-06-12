import { prisma } from "@/lib/db/prisma";
import { getCalendarClient } from "@/lib/api/calendar";
import { getHubspotClient } from "@/lib/api/hubspot";
import { processCalendarEvent } from "@/lib/webhooks/calendar-handler";
import { processHubspotEvent, HubspotClient, HubspotEventData } from "@/lib/webhooks/hubspot-handler";

/**
 * Interval in milliseconds for checking new data (default: 15 minutes)
 */
const CHECK_INTERVAL = 15 * 60 * 1000;

/**
 * Time window in milliseconds to look back for new events (default: 1 hour)
 */
const LOOKBACK_WINDOW = 60 * 60 * 1000;

/**
 * Interface for tracking the last processed timestamp for each service
 */
interface LastProcessedTimestamps {
  [userId: string]: {
    calendar?: Date;
    hubspot?: Date;
  };
}

// In-memory store of last processed timestamps
const lastProcessed: LastProcessedTimestamps = {};

/**
 * Start the proactive agent that periodically checks for new data
 */
export function startProactiveAgent(): void {
  console.log("Starting proactive agent...");
  
  // Initial check
  checkForNewData();
  
  // Schedule periodic checks
  setInterval(checkForNewData, CHECK_INTERVAL);
}

/**
 * Check for new data across all services and users
 */
async function checkForNewData(): Promise<void> {
  try {
    console.log("Checking for new data...");
    
    // Get all active users with connected accounts
    const users = await prisma.user.findMany({
      where: {
        accounts: {
          some: {}
        }
      },
      include: {
        accounts: true
      }
    });
    
    // Process each user's data
    for (const user of users) {
      await Promise.all([
        checkCalendarEvents(user.id),
        checkHubspotEvents(user.id)
      ]);
    }
    
    console.log("Finished checking for new data");
  } catch (error) {
    console.error("Error in proactive agent:", error);
  }
}

/**
 * Check for new calendar events for a specific user
 */
async function checkCalendarEvents(userId: string): Promise<void> {
  try {
    // Get the user's calendar client
    const calendar = await getCalendarClient(userId);
    if (!calendar) {
      return;
    }
    
    // Determine the time range to check
    const now = new Date();
    const lookbackTime = new Date(now.getTime() - LOOKBACK_WINDOW);
    
    // Use the last processed time if available, otherwise use the lookback window
    const startTime = lastProcessed[userId]?.calendar || lookbackTime;
    
    // Query for events that have been updated since the last check
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startTime.toISOString(),
      timeMax: now.toISOString(),
      singleEvents: true,
      orderBy: 'updated',
      updatedMin: startTime.toISOString()
    });
    
    const events = response.data.items || [];
    
    // Process each event
    for (const event of events) {
      if (event.id) {
        await processCalendarEvent(userId, {
          id: event.id,
          summary: event.summary || '',
          description: event.description || '',
          location: event.location || '',
          start: event.start ? {
            dateTime: event.start.dateTime || undefined,
            date: event.start.date || undefined
          } : undefined,
          end: event.end ? {
            dateTime: event.end.dateTime || undefined,
            date: event.end.date || undefined
          } : undefined,
          attendees: event.attendees?.map(attendee => ({ 
            email: attendee.email || undefined 
          })) || []
        });
      }
    }
    
    // Update the last processed timestamp
    if (!lastProcessed[userId]) {
      lastProcessed[userId] = {};
    }
    lastProcessed[userId].calendar = now;
    
    console.log(`Processed ${events.length} calendar events for user ${userId}`);
  } catch (error) {
    console.error(`Error checking calendar events for user ${userId}:`, error);
  }
}

/**
 * Check for new HubSpot events for a specific user
 */
async function checkHubspotEvents(userId: string): Promise<void> {
  try {
    // Get the user's HubSpot client
    const hubspot = await getHubspotClient(userId) as unknown as HubspotClient;
    if (!hubspot) {
      return;
    }
    
    // Determine the time range to check
    const now = new Date();
    const lookbackTime = new Date(now.getTime() - LOOKBACK_WINDOW);
    
    // Use the last processed time if available, otherwise use the lookback window
    const startTime = lastProcessed[userId]?.hubspot || lookbackTime;
    
    // Check for new contacts
    await checkNewHubspotContacts(userId, hubspot, startTime);
    
    // Check for new notes
    await checkNewHubspotNotes(userId, hubspot, startTime);
    
    // Check for new deals
    await checkNewHubspotDeals(userId, hubspot, startTime);
    
    // Update the last processed timestamp
    if (!lastProcessed[userId]) {
      lastProcessed[userId] = {};
    }
    lastProcessed[userId].hubspot = now;
    
    console.log(`Finished checking HubSpot events for user ${userId}`);
  } catch (error) {
    console.error(`Error checking HubSpot events for user ${userId}:`, error);
  }
}

/**
 * Check for new HubSpot contacts
 */
async function checkNewHubspotContacts(
  userId: string, 
  hubspot: HubspotClient, 
  since: Date
): Promise<void> {
  try {
    // Query for contacts created or updated since the specified time
    // Using direct axios methods since the typed client doesn't include search/list methods
    const response = await hubspot.get('/crm/v3/objects/contacts/search', {
      data: {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'createdate',
                operator: 'GTE',
                value: since.toISOString()
              }
            ]
          },
          {
            filters: [
              {
                propertyName: 'lastmodifieddate',
                operator: 'GTE',
                value: since.toISOString()
              }
            ]
          }
        ],
        limit: 100
      }
    });
    
    const contacts = response.data.results || [];
    
    // Process each contact
    for (const contact of contacts) {
      // Create a synthetic event object similar to what the webhook would receive
      const eventData: HubspotEventData = {
        objectId: contact.id,
        objectType: 'contact',
        eventType: 'contact.creation', // or contact.propertyChange
        properties: contact.properties
      };
      
      await processHubspotEvent(userId, eventData);
    }
    
    console.log(`Processed ${contacts.length} HubSpot contacts for user ${userId}`);
  } catch (error) {
    console.error(`Error checking HubSpot contacts for user ${userId}:`, error);
  }
}

/**
 * Check for new HubSpot notes
 */
async function checkNewHubspotNotes(
  userId: string, 
  hubspot: HubspotClient, 
  since: Date
): Promise<void> {
  try {
    // Query for notes created or updated since the specified time
    // Using direct axios methods since the typed client doesn't include search/list methods
    const response = await hubspot.get('/crm/v3/objects/notes/search', {
      data: {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'hs_createdate',
                operator: 'GTE',
                value: since.toISOString()
              }
            ]
          },
          {
            filters: [
              {
                propertyName: 'hs_lastmodifieddate',
                operator: 'GTE',
                value: since.toISOString()
              }
            ]
          }
        ],
        limit: 100
      }
    });
    
    const notes = response.data.results || [];
    
    // Process each note
    for (const note of notes) {
      // Create a synthetic event object similar to what the webhook would receive
      const eventData: HubspotEventData = {
        objectId: note.id,
        objectType: 'note',
        eventType: 'note.creation', // or note.propertyChange
        properties: note.properties
      };
      
      await processHubspotEvent(userId, eventData);
    }
    
    console.log(`Processed ${notes.length} HubSpot notes for user ${userId}`);
  } catch (error) {
    console.error(`Error checking HubSpot notes for user ${userId}:`, error);
  }
}

/**
 * Check for new HubSpot deals
 */
async function checkNewHubspotDeals(
  userId: string, 
  hubspot: HubspotClient, 
  since: Date
): Promise<void> {
  try {
    // Query for deals created or updated since the specified time
    // Using direct axios methods since the typed client doesn't include search/list methods
    const response = await hubspot.get('/crm/v3/objects/deals/search', {
      data: {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'createdate',
                operator: 'GTE',
                value: since.toISOString()
              }
            ]
          },
          {
            filters: [
              {
                propertyName: 'hs_lastmodifieddate',
                operator: 'GTE',
                value: since.toISOString()
              }
            ]
          }
        ],
        limit: 100
      }
    });
    
    const deals = response.data.results || [];
    
    // Process each deal
    for (const deal of deals) {
      // Create a synthetic event object similar to what the webhook would receive
      const eventData: HubspotEventData = {
        objectId: deal.id,
        objectType: 'deal',
        eventType: 'deal.creation', // or deal.propertyChange
        properties: deal.properties
      };
      
      await processHubspotEvent(userId, eventData);
    }
    
    console.log(`Processed ${deals.length} HubSpot deals for user ${userId}`);
  } catch (error) {
    console.error(`Error checking HubSpot deals for user ${userId}:`, error);
  }
}
