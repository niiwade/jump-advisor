import { prisma } from "@/lib/db/prisma";
import { getHubspotClient } from "@/lib/api/hubspot";
import { generateEmbedding } from "@/lib/rag/search";
import { processUserRequest } from "@/lib/agents/financial-advisor-agent";

// Type definitions for HubSpot data
import { AxiosInstance } from 'axios';

// Define a custom type for the HubSpot client that extends AxiosInstance
type HubspotClient = AxiosInstance & {
  crm: {
    contacts: {
      basicApi: {
        getById: (id: string, properties: string[]) => Promise<{ body: HubspotContact }>
      }
    },
    notes: {
      basicApi: {
        getById: (id: string) => Promise<{ body: HubspotNote }>
      }
    },
    deals: {
      basicApi: {
        getById: (id: string, properties?: string[]) => Promise<{ body: HubspotDeal }>
      }
    },
    objects: {
      notes: {
        basicApi: {
          getById: (id: string) => Promise<{ body: HubspotNote }>
        },
        associationsApi: {
          getAll: (id: string, toObjectType: string) => Promise<{ 
            body: { 
              results: Array<{ id: string }> 
            } 
          }>
        }
      }
    }
  }
};

// Define the structure of HubSpot event data
interface HubspotEventData {
  objectId: string;
  objectType: string;
  eventType: string;
  subscriptionType?: string;
  [key: string]: unknown; // Allow for additional properties with safer unknown type
}

// Define the structure of HubSpot contact data
interface HubspotContact {
  id: string;
  properties: {
    firstname?: string;
    lastname?: string;
    email?: string;
    phone?: string;
    company?: string;
    website?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    [key: string]: string | undefined;
  };
}

// Define the structure of HubSpot note data
interface HubspotNote {
  id: string;
  properties: {
    hs_note_body?: string;
    hs_timestamp?: string;
    [key: string]: string | undefined;
  };
  associations?: {
    contacts?: {
      results: Array<{ id: string }>
    }
  };
}

// Define the structure of HubSpot deal data
interface HubspotDeal {
  id: string;
  properties: {
    dealname?: string;
    amount?: string;
    closedate?: string;
    dealstage?: string;
    [key: string]: string | undefined;
  };
}

/**
 * Process a HubSpot event notification
 * 
 * @param userId The user ID
 * @param eventData The event data from HubSpot
 */
export async function processHubspotEvent(
  userId: string,
  eventData: HubspotEventData
): Promise<void> {
  try {
    console.log(`Processing HubSpot event for user ${userId}`, eventData);
    
    // Get the user's HubSpot token
    const account = await prisma.account.findFirst({
      where: {
        userId,
        provider: "hubspot",
      },
    });
    
    if (!account) {
      throw new Error(`No HubSpot account found for user ${userId}`);
    }
    
    // Initialize HubSpot client
    // Use type assertion to tell TypeScript that the AxiosInstance has the HubSpot API structure
    const hubspot = await getHubspotClient(userId) as unknown as HubspotClient;
    
    // Determine the event type
    const eventType = eventData.subscriptionType;
    
    switch (eventType) {
      case "contact.creation":
      case "contact.propertyChange":
        await processContactEvent(userId, hubspot, eventData);
        break;
      
      case "note.creation":
        await processNoteEvent(userId, hubspot, eventData);
        break;
      
      case "deal.creation":
      case "deal.propertyChange":
        await processDealEvent(userId, hubspot, eventData);
        break;
      
      default:
        console.log(`Unhandled HubSpot event type: ${eventType}`);
    }
    
    // Check for any instructions that need to be processed
    await processInstructions(userId, eventData);
    
  } catch (error) {
    console.error("Error processing HubSpot event:", error);
    throw error;
  }
}

/**
 * Process a HubSpot contact event
 * 
 * @param userId The user ID
 * @param hubspot The HubSpot client
 * @param eventData The event data from HubSpot
 */
async function processContactEvent(
  userId: string,
  hubspot: HubspotClient,
  eventData: HubspotEventData
): Promise<void> {
  try {
    const contactId = eventData.objectId;
    
    // Get the full contact data from HubSpot
    const response = await hubspot.crm.contacts.basicApi.getById(contactId, [
      "email",
      "firstname",
      "lastname",
      "phone",
      "company",
      "website",
      "address",
      "city",
      "state",
      "zip",
    ]);
    
    const contact = response.body;
    
    // Extract contact properties
    const email = contact.properties.email;
    const firstName = contact.properties.firstname;
    const lastName = contact.properties.lastname;
    
    // Generate embedding for the contact
    const combinedText = `${firstName} ${lastName} ${email} ${JSON.stringify(contact.properties)}`;
    const embedding = await generateEmbedding(combinedText);
    
    // Check if the contact already exists in our database
    const existingContact = await prisma.hubspotContact.findFirst({
      where: {
        userId,
        hubspotId: String(contactId),
      },
    });
    
    if (existingContact) {
      // Update the existing contact
      await prisma.hubspotContact.update({
        where: {
          id: existingContact.id,
        },
        data: {
          email,
          firstName,
          lastName,
          properties: contact.properties,
          embedding,
        },
      });
      
      console.log(`Updated HubSpot contact: ${existingContact.id}`);
    } else {
      // Create a new contact
      const newContact = await prisma.hubspotContact.create({
        data: {
          userId,
          hubspotId: String(contactId),
          email,
          firstName,
          lastName,
          properties: contact.properties,
          embedding,
        },
      });
      
      console.log(`Created HubSpot contact: ${newContact.id}`);
    }
  } catch (error) {
    console.error(`Error processing HubSpot contact event:`, error);
    throw error;
  }
}

