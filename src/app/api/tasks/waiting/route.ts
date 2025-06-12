import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";
import { TaskStatus } from "@prisma/client";

interface StepResponse {
  timestamp: string;
  response: unknown;
  waitedFor: string | null;
}

// GET all tasks that are in a waiting state
export async function GET(request: NextRequest) {
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
    
    // Get query parameters
    const url = new URL(request.url);
    const waitingFor = url.searchParams.get('waitingFor');
    const includeSteps = url.searchParams.get('includeSteps') === 'true';
    const includeExpired = url.searchParams.get('includeExpired') === 'true';
    
    // Build the query
    const where: { 
      userId: string;
      status: TaskStatus;
    } = { 
      userId,
      status: TaskStatus.WAITING_FOR_RESPONSE,
    };
    
    // Note: waitingFor and resumeAfter are now in metadata, so we'll filter after fetching
    
    // Define a type for task metadata
    interface TaskMetadata {
      waitingFor?: string | null;
      waitingSince?: string | null;
      resumeAfter?: string | null;
      [key: string]: unknown;
    }

    // Get all waiting tasks
    const tasks = await prisma.task.findMany({
      where,
      orderBy: {
        updatedAt: "desc",
      },
      include: {
        steps: includeSteps,
      },
    });
    
    // Filter tasks based on metadata fields
    let filteredTasks = tasks;
    
    // Filter by what the task is waiting for if specified
    if (waitingFor) {
      filteredTasks = filteredTasks.filter(task => 
        (task.metadata as TaskMetadata)?.waitingFor === waitingFor
      );
    }
    
    // Filter by expired tasks (those with resumeAfter in the past)
    if (includeExpired) {
      const now = new Date();
      filteredTasks = filteredTasks.filter(task => {
        const resumeAfter = (task.metadata as TaskMetadata)?.resumeAfter;
        return resumeAfter && new Date(resumeAfter) < now;
      });
    }
    
    // Sort by waitingSince from metadata (oldest first)
    filteredTasks.sort((a, b) => {
      const aWaitingSince = (a.metadata as TaskMetadata)?.waitingSince;
      const bWaitingSince = (b.metadata as TaskMetadata)?.waitingSince;
      
      if (!aWaitingSince) return 1;
      if (!bWaitingSince) return -1;
      
      return new Date(aWaitingSince).getTime() - new Date(bWaitingSince).getTime();
    });
    
    return NextResponse.json({ tasks: filteredTasks });
  } catch (error) {
    console.error("Error fetching waiting tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch waiting tasks" },
      { status: 500 }
    );
  }
}

// POST to resume a waiting task
export async function POST(request: NextRequest) {
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
    const { taskId, response, status = TaskStatus.IN_PROGRESS } = await request.json();
    
    if (!taskId) {
      return NextResponse.json(
        { error: "Task ID is required" },
        { status: 400 }
      );
    }
    
    // Verify the task exists, belongs to the user, and is in a waiting state
    const task = await prisma.task.findUnique({
      where: {
        id: taskId,
        userId,
        status: TaskStatus.WAITING_FOR_RESPONSE,
      },
      include: {
        steps: true,
      },
    });
    
    if (!task) {
      return NextResponse.json(
        { error: "Waiting task not found" },
        { status: 404 }
      );
    }
    
    // Update the task metadata with the response if provided
    // Define a type that matches Prisma's JSON structure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type PrismaJson = { [key: string]: any };
    let updatedMetadata = (task.metadata || {}) as PrismaJson;
    if (response !== undefined) {
      updatedMetadata = {
        ...updatedMetadata,
        responses: [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...((updatedMetadata.responses as any[]) || []),
          {
            timestamp: new Date().toISOString(),
            response,
            waitedFor: task.waitingFor,
          }
        ]
      };
    }
    
    // Update the task metadata to clear waiting fields
    updatedMetadata = {
      ...updatedMetadata,
      waitingFor: null,
      waitingSince: null,
      resumeAfter: null
    };
    
    // Update the task
    const updatedTask = await prisma.task.update({
      where: {
        id: taskId,
      },
      data: {
        status,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadata: updatedMetadata as any,
      },
      include: {
        steps: true,
      },
    });
    
    // If the task has steps, try to find the current step from metadata
    if (task.steps && task.steps.length > 0) {
      // Get the current step based on status
      const currentStep = task.steps.find(step => step.status === "IN_PROGRESS") || task.steps[0];
      
      if (currentStep) {
        // Get the step metadata
        const stepMetadata = (currentStep.metadata || {}) as PrismaJson;
        const waitedFor = stepMetadata.waitingFor;
        
        // Update the step metadata
        const updatedStepMetadata = {
          ...stepMetadata,
          waitingFor: null,
          waitingSince: null,
          resumeAfter: null,
          responses: [
            ...((stepMetadata.responses as StepResponse[]) || []),
            response !== undefined ? {
              timestamp: new Date().toISOString(),
              response,
              waitedFor
            } : null
          ].filter(Boolean)
        };
        
        await prisma.taskStep.update({
          where: {
            id: currentStep.id,
          },
          data: {
            status,
            metadata: updatedStepMetadata
          },
        });
      }
    }
    
    return NextResponse.json(updatedTask);
  } catch (error) {
    console.error("Error resuming waiting task:", error);
    return NextResponse.json(
      { error: "Failed to resume waiting task" },
      { status: 500 }
    );
  }
}
