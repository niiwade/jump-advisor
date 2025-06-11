import { Message } from "ai";
import { OpenAI } from "openai";
import { prisma } from "@/lib/db/prisma";
import { searchEmails, searchContacts, searchCalendarEvents } from "@/lib/rag/search";
import { createHubspotContact } from "@/lib/api/hubspot";
import { sendEmail } from "@/lib/api/gmail";
import { createCalendarEvent, getAvailableTimes } from "@/lib/api/calendar";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define tool schemas for the agent
const tools = [
  {
    type: "function",
    function: {
      name: "search_emails",
      description: "Search through user emails for relevant information",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to find relevant emails",
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_contacts",
      description: "Search through HubSpot contacts for relevant information",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to find relevant contacts",
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_calendar",
      description: "Search through calendar events for relevant information",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to find relevant calendar events",
          },
          startDate: {
            type: "string",
            description: "Start date in ISO format",
          },
          endDate: {
            type: "string",
            description: "End date in ISO format",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_available_times",
      description: "Get available time slots from the user's calendar",
      parameters: {
        type: "object",
        properties: {
          startDate: {
            type: "string",
            description: "Start date in ISO format",
          },
          endDate: {
            type: "string",
            description: "End date in ISO format",
          },
          duration: {
            type: "number",
            description: "Duration of the meeting in minutes",
          },
        },
        required: ["startDate", "endDate", "duration"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email to a recipient",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "Email address of the recipient",
          },
          subject: {
            type: "string",
            description: "Subject of the email",
          },
          body: {
            type: "string",
            description: "Body content of the email",
          },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Create a new calendar event",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Title of the event",
          },
          description: {
            type: "string",
            description: "Description of the event",
          },
          startTime: {
            type: "string",
            description: "Start time in ISO format",
          },
          endTime: {
            type: "string",
            description: "End time in ISO format",
          },
          attendees: {
            type: "array",
            items: {
              type: "string",
            },
            description: "List of attendee email addresses",
          },
        },
        required: ["title", "startTime", "endTime"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_hubspot_contact",
      description: "Create a new contact in HubSpot",
      parameters: {
        type: "object",
        properties: {
          email: {
            type: "string",
            description: "Email address of the contact",
          },
          firstName: {
            type: "string",
            description: "First name of the contact",
          },
          lastName: {
            type: "string",
            description: "Last name of the contact",
          },
          notes: {
            type: "string",
            description: "Additional notes about the contact",
          },
        },
        required: ["email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_instruction",
      description: "Save an ongoing instruction from the user",
      parameters: {
        type: "object",
        properties: {
          instruction: {
            type: "string",
            description: "The instruction to save",
          },
        },
        required: ["instruction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_instructions",
      description: "Get all active ongoing instructions",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a new task for the agent to track",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Title of the task",
          },
          description: {
            type: "string",
            description: "Description of the task",
          },
          type: {
            type: "string",
            enum: ["EMAIL", "CALENDAR", "HUBSPOT", "GENERAL"],
            description: "Type of task",
          },
          metadata: {
            type: "object",
            description: "Additional metadata for the task",
          },
        },
        required: ["title", "type"],
      },
    },
  },
];

// Tool implementations
async function handleToolCall(userId: string, toolCall: any) {
  const { name, arguments: args } = toolCall.function;
  const parsedArgs = JSON.parse(args);

  switch (name) {
    case "search_emails":
      return await searchEmails(userId, parsedArgs.query, parsedArgs.limit || 5);
    case "search_contacts":
      return await searchContacts(userId, parsedArgs.query, parsedArgs.limit || 5);
    case "search_calendar":
      return await searchCalendarEvents(
        userId,
        parsedArgs.query,
        parsedArgs.startDate,
        parsedArgs.endDate
      );
    case "get_available_times":
      return await getAvailableTimes(
        userId,
        parsedArgs.startDate,
        parsedArgs.endDate,
        parsedArgs.duration
      );
    case "send_email":
      return await sendEmail(userId, parsedArgs.to, parsedArgs.subject, parsedArgs.body);
    case "create_calendar_event":
      return await createCalendarEvent(
        userId,
        parsedArgs.title,
        parsedArgs.description,
        parsedArgs.startTime,
        parsedArgs.endTime,
        parsedArgs.attendees
      );
    case "create_hubspot_contact":
      return await createHubspotContact(
        userId,
        parsedArgs.email,
        parsedArgs.firstName,
        parsedArgs.lastName,
        parsedArgs.notes
      );
    case "save_instruction":
      await prisma.instruction.create({
        data: {
          userId,
          instruction: parsedArgs.instruction,
          active: true,
        },
      });
      return { success: true, message: "Instruction saved successfully" };
    case "get_instructions":
      const instructions = await prisma.instruction.findMany({
        where: {
          userId,
          active: true,
        },
      });
      return { instructions: instructions.map(i => i.instruction) };
    case "create_task":
      const task = await prisma.task.create({
        data: {
          userId,
          title: parsedArgs.title,
          description: parsedArgs.description || "",
          type: parsedArgs.type,
          metadata: parsedArgs.metadata || {},
          status: "PENDING",
        },
      });
      return { success: true, taskId: task.id };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Get context for the agent
async function getContext(userId: string) {
  // Get active instructions
  const instructions = await prisma.instruction.findMany({
    where: {
      userId,
      active: true,
    },
  });

  // Get pending tasks
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      status: {
        in: ["PENDING", "IN_PROGRESS", "WAITING_FOR_RESPONSE"],
      },
    },
  });

  return {
    instructions: instructions.map(i => i.instruction),
    pendingTasks: tasks.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      type: t.type,
    })),
  };
}

