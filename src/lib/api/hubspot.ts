import axios from "axios";
import { prisma } from "@/lib/db/prisma";
import { generateEmbedding } from "@/lib/rag/embeddings";

// Function to get HubSpot API client for a user
export async function getHubspotClient(userId: string) {
  // Get the user's HubSpot OAuth tokens
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "hubspot",
    },
  });

  if (!account) {
    throw new Error("HubSpot account not connected");
  }

  // Create API client with authentication
  return axios.create({
    baseURL: "https://api.hubapi.com",
    headers: {
      Authorization: `Bearer ${account.access_token}`,
      "Content-Type": "application/json",
    },
  });
}

// Create a contact in HubSpot
export async function createHubspotContact(
  userId: string,
  email: string,
  firstName?: string,
  lastName?: string,
  notes?: string
) {
  try {
    const hubspot = await getHubspotClient(userId);

    // Create contact in HubSpot
    const response = await hubspot.post("/crm/v3/objects/contacts", {
      properties: {
        email,
        firstname: firstName,
        lastname: lastName,
      },
    });

    const contactId = response.data.id;

    // Add note if provided
    if (notes && contactId) {
      await hubspot.post("/crm/v3/objects/notes", {
        properties: {
          hs_note_body: notes,
          hs_timestamp: Date.now(),
        },
        associations: [
          {
            to: {
              id: contactId,
            },
            types: [
              {
                category: "HUBSPOT_DEFINED",
                typeId: 1,
              },
            ],
          },
        ],
      });
    }

    // Generate embedding for the contact data
    const content = `Email: ${email}\n\nFirst Name: ${firstName || ""}\n\nLast Name: ${lastName || ""}\n\nNotes: ${notes || ""}`;
    const embedding = await generateEmbedding(content);

    // Store in database for RAG
    const contact = await prisma.hubspotContact.create({
      data: {
        hubspotId: contactId,
        userId,
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        properties: response.data.properties,
        embedding, // This would be stored using pgvector in a real implementation
      },
    });

    // If notes were provided, store them separately for RAG
    if (notes) {
      const noteEmbedding = await generateEmbedding(notes);
      await prisma.hubspotNote.create({
        data: {
          hubspotId: `note-${Date.now()}`, // Using timestamp as a placeholder
          contactId: contact.id,
          content: notes,
          embedding: noteEmbedding, // This would be stored using pgvector in a real implementation
        },
      });
    }

    // Check for ongoing instructions related to contact creation
    const instructions = await prisma.instruction.findMany({
      where: {
        userId,
        active: true,
        instruction: {
          contains: "contact",
        },
      },
    });

    // Process instructions if any
    if (instructions.length > 0) {
      // This would trigger the agent to process based on instructions
      // For example, sending a welcome email to the new contact
    }

    return {
      success: true,
      contactId,
    };
  } catch (error) {
    console.error("Error creating HubSpot contact:", error);
    return {
      success: false,
      error: "Failed to create contact",
    };
  }
}

// Get contact details from HubSpot
export async function getHubspotContact(userId: string, email: string) {
  try {
    const hubspot = await getHubspotClient(userId);

    // Search for contact by email
    const response = await hubspot.get("/crm/v3/objects/contacts/search", {
      data: {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "email",
                operator: "EQ",
                value: email,
              },
            ],
          },
        ],
      },
    });

    if (response.data.results && response.data.results.length > 0) {
      const contact = response.data.results[0];
      return {
        success: true,
        contact: {
          id: contact.id,
          properties: contact.properties,
        },
      };
    }

    return {
      success: false,
      error: "Contact not found",
    };
  } catch (error) {
    console.error("Error getting HubSpot contact:", error);
    return {
      success: false,
      error: "Failed to get contact",
    };
  }
}

// Import contacts from HubSpot for RAG
export async function importHubspotContacts(userId: string) {
  try {
    const hubspot = await getHubspotClient(userId);

    // Get list of contacts
    const response = await hubspot.get("/crm/v3/objects/contacts", {
      params: {
        limit: 100, // Adjust as needed
      },
    });

    if (!response.data.results) {
      return { success: true, count: 0 };
    }

    // Process each contact
    for (const contact of response.data.results) {
      // Generate embedding for the contact data
      const content = `Email: ${contact.properties.email || ""}\n\nFirst Name: ${
        contact.properties.firstname || ""
      }\n\nLast Name: ${contact.properties.lastname || ""}`;
      const embedding = await generateEmbedding(content);

      // Store in database
      await prisma.hubspotContact.create({
        data: {
          hubspotId: contact.id,
          userId,
          email: contact.properties.email || null,
          firstName: contact.properties.firstname || null,
          lastName: contact.properties.lastname || null,
          properties: contact.properties,
          embedding, // This would be stored using pgvector in a real implementation
        },
      });

      // Get notes for this contact
      try {
        const notesResponse = await hubspot.get(
          `/crm/v3/objects/contacts/${contact.id}/associations/notes`
        );

        if (notesResponse.data.results) {
          for (const association of notesResponse.data.results) {
            const noteId = association.id;
            const noteResponse = await hubspot.get(`/crm/v3/objects/notes/${noteId}`);
            const noteContent = noteResponse.data.properties.hs_note_body;

            // Generate embedding for the note
            const noteEmbedding = await generateEmbedding(noteContent);

            // Store note in database
            await prisma.hubspotNote.create({
              data: {
                hubspotId: noteId,
                contactId: contact.id,
                content: noteContent,
                embedding: noteEmbedding, // This would be stored using pgvector in a real implementation
              },
            });
          }
        }
      } catch (noteError) {
        console.error(`Error fetching notes for contact ${contact.id}:`, noteError);
      }
    }

    return {
      success: true,
      count: response.data.results.length,
    };
  } catch (error) {
    console.error("Error importing HubSpot contacts:", error);
    return {
      success: false,
      error: "Failed to import contacts",
    };
  }
}

// Handle new contact creation in HubSpot (webhook handler)
export async function handleNewHubspotContact(userId: string, contactData: { objectId: string }) {
  try {
    const hubspot = await getHubspotClient(userId);

    // Get contact details
    const response = await hubspot.get(`/crm/v3/objects/contacts/${contactData.objectId}`);
    const contact = response.data;

    // Generate embedding for the contact data
    const content = `Email: ${contact.properties.email || ""}\n\nFirst Name: ${
      contact.properties.firstname || ""
    }\n\nLast Name: ${contact.properties.lastname || ""}`;
    const embedding = await generateEmbedding(content);

    // Store in database
    await prisma.hubspotContact.create({
      data: {
        hubspotId: contact.id,
        userId,
        email: contact.properties.email || null,
        firstName: contact.properties.firstname || null,
        lastName: contact.properties.lastname || null,
        properties: contact.properties,
        embedding, // This would be stored using pgvector in a real implementation
      },
    });

    // Check for ongoing instructions related to contact creation
    const instructions = await prisma.instruction.findMany({
      where: {
        userId,
        active: true,
        instruction: {
          contains: "contact",
        },
      },
    });

    // Process instructions if any
    if (instructions.length > 0) {
      // This would trigger the agent to process based on instructions
      // For example, sending a welcome email to the new contact
    }

    return {
      success: true,
      contactId: contact.id,
    };
  } catch (error) {
    console.error("Error handling new HubSpot contact:", error);
    return {
      success: false,
      error: "Failed to process new contact",
    };
  }
}
