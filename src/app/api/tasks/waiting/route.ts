import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";
import { TaskStatus, Prisma } from "@prisma/client";

interface StepResponse {
  timestamp: string;
  response: unknown;
  waitedFor: string | null;
}

// Define a type for task metadata
interface TaskMetadata {
  waitingFor: string | null;
  waitingSince: string | null;
  resumeAfter: string | null;
  responses: StepResponse[];
  [key: string]: unknown;
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
    const includeExpired = url.searchParams.get('includeExpired') === 'true';
    
    // Build the query
    const where: { 
      userId: string;
      status: TaskStatus;
    } = { 
      userId,
      status: TaskStatus.WAITING_FOR_RESPONSE,
    };
    
    // Get all waiting tasks
    const tasks = await prisma.task.findMany({
      where,
      orderBy: {
        updatedAt: "desc",
      }
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
      }
    });
    
    if (!task) {
      return NextResponse.json(
        { error: "Waiting task not found" },
        { status: 404 }
      );
    }
    
    // Update the task metadata with the response if provided
    let updatedMetadata = (task.metadata || {}) as TaskMetadata;
    if (response !== undefined) {
      const waitedFor = updatedMetadata.waitingFor ?? null;
      updatedMetadata = {
        ...updatedMetadata,
        responses: [
          ...(updatedMetadata.responses || []),
          {
            timestamp: new Date().toISOString(),
            response,
            waitedFor
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
        metadata: updatedMetadata as Prisma.InputJsonValue,
      }
    });
    
    return NextResponse.json(updatedTask);
  } catch (error) {
    console.error("Error resuming waiting task:", error);
    return NextResponse.json(
      { error: "Failed to resume waiting task" },
      { status: 500 }
    );
  }
}
