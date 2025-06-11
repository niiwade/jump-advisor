import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { Message as AIMessage } from "ai";
import { prisma } from "@/lib/db/prisma";
import { processUserRequest } from "@/lib/agents/financial-advisor-agent";

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Parse the request body
    const { messages, userId }: { messages: AIMessage[], userId?: string } = await req.json();
    
    // Verify user ID matches the authenticated user
    if (userId && userId !== session.user.id) {
      return NextResponse.json(
        { error: "User ID mismatch" },
        { status: 403 }
      );
    }
    
    // Get the last user message
    const lastUserMessage = messages.filter(m => m.role === "user").pop();
    if (!lastUserMessage) {
      return NextResponse.json(
        { error: "No user message found" },
        { status: 400 }
      );
    }

    // Save the user message to the database for history
    await prisma.chatMessage.create({
      data: {
        userId: session.user.id,
        role: "user",
        content: lastUserMessage.content,
      },
    });

    // Process the user request through our agent
    const response = await processUserRequest(
      session.user.id,
      lastUserMessage.content,
      messages
    );

    // Save the assistant response to the database
    await prisma.chatMessage.create({
      data: {
        userId: session.user.id,
        role: "assistant",
        content: response,
      },
    });

    // Return the response in the format expected by the AI package
    return NextResponse.json({ role: "assistant", content: response });
  } catch (error) {
    console.error("Error in chat API:", error);
    return NextResponse.json(
      { error: "Failed to process your request" },
      { status: 500 }
    );
  }
}
