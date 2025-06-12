import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db/prisma';
import { getCalendarClient } from '@/lib/api/calendar';
import { getHubspotClient } from '@/lib/api/hubspot';
import { processCalendarEvent } from '@/lib/webhooks/calendar-handler';
import { processHubspotEvent, HubspotClient, HubspotEventData } from '@/lib/webhooks/hubspot-handler';

/**
 * POST handler for manually triggering a data check
 */
export async function POST(request: NextRequest) {
  try {
    // Get the session to verify the user is authenticated
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get the request body
    const body = await request.json();
    const userId = body.userId || session.user.id;

    // Verify the user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Start the data check in the background
    // We don't await this to avoid timeout issues
    checkUserData(userId);

    return NextResponse.json({ 
      success: true, 
      message: 'Data check initiated',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error triggering data check:', error);
    return NextResponse.json({ success: false, error: 'Failed to trigger data check' }, { status: 500 });
  }
}

/**
 * Check data for a specific user
 */
async function checkUserData(userId: string): Promise<void> {
  try {
    console.log(`Manually checking data for user ${userId}...`);
    
    // Check calendar events
    await checkCalendarEvents(userId);
    
    // Check HubSpot events
    await checkHubspotEvents(userId);
    
    console.log(`Finished checking data for user ${userId}`);
  } catch (error) {
    console.error(`Error checking data for user ${userId}:`, error);
  }
}

/**
 * Check for new calendar events
 */
async function checkCalendarEvents(userId: string): Promise<void> {
  try {
    // Get the calendar client
    const calendar = await getCalendarClient(userId);
    if (!calendar) {
      return;
    }
    
    // Get events from the last 24 hours
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Query for recent events
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: oneDayAgo.toISOString(),
      timeMax: now.toISOString(),
      singleEvents: true,
      orderBy: 'updated'
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
    
    console.log(`Processed ${events.length} calendar events for user ${userId}`);
  } catch (error) {
    console.error(`Error checking calendar events for user ${userId}:`, error);
  }
}

/**
 * Check for new HubSpot events
 */
async function checkHubspotEvents(userId: string): Promise<void> {
  try {
    // Get the HubSpot client
    const hubspot = await getHubspotClient(userId) as unknown as HubspotClient;
    if (!hubspot) {
      return;
    }
    
    // Get data from the last 24 hours
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Check for new contacts
    await checkNewHubspotContacts(userId, hubspot, oneDayAgo);
    
    // Check for new notes
    await checkNewHubspotNotes(userId, hubspot, oneDayAgo);
    
    // Check for new deals
    await checkNewHubspotDeals(userId, hubspot, oneDayAgo);
    
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
    const response = await hubspot.crm.contacts.basicApi.getPage(
      undefined, // After (for pagination)
      undefined, // Before (for pagination)
      100, // Limit
      undefined, // Properties to include
      `createdate >= ${since.getTime()} OR lastmodifieddate >= ${since.getTime()}`
    );
    
    const contacts = response.body.results || [];
    
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
    const response = await hubspot.crm.objects.notes.basicApi.getPage(
      undefined, // After (for pagination)
      undefined, // Before (for pagination)
      100, // Limit
      undefined, // Properties to include
      `hs_createdate >= ${since.getTime()} OR hs_lastmodifieddate >= ${since.getTime()}`
    );
    
    const notes = response.body.results || [];
    
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
    const response = await hubspot.crm.deals.basicApi.getPage(
      undefined, // After (for pagination)
      undefined, // Before (for pagination)
      100, // Limit
      undefined, // Properties to include
      `createdate >= ${since.getTime()} OR hs_lastmodifieddate >= ${since.getTime()}`
    );
    
    const deals = response.body.results || [];
    
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
