import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";
import { TaskStatus } from "@prisma/client";
import { Prisma } from '@prisma/client';
import type { RouteContext } from "@/types/next";
import { TaskStepWithMetadata, TaskStepMetadata } from "@/types/task";

// GET all steps for a specific task
export async function GET(
  request: NextRequest,
  { params }: RouteContext<{ taskId: string }>
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
    const { taskId } = await params;
    
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
        createdAt: 'asc'
      }
    }) as TaskStepWithMetadata[];
    
    // Add step numbers and typed metadata
    const stepsWithNumbers = steps.map((step, index) => ({
      ...step,
      stepNumber: index + 1,
      metadata: step.metadata as TaskStepMetadata
    }));
    
    return NextResponse.json({ steps: stepsWithNumbers });
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
  { params }: RouteContext<{ taskId: string }>
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
    const { taskId } = await params;
    
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
    
    // Create the new step
    const newStep = await prisma.taskStep.create({
      data: {
        title,
        description,
        status,
        taskId,
        metadata: {
          stepNumber: ((task.metadata as {totalSteps?: number})?.totalSteps || 0) + 1,
          ...(metadata || {})
        },
        ...(waitingFor && { waitingFor }),
        ...(waitingSince && { waitingSince }),
        ...(resumeAfter && { resumeAfter })
      }
    }) as {
      id: string;
      title: string;
      description: string | null;
      status: TaskStatus;
      metadata: Prisma.JsonValue;
      taskId: string;
      createdAt: Date;
      updatedAt: Date;
    };
    
    // Update task's totalSteps in metadata
    await prisma.task.update({
      where: { id: taskId },
      data: {
        metadata: {
          ...(task.metadata as {totalSteps?: number}),
          totalSteps: ((task.metadata as {totalSteps?: number})?.totalSteps || 0) + 1
        }
      }
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
