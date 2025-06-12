import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";
import { TaskStatus } from "@prisma/client";

// GET all steps for a specific task
export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    const userId = session.user.id as string;
    const { taskId } = params;
    
    // Verify the task exists and belongs to the user
    const task = await prisma.task.findUnique({
      where: {
        id: taskId,
        userId,
      },
    });
    
    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }
    
    // Get all steps for the task
    const steps = await prisma.taskStep.findMany({
      where: {
        taskId,
      },
      orderBy: {
        stepNumber: "asc",
      },
    });
    
    return NextResponse.json({ steps });
  } catch (error) {
    console.error("Error fetching task steps:", error);
    return NextResponse.json(
      { error: "Failed to fetch task steps" },
      { status: 500 }
    );
  }
}

// POST to add a new step to a task
export async function POST(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    const userId = session.user.id as string;
    const { taskId } = params;
    
    // Get the step data
    const { 
      title, 
      description, 
      status = TaskStatus.PENDING,
      metadata,
      waitingFor,
      waitingSince,
      resumeAfter
    } = await request.json();
    
    // Validate input
    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }
    
    // Verify the task exists and belongs to the user
    const task = await prisma.task.findUnique({
      where: {
        id: taskId,
        userId,
      },
    });
    
    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }
    
    // Get the current highest step number
    const highestStep = await prisma.taskStep.findFirst({
      where: {
        taskId,
      },
      orderBy: {
        stepNumber: "desc",
      },
    });
    
    const nextStepNumber = highestStep ? highestStep.stepNumber + 1 : 1;
    
    // Create the new step
    const newStep = await prisma.taskStep.create({
      data: {
        taskId,
        stepNumber: nextStepNumber,
        title,
        description: description || "",
        status,
        metadata: metadata || {},
        waitingFor,
        waitingSince: waitingSince ? new Date(waitingSince) : waitingFor ? new Date() : null,
        resumeAfter: resumeAfter ? new Date(resumeAfter) : null,
      },
    });
    
    // Update the task's total steps
    await prisma.task.update({
      where: {
        id: taskId,
      },
      data: {
        totalSteps: nextStepNumber,
      },
    });
    
    return NextResponse.json(newStep, { status: 201 });
  } catch (error) {
    console.error("Error creating task step:", error);
    return NextResponse.json(
      { error: "Failed to create task step" },
      { status: 500 }
    );
  }
}
