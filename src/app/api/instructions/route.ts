import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";

// GET all instructions for the current user
export async function GET() {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    const userId = session.user.id as string;
    
    // Get all instructions for the user
    const instructions = await prisma.instruction.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    
    return NextResponse.json({ instructions });
  } catch (error) {
    console.error("Error fetching instructions:", error);
    return NextResponse.json(
      { error: "Failed to fetch instructions" },
      { status: 500 }
    );
  }
}

// POST a new instruction
export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    const userId = session.user.id as string;
    const { instruction } = await req.json();
    
    // Validate input
    if (!instruction || typeof instruction !== "string") {
      return NextResponse.json(
        { error: "Instruction is required" },
        { status: 400 }
      );
    }
    
    // Create new instruction
    const newInstruction = await prisma.instruction.create({
      data: {
        userId,
        instruction,
        active: true,
      },
    });
    
    return NextResponse.json(newInstruction, { status: 201 });
  } catch (error) {
    console.error("Error creating instruction:", error);
    return NextResponse.json(
      { error: "Failed to create instruction" },
      { status: 500 }
    );
  }
}
