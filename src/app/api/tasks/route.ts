import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";
import { TaskStatus } from "@prisma/client";

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
    const where: any = { userId };
    
    // Filter by status if provided
    if (status) {
      where.status = status;
    }
    
    // Filter by parent task if provided
    if (parentTaskId) {
      where.parentTaskId = parentTaskId;
    } else {
      // By default, only show top-level tasks (no parentTaskId)
      where.parentTaskId = null;
    }
    
    // Get all tasks for the user with optional steps
    const tasks = await prisma.task.findMany({
      where,
      orderBy: {
        updatedAt: "desc",
      },
      include: {
        steps: includeSteps,
        subTasks: !parentTaskId, // Include subtasks only for top-level tasks
      },
    });
    
    return NextResponse.json({ tasks });
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
    
    // Calculate total steps
    const totalSteps = steps.length || 1;
    
    // Determine initial status
    let initialStatus: TaskStatus = TaskStatus.PENDING;
    if (waitingFor) {
      initialStatus = TaskStatus.WAITING_FOR_RESPONSE;
    }
    
    // Create new task
    const newTask = await prisma.task.create({
      data: {
        userId,
        title,
        description: description || "",
        type,
        status: initialStatus,
        metadata: metadata || {},
        totalSteps,
        currentStep: 1,
        waitingFor,
        waitingSince: waitingSince ? new Date(waitingSince) : waitingFor ? new Date() : null,
        resumeAfter: resumeAfter ? new Date(resumeAfter) : null,
        parentTaskId,
        // Create steps if provided
        steps: steps.length > 0 ? {
          create: steps.map((step: any, index: number) => ({
            stepNumber: index + 1,
            title: step.title,
            description: step.description || "",
            status: index === 0 ? initialStatus : TaskStatus.PENDING,
            metadata: step.metadata || {},
            waitingFor: index === 0 ? waitingFor : null,
            waitingSince: index === 0 && waitingFor ? (waitingSince ? new Date(waitingSince) : new Date()) : null,
            resumeAfter: index === 0 && resumeAfter ? new Date(resumeAfter) : null
          }))
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
