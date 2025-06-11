import { OpenAI } from "openai";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

// Define types for vector search results
interface VectorSearchResult {
  id: string;
  similarity: number;
}

interface EmailVectorResult extends VectorSearchResult {
  subject: string;
  content: string;
  sender: string;
  sentAt: Date;
}

interface ContactVectorResult extends VectorSearchResult {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  properties: Record<string, unknown>;
}

interface NoteVectorResult extends VectorSearchResult {
  contactId: string;
  content: string;
}

interface EventVectorResult extends VectorSearchResult {
  title: string;
  description: string | null;
  location: string | null;
  startTime: Date;
  endTime: Date;
  attendees: string[];
}



// Initialize OpenAI client for embeddings
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Calculate cosine similarity between two embedding vectors
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error(`Vector dimensions don't match: ${vecA.length} vs ${vecB.length}`);
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Helper functions for similarity search using JSON embeddings
async function findSimilarEmails(queryEmbedding: number[], userId: string, limit = 5): Promise<EmailVectorResult[]> {
  try {
    // Get all emails for this user
    const emails = await prisma.emailDocument.findMany({
      where: { userId },
      select: {
        id: true,
        subject: true,
        content: true,
        sender: true,
        sentAt: true,
        embedding: true,
      },
    });
    
    // Calculate similarity scores
    const emailsWithScores = emails.map(email => {
      // Parse embedding from JSON
      const emailEmbedding = email.embedding as number[];
      
      // Calculate similarity
      const similarity = cosineSimilarity(queryEmbedding, emailEmbedding);
      
      return {
        id: email.id,
        subject: email.subject,
        content: email.content,
        sender: email.sender,
        sentAt: email.sentAt,
        similarity,
      };
    });
    
    // Sort by similarity and take top results
    emailsWithScores.sort((a, b) => b.similarity - a.similarity);
    return emailsWithScores.slice(0, limit);
  } catch (error) {
    console.error("Error in findSimilarEmails:", error instanceof Error ? error.message : String(error));
    return [];
  }
}

async function findSimilarContacts(queryEmbedding: number[], userId: string, limit = 5): Promise<ContactVectorResult[]> {
  try {
    // Get all contacts for this user
    const contacts = await prisma.hubspotContact.findMany({
      where: { userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        properties: true,
        embedding: true,
      },
    });
    
    // Calculate similarity scores
    const contactsWithScores = contacts.map(contact => {
      // Parse embedding from JSON
      const contactEmbedding = contact.embedding as number[];
      
      // Calculate similarity
      const similarity = cosineSimilarity(queryEmbedding, contactEmbedding);
      
      return {
        id: contact.id,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        properties: contact.properties as Record<string, unknown>,
        similarity,
      };
    });
    
    // Sort by similarity and take top results
    contactsWithScores.sort((a, b) => b.similarity - a.similarity);
    return contactsWithScores.slice(0, limit);
  } catch (error) {
    console.error("Error in findSimilarContacts:", error instanceof Error ? error.message : String(error));
    return [];
  }
}

async function findSimilarNotes(queryEmbedding: number[], limit = 5): Promise<NoteVectorResult[]> {
  try {
    // Get all notes
    const notes = await prisma.hubspotNote.findMany({
      select: {
        id: true,
        contactId: true,
        content: true,
        embedding: true,
      },
    });
    
    // Calculate similarity scores
    const notesWithScores = notes.map(note => {
      // Parse embedding from JSON
      const noteEmbedding = note.embedding as number[];
      
      // Calculate similarity
      const similarity = cosineSimilarity(queryEmbedding, noteEmbedding);
      
      return {
        id: note.id,
        contactId: note.contactId,
        content: note.content,
        similarity,
      };
    });
    
    // Sort by similarity and take top results
    notesWithScores.sort((a, b) => b.similarity - a.similarity);
    return notesWithScores.slice(0, limit);
  } catch (error) {
    console.error("Error in findSimilarNotes:", error instanceof Error ? error.message : String(error));
    return [];
  }
}

