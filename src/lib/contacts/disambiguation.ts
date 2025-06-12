import { prisma } from "@/lib/db/prisma";
import { searchContacts } from "@/lib/rag/search";
import { TaskStatus, TaskType } from "@prisma/client";

/**
 * Interface for a contact with disambiguation information
 */
export interface ContactWithScore {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  properties: Record<string, unknown>;
  similarity: number;
  notes?: Array<{
    id: string;
    content: string;
    createdAt: Date;
    similarity: number;
  }>;
}

/**
 * Interface for disambiguation result
 */
export interface DisambiguationResult {
  isAmbiguous: boolean;
  contacts: ContactWithScore[];
  originalQuery: string;
  taskId?: string;
}

/**
 * Find contacts that match a given name or description
 * 
 * @param userId The user ID
 * @param query The contact name or description to search for
 * @param threshold The similarity threshold for considering a match (0-1)
 * @param limit Maximum number of contacts to return
 * @returns Array of matching contacts with similarity scores
 */
export async function findPotentialContacts(
  userId: string,
  query: string,
  threshold: number = 0.7,
  limit: number = 5
): Promise<ContactWithScore[]> {
  try {
    // Search contacts using vector similarity
    const searchResults = await searchContacts(userId, query, limit * 2); // Get more results than needed to filter by threshold
    
    // Filter results by similarity threshold
    const filteredContacts = searchResults.results
      .filter(contact => contact.similarity >= threshold)
      .slice(0, limit);
    
    return filteredContacts;
  } catch (error) {
    console.error("Error finding potential contacts:", error);
    return [];
  }
}

/**
 * Check if a contact reference is ambiguous and needs disambiguation
 * 
 * @param userId The user ID
 * @param contactReference The contact reference (name, email, etc.)
 * @returns Disambiguation result with matching contacts if ambiguous
 */
export async function checkContactAmbiguity(
  userId: string,
  contactReference: string
): Promise<DisambiguationResult> {
  try {
    // First check for exact email match (not ambiguous if exact email match)
    if (contactReference.includes('@')) {
      const exactEmailMatch = await prisma.hubspotContact.findFirst({
        where: {
          userId,
          email: contactReference,
        },
      });
      
      if (exactEmailMatch) {
        return {
          isAmbiguous: false,
          contacts: [{
            id: exactEmailMatch.id,
            email: exactEmailMatch.email,
            firstName: exactEmailMatch.firstName,
            lastName: exactEmailMatch.lastName,
            properties: exactEmailMatch.properties as Record<string, unknown>,
            similarity: 1.0,
          }],
          originalQuery: contactReference,
        };
      }
    }
    
    // Find potential matching contacts
    const potentialContacts = await findPotentialContacts(userId, contactReference);
    
    // Determine if the reference is ambiguous
    // It's ambiguous if:
    // 1. There are multiple potential matches (more than 1)
    // 2. The top match has a similarity below the high confidence threshold (0.9)
    const isAmbiguous = potentialContacts.length > 1 || 
      (potentialContacts.length === 1 && potentialContacts[0].similarity < 0.9);
    
    return {
      isAmbiguous,
      contacts: potentialContacts,
      originalQuery: contactReference,
    };
  } catch (error) {
    console.error("Error checking contact ambiguity:", error);
    return {
      isAmbiguous: false,
      contacts: [],
      originalQuery: contactReference,
    };
  }
}

/**
 * Create a disambiguation task for the user to resolve
 * 
 * @param userId The user ID
 * @param contactReference The original contact reference
 * @param potentialContacts Array of potential matching contacts
 * @param context Additional context about why disambiguation is needed
 * @returns The created task ID
 */