/**
 * Process a HubSpot note event
 * 
 * @param userId The user ID
 * @param hubspot The HubSpot client
 * @param eventData The event data from HubSpot
 */
async function processNoteEvent(
  userId: string,
  hubspot: HubspotClient,
  eventData: HubspotEventData
): Promise<void> {
  try {
    const noteId = eventData.objectId;
    
    // Get the full note data from HubSpot
    const response = await hubspot.crm.objects.notes.basicApi.getById(noteId);
    const note = response.body;
    
    // Get the associated contact ID
    const associationsResponse = await hubspot.crm.objects.notes.associationsApi.getAll(
      noteId,
      "contact"
    );
    
    if (!associationsResponse.body.results || associationsResponse.body.results.length === 0) {
      console.log(`Note ${noteId} has no associated contact`);
      return;
    }
    
    const contactId = associationsResponse.body.results[0].id;
    
    // Generate embedding for the note
    const content = note.properties.hs_note_body || "";
    const embedding = await generateEmbedding(content);
    
    // Check if the note already exists in our database
    const existingNote = await prisma.hubspotNote.findUnique({
      where: {
        hubspotId: String(noteId),
      },
    });
    
    if (existingNote) {
      // Update the existing note
      await prisma.hubspotNote.update({
        where: {
          id: existingNote.id,
        },
        data: {
          content,
          embedding,
        },
      });
      
      console.log(`Updated HubSpot note: ${existingNote.id}`);
    } else {
      // Create a new note
      const newNote = await prisma.hubspotNote.create({
        data: {
          hubspotId: String(noteId),
          contactId: String(contactId),
          content,
          createdAt: new Date(note.properties.hs_createdate || Date.now()),
          embedding,
        },
      });
      
      console.log(`Created HubSpot note: ${newNote.id}`);
    }
  } catch (error) {
    console.error(`Error processing HubSpot note event:`, error);
    throw error;
  }
}

/**
 * Process a HubSpot deal event
 * 
 * @param userId The user ID
 * @param hubspot The HubSpot client
 * @param eventData The event data from HubSpot
 */
async function processDealEvent(
  userId: string,
  hubspot: HubspotClient,
  eventData: HubspotEventData
): Promise<void> {
  try {
    const dealId = eventData.objectId;
    
    // Get the full deal data from HubSpot
    const response = await hubspot.crm.deals.basicApi.getById(dealId);
    const deal = response.body;
    
    // For now, we just log the deal data
    // In a future implementation, we could store deals in our database
    console.log(`Received deal update: ${dealId}`, deal.properties);
    
  } catch (error) {
    console.error(`Error processing HubSpot deal event:`, error);
    throw error;
  }
}

/**
 * Process any instructions that might apply to HubSpot events
 * 
 * @param userId The user ID
 * @param eventData The event data from HubSpot
 */
async function processInstructions(
  userId: string,
  eventData: HubspotEventData
): Promise<void> {
  // Get active instructions
  const instructions = await prisma.instruction.findMany({
    where: {
      userId,
      active: true,
      // Filter instructions related to HubSpot in the application code
    },
  });
  
  // Filter instructions that contain 'hubspot' in their text (case-insensitive)
  const hubspotInstructions = instructions.filter(instruction => 
    instruction.instruction.toLowerCase().includes('hubspot'));
  
  if (hubspotInstructions.length === 0) {
    return;
  }
  
  // Process each HubSpot-related instruction
  for (const instruction of hubspotInstructions) {
    try {
      // Use the agent to process the instruction
      const prompt = `
        I have a HubSpot event:
        Type: ${eventData.subscriptionType}
        Object ID: ${eventData.objectId}
        Event ID: ${eventData.eventId}
        
        I have the following instruction: "${instruction.instruction}"
        
        Should I take any action based on this HubSpot event and instruction? If yes, what action should I take?
      `;
      
      const response = await processUserRequest(userId, prompt, []);
      
      // If the response indicates action is needed, create a task
      if (response.toLowerCase().includes("yes") && !response.toLowerCase().includes("no action")) {
        await prisma.task.create({
          data: {
            userId,
            title: `Process HubSpot event: ${eventData.subscriptionType}`,
            description: response,
            type: "HUBSPOT",
            status: "PENDING",
            metadata: {
              objectId: eventData.objectId,
              eventType: eventData.subscriptionType,
              instructionId: instruction.id,
            },
          },
        });
      }
    } catch (error) {
      console.error(`Error processing instruction for HubSpot event:`, error);
    }
  }
}
