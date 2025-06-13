import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";
import { TaskStatus } from "@prisma/client";
import { TaskMetadata } from "@/types/task";

// GET all tasks for the current user
export async function GET(request: NextRequest) {
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
    
    // Get query parameters
    const url = new URL(request.url);
    const includeSteps = url.searchParams.get('includeSteps') === 'true';
    const status = url.searchParams.get('status');
    const parentTaskId = url.searchParams.get('parentTaskId');
    
    // Build the query
    const where: { userId: string; status?: TaskStatus } = { userId };
    
    // Filter by status if provided
    if (status) {
      // Convert string status to TaskStatus enum
      where.status = status as TaskStatus;
    }
    
    // Note: parentTaskId filtering will be done after fetching tasks
    // since it's stored in metadata now, not as a direct field
    
    // Get all tasks for the user with optional steps
    let tasks;
    if (includeSteps) {
      tasks = await prisma.task.findMany({
        where,
        orderBy: {
          updatedAt: "desc",
        },
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          status: true,
          updatedAt: true,
          metadata: true,
          steps: true
        }
      });
    } else {
      tasks = await prisma.task.findMany({
        where,
        orderBy: {
          updatedAt: "desc",
        },
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          status: true,
          updatedAt: true,
          metadata: true
        }
      });
    }
    
    // Add default values and filter by parentTaskId if needed
    let tasksWithMissingFields = tasks.map(task => {
      const metadata = task.metadata as TaskMetadata;
      return {
        ...task,
        currentStep: metadata?.currentStep || 1,
        totalSteps: (task as {steps?: unknown[]})?.steps?.length || metadata?.totalSteps || 1,
        parentTaskId: metadata?.parentTaskId || null,
        waitingFor: metadata?.waitingFor || null,
        waitingSince: metadata?.waitingSince ? new Date(metadata.waitingSince) : null,
        resumeAfter: metadata?.resumeAfter ? new Date(metadata.resumeAfter) : null
      };
    });
    
    // Filter by parentTaskId if provided (now using the metadata-derived field)
    if (parentTaskId) {
      tasksWithMissingFields = tasksWithMissingFields.filter(task => 
        task.parentTaskId === parentTaskId
      );
    } else {
      // By default, only show top-level tasks (no parentTaskId)
      tasksWithMissingFields = tasksWithMissingFields.filter(task => 
        task.parentTaskId === null
      );
    }
    
    return NextResponse.json({ tasks: tasksWithMissingFields });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

// POST a new task (typically called by the AI agent)
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
    const { 
      title, 
      description, 
      type, 
      metadata, 
      steps = [], 
      waitingFor,
      waitingSince,
      resumeAfter,
      parentTaskId
    } = await req.json();
    
    // Validate input
    if (!title || !type) {
      return NextResponse.json(
        { error: "Title and type are required" },
        { status: 400 }
      );
    }
    
    // Calculate total steps (will be stored in metadata)
    const totalSteps = steps.length || 1;
    
    // Determine initial status
    let initialStatus: TaskStatus = TaskStatus.PENDING;
    if (waitingFor) {
      initialStatus = TaskStatus.WAITING_FOR_RESPONSE;
    }
    
    // Prepare metadata with all the fields that don't exist in the database
    const enhancedMetadata: TaskMetadata = {
      ...(metadata || {}),
      currentStep: 1,
      totalSteps,
      ...(parentTaskId ? { parentTaskId } : {}),
      ...(waitingFor ? { 
        waitingFor,
        waitingSince: new Date().toISOString() 
      } : {}),
      ...(resumeAfter ? { 
        resumeAfter: (typeof resumeAfter === 'string' ? new Date(resumeAfter) : resumeAfter).toISOString()
      } : {})
    };
    
    // Create new task
    const newTask = await prisma.task.create({
      data: {
        userId,
        title,
        description: description || "",
        type,
        status: initialStatus,
        metadata: enhancedMetadata, 
        // Create steps if provided
        steps: steps.length > 0 ? {
          create: steps.map((step: { title: string; description?: string; metadata?: Record<string, unknown> }, index: number) => {
            // Prepare step metadata with waiting fields for the first step if needed
            const stepMetadata = {
              ...(step.metadata || {}),
              // Only add waiting fields to the first step if needed
              ...(index === 0 ? {
                waitingFor: waitingFor || null,
                waitingSince: index === 0 && waitingFor ? (waitingSince ? new Date(waitingSince) : new Date()).toISOString() : null,
                resumeAfter: index === 0 && resumeAfter ? new Date(resumeAfter).toISOString() : null
              } : {})
            };
            
            return {
              stepNumber: index + 1,
              title: step.title,
              description: step.description || "",
              status: index === 0 ? initialStatus : TaskStatus.PENDING,
              metadata: stepMetadata
            };
          })
        } : undefined
      },
      include: {
        steps: true
      }
    });
    
    return NextResponse.json(newTask, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}
