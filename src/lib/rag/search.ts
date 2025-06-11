import { OpenAI } from "openai";
import { prisma } from "@/lib/db/prisma";

// Initialize OpenAI client for embeddings
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    
    // In a real implementation, this would use pgvector to perform similarity search
    // For now, we'll simulate by fetching all emails and filtering
    const emails = await prisma.emailDocument.findMany({
      where: {
        userId,
      },
      take: limit,
    });
    
    return {
      results: emails.map(email => ({
        id: email.id,
        subject: email.subject,
        content: email.content,
        sender: email.sender,
        sentAt: email.sentAt,
      })),
    };
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
    
    // In a real implementation, this would use pgvector to perform similarity search
    // For now, we'll simulate by fetching all contacts and filtering
    const contacts = await prisma.hubspotContact.findMany({
      where: {
        userId,
      },
      include: {
        notes: true,
      },
      take: limit,
    });
    
    return {
      results: contacts.map(contact => ({
        id: contact.id,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        properties: contact.properties,
        notes: contact.notes.map(note => ({
          id: note.id,
          content: note.content,
          createdAt: note.createdAt,
        })),
      })),
    };
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
    
    // Build where clause
    const where: any = { userId };
    
    if (startDate) {
      where.startTime = { gte: new Date(startDate) };
    }
    
    if (endDate) {
      where.endTime = { lte: new Date(endDate) };
    }
    
    // In a real implementation, this would use pgvector to perform similarity search
    // For now, we'll simulate by fetching all events and filtering
    const events = await prisma.calendarEvent.findMany({
      where,
      take: limit,
    });
    
    return {
      results: events.map(event => ({
        id: event.id,
        title: event.title,
        description: event.description,
        location: event.location,
        startTime: event.startTime,
        endTime: event.endTime,
        attendees: event.attendees,
      })),
    };
  } catch (error) {
    console.error("Error searching calendar events:", error);
    return { results: [] };
  }
}