export async function createDisambiguationTask(
  userId: string,
  contactReference: string,
  potentialContacts: ContactWithScore[],
  context: string
): Promise<string> {
  try {
    // Create a task for the user to disambiguate the contact
    const task = await prisma.task.create({
      data: {
        userId,
        title: `Disambiguate contact: ${contactReference}`,
        description: `Please select the correct contact for "${contactReference}"`,
        type: TaskType.GENERAL, // Using a valid TaskType enum value
        status: TaskStatus.WAITING_FOR_RESPONSE,
        waitingFor: "Contact selection",
        waitingSince: new Date(),
        metadata: {
          contactReference,
          potentialContacts: potentialContacts.map(contact => ({
            id: contact.id,
            email: contact.email,
            firstName: contact.firstName,
            lastName: contact.lastName,
            similarity: contact.similarity,
          })),
          context,
        },
      },
    });
    
    return task.id;
  } catch (error) {
    console.error("Error creating disambiguation task:", error);
    throw error;
  }
}

/**
 * Handle the disambiguation process for an ambiguous contact reference
 * 
 * @param userId The user ID
 * @param contactReference The contact reference to disambiguate
 * @param context Additional context about why disambiguation is needed
 * @returns Disambiguation result with task ID if disambiguation is needed
 */
export async function handleContactDisambiguation(
  userId: string,
  contactReference: string,
  context: string = ""
): Promise<DisambiguationResult> {
  try {
    // Check if the contact reference is ambiguous
    const ambiguityResult = await checkContactAmbiguity(userId, contactReference);
    
    // If not ambiguous or no contacts found, return the result
    if (!ambiguityResult.isAmbiguous || ambiguityResult.contacts.length === 0) {
      return ambiguityResult;
    }
    
    // Create a disambiguation task
    const taskId = await createDisambiguationTask(
      userId,
      contactReference,
      ambiguityResult.contacts,
      context
    );
    
    // Return the disambiguation result with task ID
    return {
      ...ambiguityResult,
      taskId,
    };
  } catch (error) {
    console.error("Error handling contact disambiguation:", error);
    return {
      isAmbiguous: false,
      contacts: [],
      originalQuery: contactReference,
    };
  }
}

/**
 * Resolve a contact disambiguation task with the selected contact
 * 
 * @param taskId The disambiguation task ID
 * @param selectedContactId The ID of the selected contact
 * @returns The selected contact information
 */
export async function resolveDisambiguation(
  taskId: string,
  selectedContactId: string
): Promise<ContactWithScore | null> {
  try {
    // Get the task
    const task = await prisma.task.findUnique({
      where: {
        id: taskId,
        type: TaskType.GENERAL, // Using a valid TaskType enum value
      },
    });
    
    if (!task) {
      throw new Error(`Disambiguation task not found: ${taskId}`);
    }
    
    // Get the potential contacts from task metadata
    const metadata = task.metadata as Record<string, unknown>;
    const potentialContacts = metadata.potentialContacts as Array<ContactWithScore>;
    
    // Find the selected contact
    const selectedContact = potentialContacts.find(contact => contact.id === selectedContactId);
    
    if (!selectedContact) {
      throw new Error(`Selected contact not found in disambiguation options: ${selectedContactId}`);
    }
    
    // Update the task with the selected contact
    await prisma.task.update({
      where: {
        id: taskId,
      },
      data: {
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
        waitingFor: null,
        waitingSince: null,
        metadata: {
          ...metadata,
          selectedContact: {
            id: selectedContact.id,
            email: selectedContact.email,
            firstName: selectedContact.firstName,
            lastName: selectedContact.lastName,
            similarity: selectedContact.similarity
          },
          resolvedAt: new Date().toISOString(),
        },
      },
    });
    
    // Get the full contact information
    const contact = await prisma.hubspotContact.findUnique({
      where: {
        id: selectedContactId,
      },
    });
    
    if (!contact) {
      throw new Error(`Contact not found: ${selectedContactId}`);
    }
    
    return {
      id: contact.id,
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      properties: contact.properties as Record<string, unknown>,
      similarity: selectedContact.similarity,
    };
  } catch (error) {
    console.error("Error resolving disambiguation:", error);
    return null;
  }
}
