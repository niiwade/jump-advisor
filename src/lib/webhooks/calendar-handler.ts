import { prisma } from "@/lib/db/prisma";
import { getCalendarClient } from "@/lib/api/calendar";
import { generateEmbedding } from "@/lib/rag/search";
import { processUserRequest } from "@/lib/agents/financial-advisor-agent";

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
    const calendar = await getCalendarClient(account);
    
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
    await processCalendarEvent(userId, event.data);
    
    // Check for any instructions that need to be processed
    await processInstructions(userId, event.data);
    
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
async function processCalendarEvent(
  userId: string,
  eventData: any
): Promise<void> {
  try {
    // Extract event data
    const {
      id: eventId,
      summary: title,
      description = "",
      location = "",
      start,
      end,
      attendees = [],
    } = eventData;
    
    // Convert attendees to our format
    const attendeeEmails = attendees.map((a: any) => a.email);
    
    // Generate embedding for the event content
    const combinedText = `${title} ${description} ${location} ${attendeeEmails.join(" ")}`;
    const embedding = await generateEmbedding(combinedText);
    
    // Check if the event already exists in our database
    const existingEvent = await prisma.calendarEvent.findUnique({
      where: {
        userId_eventId: {
          userId,
          eventId,
        },
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
          description,
          location,
          startTime: new Date(start.dateTime || start.date),
          endTime: new Date(end.dateTime || end.date),
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
          description,
          location,
          startTime: new Date(start.dateTime || start.date),
          endTime: new Date(end.dateTime || end.date),
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
  eventData: any
): Promise<void> {
  // Get active instructions
  const instructions = await prisma.instruction.findMany({
    where: {
      userId,
      active: true,
      type: "CALENDAR",
    },
  });
  
  if (instructions.length === 0) {
    return;
  }
  
  // Extract event data
  const {
    id: eventId,
    summary: title,
    description = "",
    location = "",
    start,
    end,
    attendees = [],
  } = eventData;
  
  // Process each instruction
  for (const instruction of instructions) {
    try {
      // Use the agent to process the instruction
      const prompt = `
        I have a calendar event:
        Title: ${title}
        Description: ${description}
        Location: ${location}
        Start: ${start.dateTime || start.date}
        End: ${end.dateTime || end.date}
        Attendees: ${attendees.map((a: any) => a.email).join(", ")}
        
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
            type: "CALENDAR_INSTRUCTION",
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
