import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { handleNewEmail } from "@/lib/api/gmail";
import { handleNewCalendarEvent } from "@/lib/api/calendar";
import { handleNewHubspotContact } from "@/lib/api/hubspot";
import { processUserRequest } from "@/lib/agents/financial-advisor-agent";
import { Message } from "ai";

// Main webhook handler
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { source, userId, data } = body;

    // Validate webhook payload
    if (!source || !userId || !data) {
      return NextResponse.json(
        { error: "Invalid webhook payload" },
        { status: 400 }
      );
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let result;

    // Process webhook based on source
    switch (source) {
      case "gmail":
        result = await handleGmailWebhook(userId, data);
        break;
      case "calendar":
        result = await handleCalendarWebhook(userId, data);
        break;
      case "hubspot":
        result = await handleHubspotWebhook(userId, data);
        break;
      default:
        return NextResponse.json(
          { error: "Unknown webhook source" },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}

// Define webhook data types
interface EmailWebhookData {
  messageId: string;
  sender?: string;
  subject?: string;
  content?: string;
}

interface CalendarWebhookData {
  eventId: string;
  title?: string;
  startTime?: string | Date;
  endTime?: string | Date;
  attendees?: string[];
  description?: string;
}

interface HubspotWebhookData {
  objectId: string;
  properties?: {
    email?: string;
    firstname?: string;
    lastname?: string;
    [key: string]: unknown;
  };
}

// Gmail webhook handler
async function handleGmailWebhook(userId: string, data: EmailWebhookData) {
  // Process new email
  const result = await handleNewEmail(userId, data);

  // Get active instructions
  const instructions = await prisma.instruction.findMany({
    where: {
      userId,
      active: true,
    },
  });

  // If there are active instructions, process them with the agent
  if (instructions.length > 0) {
    // Create a system message for the agent
    const systemMessage = `New email received: 
    From: ${data.sender}
    Subject: ${data.subject}
    
    Based on the user's instructions, determine if any action is needed.`;

    // Get chat history for context
    const chatHistory = await prisma.chatMessage.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    });

    // Format chat history for the agent
    const formattedHistory = chatHistory.map((message) => ({
      role: message.role,
      content: message.content,
      id: message.id || `msg-${Math.random().toString(36).substring(2, 11)}`,
    })) as Message[];

    // Process with agent
    const agentResponse = await processUserRequest(
      userId,
      systemMessage,
      formattedHistory
    );

    // Save agent response as a system message
    await prisma.chatMessage.create({
      data: {
        userId,
        role: "system",
        content: `[Automated] ${agentResponse}`,
      },
    });
  }

  return result;
}

// Calendar webhook handler
async function handleCalendarWebhook(userId: string, data: CalendarWebhookData) {
  // Process new calendar event
  const result = await handleNewCalendarEvent(userId, data);

  // Get active instructions
  const instructions = await prisma.instruction.findMany({
    where: {
      userId,
      active: true,
    },
  });

  // If there are active instructions, process them with the agent
  if (instructions.length > 0) {
    // Create a system message for the agent
    const systemMessage = `New calendar event: 
    Title: ${data.title}
    Start: ${data.startTime}
    End: ${data.endTime}
    Attendees: ${data.attendees?.join(", ") || "None"}
    
    Based on the user's instructions, determine if any action is needed.`;

    // Get chat history for context
    const chatHistory = await prisma.chatMessage.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    });

    // Format chat history for the agent
    const formattedHistory = chatHistory.map((message) => ({
      role: message.role,
      content: message.content,
      id: message.id || `msg-${Math.random().toString(36).substring(2, 11)}`,
    })) as Message[];

    // Process with agent
    const agentResponse = await processUserRequest(
      userId,
      systemMessage,
      formattedHistory.map(msg => ({
        ...msg,
        id: `msg-${Math.random().toString(36).substring(2, 11)}` // Add required id field
      })) as Message[]
    );

    // Save agent response as a system message
    await prisma.chatMessage.create({
      data: {
        userId,
        role: "system",
        content: `[Automated] ${agentResponse}`,
      },
    });
  }

  return result;
}

// HubSpot webhook handler
async function handleHubspotWebhook(userId: string, data: HubspotWebhookData) {
  // Process new HubSpot contact
  const result = await handleNewHubspotContact(userId, data);

  // Get active instructions
  const instructions = await prisma.instruction.findMany({
    where: {
      userId,
      active: true,
    },
  });

  // If there are active instructions, process them with the agent
  if (instructions.length > 0) {
    // Create a system message for the agent
    const systemMessage = `New HubSpot contact: 
    Email: ${data.properties?.email || "Unknown"}
    Name: ${data.properties?.firstname || ""} ${data.properties?.lastname || ""}
    
    Based on the user's instructions, determine if any action is needed.`;

    // Get chat history for context
    const chatHistory = await prisma.chatMessage.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    });

    // Format chat history for the agent
    const formattedHistory = chatHistory.map((message) => ({
      role: message.role,
      content: message.content,
      id: message.id || `msg-${Math.random().toString(36).substring(2, 11)}`,
    })) as Message[];

    // Process with agent
    const agentResponse = await processUserRequest(
      userId,
      systemMessage,
      formattedHistory
    );

    // Save agent response as a system message
    await prisma.chatMessage.create({
      data: {
        userId,
        role: "system",
        content: `[Automated] ${agentResponse}`,
      },
    });
  }

  return result;
}
