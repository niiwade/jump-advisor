import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";

type RouteContext = {
  params: Promise<{ id: string }> & {
    then: (onfulfilled?: (value: { id: string }) => unknown) => Promise<unknown>;
    catch: (onrejected?: (reason: unknown) => unknown) => Promise<unknown>;
    finally: (onfinally?: () => void) => Promise<unknown>;
    [Symbol.toStringTag]: string;
  };
};

// PATCH update an instruction
export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
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
    const { id: instructionId } = await params;
    const { active } = await request.json();
    
    // Validate input
    if (typeof active !== "boolean") {
      return NextResponse.json(
        { error: "Active status must be a boolean" },
        { status: 400 }
      );
    }
    
    // Check if instruction exists and belongs to user
    const existingInstruction = await prisma.instruction.findUnique({
      where: {
        id: instructionId,
      },
    });
    
    if (!existingInstruction) {
      return NextResponse.json(
        { error: "Instruction not found" },
        { status: 404 }
      );
    }
    
    if (existingInstruction.userId !== userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }
    
    // Update instruction
    const updatedInstruction = await prisma.instruction.update({
      where: {
        id: instructionId,
      },
      data: {
        active,
      },
    });
    
    return NextResponse.json(updatedInstruction);
  } catch (error) {
    console.error("Error updating instruction:", error);
    return NextResponse.json(
      { error: "Failed to update instruction" },
      { status: 500 }
    );
  }
}

// DELETE an instruction
export async function DELETE(
  request: NextRequest,
  { params }: RouteContext
) {
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
    const { id: instructionId } = await params;
    
    // Check if instruction exists and belongs to user
    const existingInstruction = await prisma.instruction.findUnique({
      where: {
        id: instructionId,
      },
    });
    
    if (!existingInstruction) {
      return NextResponse.json(
        { error: "Instruction not found" },
        { status: 404 }
      );
    }
    
    if (existingInstruction.userId !== userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }
    
    // Delete instruction
    await prisma.instruction.delete({
      where: {
        id: instructionId,
      },
    });
    
    return NextResponse.json(
      { message: "Instruction deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting instruction:", error);
    return NextResponse.json(
      { error: "Failed to delete instruction" },
      { status: 500 }
    );
  }
}