async function findSimilarEvents(queryEmbedding: number[], userId: string, startDate?: Date, endDate?: Date, limit = 5): Promise<EventVectorResult[]> {
  try {
    // Build where clause
    const where: Prisma.CalendarEventWhereInput = { userId };
    
    if (startDate) {
      where.startTime = { gte: startDate };
    }
    
    if (endDate) {
      where.endTime = { lte: endDate };
    }
    
    // Get all events matching criteria
    const events = await prisma.calendarEvent.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        location: true,
        startTime: true,
        endTime: true,
        attendees: true,
        embedding: true,
      },
    });
    
    // Calculate similarity scores
    const eventsWithScores = events.map(event => {
      // Parse embedding from JSON
      const eventEmbedding = event.embedding as number[];
      
      // Calculate similarity
      const similarity = cosineSimilarity(queryEmbedding, eventEmbedding);
      
      return {
        id: event.id,
        title: event.title,
        description: event.description,
        location: event.location,
        startTime: event.startTime,
        endTime: event.endTime,
        attendees: event.attendees,
        similarity,
      };
    });
    
    // Sort by similarity and take top results
    eventsWithScores.sort((a, b) => b.similarity - a.similarity);
    return eventsWithScores.slice(0, limit);
  } catch (error) {
    console.error("Error in findSimilarEvents:", error instanceof Error ? error.message : String(error));
    return [];
  }
}

// Generate embeddings for text
async function generateEmbedding(text: string) {
  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
  });
  return response.data[0].embedding;
}

// Search emails using vector similarity
export async function searchEmails(userId: string, query: string, limit: number = 5) {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    
    // Use pgvector to perform similarity search
    const similarEmails = await findSimilarEmails(queryEmbedding, userId, limit);
    
    // Map results with similarity scores
    const results = similarEmails.map(email => ({
      id: email.id,
      subject: email.subject,
      content: email.content,
      sender: email.sender,
      sentAt: email.sentAt,
      similarity: Number(email.similarity),
    }));
    
    return { results };
  } catch (error) {
    console.error("Error searching emails:", error);
    return { results: [] };
  }
}

// Search HubSpot contacts using vector similarity
export async function searchContacts(userId: string, query: string, limit: number = 5) {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    
    // Use pgvector to perform similarity search on contacts
    const similarContacts = await findSimilarContacts(queryEmbedding, userId, limit);
    
    // Also search notes for relevant information
    const similarNotes = await findSimilarNotes(queryEmbedding, limit);
    
    // Get contacts associated with similar notes
    const contactsWithNotes = await Promise.all(
      similarContacts.map(async (contact) => {
        // Get notes for this contact
        const notes = await prisma.hubspotNote.findMany({
          where: {
            contactId: contact.id,
          },
        });
        
        // Add similarity scores to notes
        const notesWithScores = notes.map(note => {
          const similarNote = similarNotes.find(sn => sn.id === note.id);
          return {
            id: note.id,
            content: note.content,
            createdAt: note.createdAt,
            similarity: similarNote ? Number(similarNote.similarity) : 0,
          };
        });
        
        return {
          id: contact.id,
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
          properties: contact.properties,
          similarity: Number(contact.similarity),
          notes: notesWithScores,
        };
      })
    );
    
    return { results: contactsWithNotes };
  } catch (error) {
    console.error("Error searching contacts:", error);
    return { results: [] };
  }
}

// Search calendar events using vector similarity
export async function searchCalendarEvents(
  userId: string,
  query: string,
  startDate?: string,
  endDate?: string,
  limit: number = 5
) {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    
    // Parse dates if provided
    const parsedStartDate = startDate ? new Date(startDate) : undefined;
    const parsedEndDate = endDate ? new Date(endDate) : undefined;
    
    // Use pgvector to perform similarity search with date constraints
    const similarEvents = await findSimilarEvents(
      queryEmbedding, 
      userId, 
      parsedStartDate, 
      parsedEndDate, 
      limit
    );
    
    // Map results with similarity scores
    const results = similarEvents.map(event => ({
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      startTime: event.startTime,
      endTime: event.endTime,
      attendees: event.attendees,
      similarity: Number(event.similarity),
    }));
    
    return { results };
  } catch (error) {
    console.error("Error searching calendar events:", error);
    return { results: [] };
  }
}