// Process a user request
export async function processUserRequest(
  userId: string,
  userMessage: string,
  chatHistory: Message[]
) {
  try {
    // Get context for the agent
    const context = await getContext(userId);

    // Create system message with context
    const systemMessage = `You are an AI assistant for financial advisors. You help manage client relationships by integrating with Gmail, Google Calendar, and HubSpot.
    
    Current ongoing instructions: ${JSON.stringify(context.instructions)}
    
    Current pending tasks: ${JSON.stringify(context.pendingTasks)}
    
    Your capabilities:
    1. Search through emails and HubSpot contacts to answer questions about clients
    2. Schedule appointments and manage calendar events
    3. Send emails on behalf of the financial advisor
    4. Create and update contacts in HubSpot
    5. Remember and follow ongoing instructions
    
    When asked about a person and it's ambiguous who the user is referring to, search contacts and ask for clarification.
    When handling tasks like scheduling appointments, use the appropriate tools to complete the task.
    Always be helpful, professional, and concise in your responses.`;

    // Format chat history for OpenAI
    const messages = [
      { role: "system", content: systemMessage },
      ...chatHistory.slice(-10), // Include last 10 messages for context
    ];

    // Call OpenAI with function calling
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages,
      tools,
      tool_choice: "auto",
    });

    const responseMessage = response.choices[0].message;

    // Check if the model wants to call a function
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      // Handle each tool call
      const toolResults = await Promise.all(
        responseMessage.tool_calls.map(async (toolCall) => {
          const result = await handleToolCall(userId, toolCall);
          return {
            tool_call_id: toolCall.id,
            role: "tool",
            name: toolCall.function.name,
            content: JSON.stringify(result),
          };
        })
      );

      // Send the results back to the model to generate a final response
      const secondResponse = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [
          ...messages,
          responseMessage,
          ...toolResults,
        ],
      });

      return secondResponse.choices[0].message.content || "I've processed your request.";
    }

    return responseMessage.content || "I'm not sure how to respond to that.";
  } catch (error) {
    console.error("Error processing user request:", error);
    return "I'm sorry, I encountered an error while processing your request. Please try again.";
  }
}
