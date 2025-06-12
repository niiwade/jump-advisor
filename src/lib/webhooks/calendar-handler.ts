import { prisma } from "@/lib/db/prisma";
import { getCalendarClient } from "@/lib/api/calendar";
import { processUserRequest } from "@/lib/agents/financial-advisor-agent";

// Helper function to safely parse dates with fallback
function safeParseDate(dateTime?: string, date?: string): Date {
  if (dateTime) return new Date(dateTime);
  if (date) return new Date(date);
  return new Date(); // Fallback to current date if both are undefined
}

// Helper function to generate embeddings
async function generateEmbedding(text: string) {
  const openai = new (await import("openai")).OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  
  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
  });
  
  return response.data[0].embedding;
}

/**
 * Process a calendar update notification
 * 
 * @param userId The user ID
 * @param resourceId The resource ID that changed
 * @param resourceState The state of the resource (exists, sync, not_exists)
 */
export async function processCalendarUpdate(
  userId: string,
  resourceId: string,
  resourceState: string
): Promise<void> {
  try {
    console.log(`Processing calendar update for user ${userId}, resource ${resourceId}, state ${resourceState}`);
    
    // Get the user's Google Calendar token
    const account = await prisma.account.findFirst({
      where: {
        userId,
        provider: "google",
      },
    });
    
    if (!account) {
      throw new Error(`No Google account found for user ${userId}`);
    }
    
    // Initialize Calendar client
    const calendar = await getCalendarClient(userId);
    
    // If the resource is deleted, remove it from our database
    if (resourceState === "not_exists") {
      await handleDeletedEvent(userId, resourceId);
      return;
    }
    
    // Get the updated event
    const event = await calendar.events.get({
      calendarId: "primary",
      eventId: resourceId,
    });
    
    if (!event.data) {
      console.log(`No event data found for ${resourceId}`);
      return;
    }
    
    // Process the event
    if (event.data && event.data.id) {
      await processCalendarEvent(userId, {
        id: event.data.id,
        summary: event.data.summary || '',
        description: event.data.description || '',
        location: event.data.location || '',
        start: event.data.start ? {
          dateTime: event.data.start.dateTime || undefined,
          date: event.data.start.date || undefined
        } : undefined,
        end: event.data.end ? {
          dateTime: event.data.end.dateTime || undefined,
          date: event.data.end.date || undefined
        } : undefined,
        attendees: event.data.attendees?.map(attendee => ({ 
          email: attendee.email || undefined 
        })) || []
      });
    }
    
    // Check for any instructions that need to be processed
    if (event.data && event.data.id) {
      await processInstructions(userId, {
        id: event.data.id,
        summary: event.data.summary || '',
        description: event.data.description || '',
        location: event.data.location || '',
        start: event.data.start ? {
          dateTime: event.data.start.dateTime || undefined,
          date: event.data.start.date || undefined
        } : undefined,
        end: event.data.end ? {
          dateTime: event.data.end.dateTime || undefined,
          date: event.data.end.date || undefined
        } : undefined,
        attendees: event.data.attendees?.map(attendee => ({ 
          email: attendee.email || undefined 
        })) || []
      });
    }
    
  } catch (error) {
    console.error("Error processing calendar update:", error);
    throw error;
  }
}

/**
 * Process a calendar event
 * 
 * @param userId The user ID
 * @param eventData The event data from Google Calendar
 */
