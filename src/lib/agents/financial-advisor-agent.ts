import { Message } from "ai";
import { OpenAI } from "openai";
import { prisma } from "@/lib/db/prisma";
import { searchEmails, searchContacts, searchCalendarEvents } from "@/lib/rag/search";
import { createHubspotContact } from "@/lib/api/hubspot";
import { sendEmail } from "@/lib/api/gmail";
import { createCalendarEvent, getAvailableTimes } from "@/lib/api/calendar";
import { handleContactDisambiguation, resolveDisambiguation } from "@/lib/contacts/disambiguation";
import { TaskStatus, TaskType } from "@prisma/client";
import { ChatCompletionMessageParam } from "openai/resources";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define tool schemas for the agent
const tools = [
  {
    type: "function" as const,
    function: {
      name: "disambiguate_contact",
      description: "Check if a contact reference is ambiguous and needs disambiguation",
      parameters: {
        type: "object",
        properties: {
          contactReference: {
            type: "string",
            description: "The contact name, email, or description to check for ambiguity",
          },
          context: {
            type: "string",
            description: "Additional context about why disambiguation is needed",
          },
        },
        required: ["contactReference"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "resolve_disambiguation",
      description: "Resolve a contact disambiguation task with the selected contact",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "The disambiguation task ID",
          },
          selectedContactId: {
            type: "string",
            description: "The ID of the selected contact",
          },
        },
        required: ["taskId", "selectedContactId"],
      },
    },
  },
  {
    type: "function" as const,
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
  {
    type: "function" as const,
    function: {
      name: "search_contacts",
      description: "Search through contacts",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
          limit: {
            type: "number",
            description: "The maximum number of results to return",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_calendar",
      description: "Search through calendar events",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
          startDate: {
            type: "string",
            description: "The start date of the search range",
          },
          endDate: {
            type: "string",
            description: "The end date of the search range",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_available_times",
      description: "Get available time slots",
      parameters: {
        type: "object",
        properties: {
          startDate: {
            type: "string",
            description: "The start date of the search range",
          },
          endDate: {
            type: "string",
            description: "The end date of the search range",
          },
          duration: {
            type: "number",
            description: "The duration of the meeting",
          },
        },
        required: ["startDate", "endDate", "duration"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "send_email",
      description: "Send an email",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "The recipient's email address",
          },
          subject: {
            type: "string",
            description: "The subject of the email",
          },
          body: {
            type: "string",
            description: "The body of the email",
          },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_calendar_event",
      description: "Create a calendar event",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The title of the event",
          },
          startTime: {
            type: "string",
            description: "The start time of the event",
          },
          endTime: {
            type: "string",
            description: "The end time of the event",
          },
          description: {
            type: "string",
            description: "The description of the event",
          },
          attendees: {
            type: "array",
            items: {
              type: "string",
            },
            description: "The attendees of the event",
          },
        },
        required: ["title", "startTime", "endTime"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_hubspot_contact",
      description: "Create a HubSpot contact",
      parameters: {
        type: "object",
        properties: {
          email: {
            type: "string",
            description: "The email address of the contact",
          },
          firstName: {
            type: "string",
            description: "The first name of the contact",
          },
          lastName: {
            type: "string",
            description: "The last name of the contact",
          },
          company: {
            type: "string",
            description: "The company of the contact",
          },
          jobTitle: {
            type: "string",
            description: "The job title of the contact",
          },
        },
        required: ["email"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "save_instruction",
      description: "Save an instruction",
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
    type: "function" as const,
    function: {
      name: "get_instructions",
      description: "Get instructions",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description: "Create a task",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The title of the task",
          },
          description: {
            type: "string",
            description: "The description of the task",
          },
          type: {
            type: "string",
            enum: ["EMAIL", "CALENDAR", "HUBSPOT", "GENERAL"],
            description: "The type of the task",
          },
          metadata: {
            type: "object",
            description: "The metadata of the task",
          },
        },
        required: ["title", "type"],
      },
    },
  },
];

// Tool implementations
async function handleToolCall(userId: string, toolCall: { function: { name: string, arguments: string } }) {
  const { name, arguments: argsString } = toolCall.function;
  const parsedArgs = JSON.parse(argsString);

  switch (name) {
    case "disambiguate_contact":
      return handleContactDisambiguation(
        userId,
        parsedArgs.contactReference,
        parsedArgs.context || ""
      );
    case "resolve_disambiguation":
      return resolveDisambiguation(
        parsedArgs.taskId,
        parsedArgs.selectedContactId
      );
    case "search_emails":
      return searchEmails(userId, parsedArgs.query, parsedArgs.limit || 5);
    case "search_contacts":
      return searchContacts(userId, parsedArgs.query, parsedArgs.limit || 5);
    case "search_calendar":
      return searchCalendarEvents(userId, parsedArgs.query, parsedArgs.startDate, parsedArgs.endDate);
    case "get_available_times":
      return getAvailableTimes(userId, parsedArgs.startDate, parsedArgs.endDate, parsedArgs.duration);
    case "send_email":
      return sendEmail(userId, parsedArgs.to, parsedArgs.subject, parsedArgs.body);
    case "create_calendar_event":
      return createCalendarEvent(
        userId,
        parsedArgs.title,
        parsedArgs.startTime,
        parsedArgs.endTime,
        parsedArgs.description,
        parsedArgs.attendees
      );
    case "create_hubspot_contact":
      return createHubspotContact(
        userId,
        parsedArgs.email,
        parsedArgs.firstName,
        parsedArgs.lastName
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

  // Get disambiguation tasks specifically
  const disambiguationTasks = await prisma.task.findMany({
    where: {
      userId,
      type: "CONTACT_DISAMBIGUATION" as TaskType,
      status: TaskStatus.WAITING_FOR_RESPONSE,
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
    disambiguationTasks: disambiguationTasks.length > 0 ? disambiguationTasks : undefined,
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
    ${context.disambiguationTasks ? `
    IMPORTANT - You have active contact disambiguation tasks:
    ${JSON.stringify(context.disambiguationTasks.map(t => {
      const metadata = t.metadata as Record<string, unknown> || {};
      const potentialContacts = (metadata.potentialContacts as Array<Record<string, unknown>>) || [];
      return {
        id: t.id,
        title: t.title,
        contactReference: metadata.contactReference,
        potentialContacts: potentialContacts.map(c => ({
          id: c.id,
          name: [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unknown',
          email: c.email || 'No email',
          similarity: c.similarity
        }))
      };
    }))}
    
    When you see disambiguation tasks, help the user select the correct contact from the options.
    ` : ''}
    
    Your capabilities:
    1. Search through emails and HubSpot contacts to answer questions about clients
    2. Schedule appointments and manage calendar events
    3. Send emails on behalf of the financial advisor
    4. Create and update contacts in HubSpot
    5. Remember and follow ongoing instructions
    6. Disambiguate contact references when they are ambiguous
    
    When asked about a person and it's ambiguous who the user is referring to:
    1. Use the disambiguate_contact tool to check if disambiguation is needed
    2. If disambiguation is needed, explain to the user that there are multiple potential matches
    3. Present the options clearly with names and emails
    4. Ask the user to select the correct contact
    5. Once selected, use resolve_disambiguation to complete the process
    
    When handling tasks like scheduling appointments, use the appropriate tools to complete the task.
    Always be helpful, professional, and concise in your responses.`;

    // Format chat history for OpenAI
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemMessage },
      ...chatHistory.slice(-10).map(msg => ({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content
      })),
    ];

    // Call OpenAI with function calling
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages,
      tools: tools as unknown as Array<{
        type: "function";
        function: {
          name: string;
          description: string;
          parameters: Record<string, unknown>;
        };
      }>,
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
          responseMessage as ChatCompletionMessageParam,
          ...toolResults as ChatCompletionMessageParam[],
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
