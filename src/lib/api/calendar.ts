import { google } from "googleapis";
import { prisma } from "@/lib/db/prisma";
import { generateEmbedding } from "@/lib/rag/embeddings";

// Function to get Calendar client for a user
export async function getCalendarClient(userId: string) {
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

  // Create Calendar client
  return google.calendar({ version: "v3", auth: oauth2Client });
}

// Get available time slots
export async function getAvailableTimes(
  userId: string,
  startDate: string,
  endDate: string,
  durationMinutes: number
) {
  try {
    const calendar = await getCalendarClient(userId);

    // Get busy times
    const busyTimesResponse = await calendar.freebusy.query({
      requestBody: {
        timeMin: startDate,
        timeMax: endDate,
        items: [{ id: "primary" }],
      },
    });

    const busySlots = busyTimesResponse.data.calendars?.primary?.busy || [];

    // Convert start and end dates to Date objects
    const start = new Date(startDate || new Date());
    const end = new Date(endDate || new Date());

    // Define working hours (9 AM to 5 PM)
    const workingHourStart = 9;
    const workingHourEnd = 17;

    // Generate all possible time slots
    const availableSlots = [];
    const currentDate = new Date(start);
    const durationMs = durationMinutes * 60 * 1000;

    while (currentDate < end) {
      const currentHour = currentDate.getHours();
      
      // Skip if outside working hours
      if (currentHour >= workingHourStart && currentHour < workingHourEnd) {
        const slotEnd = new Date(currentDate.getTime() + durationMs);
        
        // Check if slot overlaps with any busy time
        const isOverlapping = busySlots.some(busy => {
          const busyStart = new Date(busy.start || new Date());
          const busyEnd = new Date(busy.end || new Date());
          return (
            (currentDate >= busyStart && currentDate < busyEnd) ||
            (slotEnd > busyStart && slotEnd <= busyEnd) ||
            (currentDate <= busyStart && slotEnd >= busyEnd)
          );
        });
        
        if (!isOverlapping && slotEnd <= end) {
          availableSlots.push({
            start: currentDate.toISOString(),
            end: slotEnd.toISOString(),
          });
        }
      }
      
      // Move to next slot (30-minute increments)
      currentDate.setMinutes(currentDate.getMinutes() + 30);
    }

    return {
      availableSlots,
    };
  } catch (error) {
    console.error("Error getting available times:", error);
    return {
      success: false,
      error: "Failed to get available times",
    };
  }
}

// Create a calendar event
export async function createCalendarEvent(
  userId: string,
  title: string,
  description: string = "",
  startTime: string,
  endTime: string,
  attendees: string[] = []
) {
  try {
    const calendar = await getCalendarClient(userId);

    // Create event
    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: title,
        description,
        start: {
          dateTime: startTime,
          timeZone: "UTC",
        },
        end: {
          dateTime: endTime,
          timeZone: "UTC",
        },
        attendees: attendees.map(email => ({ email })),
      },
      sendUpdates: "all", // Send email notifications to attendees
    });

    // Generate embedding for the event content
    const content = `Title: ${title}\n\nDescription: ${description}\n\nAttendees: ${attendees.join(", ")}`;
    const embedding = await generateEmbedding(content);

    // Store in database for RAG
    await prisma.calendarEvent.create({
      data: {
        eventId: event.data.id!,
        userId,
        title,
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        attendees,
        embedding, // This would be stored using pgvector in a real implementation
      },
    });

    return {
      success: true,
      eventId: event.data.id,
      htmlLink: event.data.htmlLink,
    };
  } catch (error) {
    console.error("Error creating calendar event:", error);
    return {
      success: false,
      error: "Failed to create calendar event",
    };
  }
}

// Import calendar events for RAG
export async function importCalendarEvents(userId: string) {
  try {
    const calendar = await getCalendarClient(userId);

    // Get list of events
    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      maxResults: 100, // Adjust as needed
      singleEvents: true,
      orderBy: "startTime",
    });

    if (!response.data.items) {
      return { success: true, count: 0 };
    }

    // Process each event
    for (const event of response.data.items) {
      if (!event.id) continue;

      // Generate embedding for the event content
      const content = `Title: ${event.summary}\n\nDescription: ${event.description || ""}\n\nAttendees: ${
        event.attendees?.map(a => a.email).join(", ") || ""
      }`;
      const embedding = await generateEmbedding(content);

      // Store in database
      await prisma.calendarEvent.create({
        data: {
          eventId: event.id,
          userId,
          title: event.summary || "Untitled Event",
          description: event.description || "",
          location: event.location || "",
          startTime: new Date(event.start?.dateTime || event.start?.date || new Date()),
          endTime: new Date(event.end?.dateTime || event.end?.date || new Date()),
          attendees: event.attendees?.map(a => a.email || "") || [],
          embedding, // This would be stored using pgvector in a real implementation
        },
      });
    }

    return {
      success: true,
      count: response.data.items.length,
    };
  } catch (error) {
    console.error("Error importing calendar events:", error);
    return {
      success: false,
      error: "Failed to import calendar events",
    };
  }
}

// Handle new calendar event (webhook handler)
export async function handleNewCalendarEvent(userId: string, eventData: { eventId: string }) {
  try {
    const calendar = await getCalendarClient(userId);

    // Get event details
    const event = await calendar.events.get({
      calendarId: "primary",
      eventId: eventData.eventId,
    });

    // Generate embedding for the event content
    const content = `Title: ${event.data.summary}\n\nDescription: ${event.data.description || ""}\n\nAttendees: ${
      event.data.attendees?.map(a => a.email).join(", ") || ""
    }`;
    const embedding = await generateEmbedding(content);

    // Store in database
    await prisma.calendarEvent.create({
      data: {
        eventId: event.data.id!,
        userId,
        title: event.data.summary || "Untitled Event",
        description: event.data.description || "",
        location: event.data.location || "",
        startTime: new Date(event.data.start?.dateTime || event.data.start?.date || new Date()),
        endTime: new Date(event.data.end?.dateTime || event.data.end?.date || new Date()),
        attendees: event.data.attendees?.map(a => a.email || "") || [],
        embedding, // This would be stored using pgvector in a real implementation
      },
    });

    // Check for ongoing instructions related to calendar events
    const instructions = await prisma.instruction.findMany({
      where: {
        userId,
        active: true,
        instruction: {
          contains: "calendar",
        },
      },
    });

    // Process instructions if any
    if (instructions.length > 0) {
      // This would trigger the agent to process the calendar event based on instructions
      // For example, sending emails to attendees about the meeting
    }

    return {
      success: true,
      eventId: event.data.id,
    };
  } catch (error) {
    console.error("Error handling new calendar event:", error);
    return {
      success: false,
      error: "Failed to process new calendar event",
    };
  }
}