export async function processCalendarEvent(
  userId: string,
  eventData: {
    id: string;
    summary?: string;
    description?: string;
    location?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    attendees?: Array<{ email?: string }>;
  }
): Promise<void> {
  try {
    // Extract event data
    const {
      id: eventId,
      summary: title = "",
      description: descriptionRaw = "",
      location: locationRaw = "",
      start,
      end,
      attendees = [],
    } = eventData;
    
    // Ensure these are always strings for TypeScript
    const description: string = descriptionRaw;
    const location: string = locationRaw;
    
    // Convert attendees to our format
    const attendeeEmails = attendees?.map(a => a.email || '').filter(Boolean) || [];
    
    // Generate embedding for the event content
    const combinedText = `${title} ${description} ${location} ${attendeeEmails.join(" ")}`;
    const embedding = await generateEmbedding(combinedText);
    
    // Parse dates safely
    const startTime = safeParseDate(start?.dateTime, start?.date);
    const endTime = safeParseDate(end?.dateTime, end?.date);
    
    // Check if the event already exists in our database
    const existingEvent = await prisma.calendarEvent.findFirst({
      where: {
        userId,
        eventId,
      },
    });
    
    if (existingEvent) {
      // Update the existing event
      await prisma.calendarEvent.update({
        where: {
          id: existingEvent.id,
        },
        data: {
          title,
          description: description || "",  // Ensure description is always a string
          location,
          startTime,
          endTime,
          attendees: attendeeEmails,
          embedding,
        },
      });
      
      console.log(`Updated calendar event: ${existingEvent.id}`);
    } else {
      // Create a new event
      const newEvent = await prisma.calendarEvent.create({
        data: {
          userId,
          eventId,
          title,
          description: description || "",  // Ensure description is always a string
          location,
          startTime,
          endTime,
          attendees: attendeeEmails,
          embedding,
        },
      });
      
      console.log(`Created calendar event: ${newEvent.id}`);
    }
  } catch (error) {
    console.error(`Error processing calendar event:`, error);
    throw error;
  }
}

/**
 * Handle a deleted calendar event
 * 
 * @param userId The user ID
 * @param eventId The event ID
 */
async function handleDeletedEvent(
  userId: string,
  eventId: string
): Promise<void> {
  try {
    // Delete the event from our database
    await prisma.calendarEvent.deleteMany({
      where: {
        userId,
        eventId,
      },
    });
    
    console.log(`Deleted calendar event: ${eventId}`);
  } catch (error) {
    console.error(`Error handling deleted event ${eventId}:`, error);
    throw error;
  }
}

/**
 * Process any instructions that might apply to calendar events
 * 
 * @param userId The user ID
 * @param eventData The event data from Google Calendar
 */
async function processInstructions(
  userId: string,
  eventData: {
    id: string;
    summary?: string;
    description?: string;
    location?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    attendees?: Array<{ email?: string }>;
  }
): Promise<void> {
  // Get active instructions
  const instructions = await prisma.instruction.findMany({
    where: {
      userId,
      active: true,
      instruction: {
        contains: "calendar",
      },
    },
  });
  
  if (instructions.length === 0) {
    return;
  }
  
  // Extract event data
  const {
    id: eventId,
    summary: title = "",
    description: descriptionRaw = "",
    location: locationRaw = "",
    start,
    end,
    attendees = [],
  } = eventData;
  
  // Ensure these are always strings for TypeScript
  const description: string = descriptionRaw;
  const location: string = locationRaw;
  
  // Process each instruction
  for (const instruction of instructions) {
    try {
      // Use the agent to process the instruction
      const prompt = `
        I have a calendar event:
        Title: ${title}
        Description: ${description}
        Location: ${location}
        Start: ${start?.dateTime || start?.date || 'Not specified'}
        End: ${end?.dateTime || end?.date || 'Not specified'}
        Attendees: ${attendees?.map(a => a.email || '').filter(Boolean).join(", ") || "None"}
        
        I have the following instruction: "${instruction.instruction}"
        
        Should I take any action based on this calendar event and instruction? If yes, what action should I take?
      `;
      
      const response = await processUserRequest(userId, prompt, []);
      
      // If the response indicates action is needed, create a task
      if (response.toLowerCase().includes("yes") && !response.toLowerCase().includes("no action")) {
        await prisma.task.create({
          data: {
            userId,
            title: `Process calendar event: ${title}`,
            description: response,
            type: "EMAIL", // Using an existing TaskType value
            status: "PENDING",
            metadata: {
              eventId,
              instructionId: instruction.id,
            },
          },
        });
      }
    } catch (error) {
      console.error(`Error processing instruction for event ${eventId}:`, error);
    }
  }
}
