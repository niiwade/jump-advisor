import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";
import { TaskStatus } from "@prisma/client";

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
    const where: any = { 
      userId,
      status: TaskStatus.WAITING_FOR_RESPONSE,
    };
    
    // Filter by what the task is waiting for
    if (waitingFor) {
      where.waitingFor = waitingFor;
    }
    
    // Filter by expired tasks (those with resumeAfter in the past)
    if (includeExpired) {
      where.resumeAfter = {
        lt: new Date(),
      };
    }
    
    // Get all waiting tasks
    const tasks = await prisma.task.findMany({
      where,
      orderBy: [
        {
          waitingSince: "asc", // Oldest waiting tasks first
        },
        {
          updatedAt: "desc",
        },
      ],
      include: {
        steps: includeSteps,
      },
    });
    
    return NextResponse.json({ tasks });
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
    let updatedMetadata = task.metadata as Record<string, any> || {};
    if (response !== undefined) {
      updatedMetadata = {
        ...updatedMetadata,
        responses: [
          ...(updatedMetadata.responses || []),
          {
            timestamp: new Date().toISOString(),
            response,
            waitedFor: task.waitingFor,
          }
        ]
      };
    }
    
    // Update the task
    const updatedTask = await prisma.task.update({
      where: {
        id: taskId,
      },
      data: {
        status,
        waitingFor: null,
        waitingSince: null,
        resumeAfter: null,
        metadata: updatedMetadata,
      },
      include: {
        steps: true,
      },
    });
    
    // If the task has steps, update the current step as well
    if (task.steps && task.steps.length > 0) {
      const currentStep = task.steps.find(step => step.stepNumber === task.currentStep);
      
      if (currentStep) {
        await prisma.taskStep.update({
          where: {
            id: currentStep.id,
          },
          data: {
            status,
            waitingFor: null,
            waitingSince: null,
            resumeAfter: null,
            metadata: {
              ...(currentStep.metadata as Record<string, any> || {}),
              responses: [
                ...((currentStep.metadata as Record<string, any>)?.responses || []),
                response !== undefined ? {
                  timestamp: new Date().toISOString(),
                  response,
                  waitedFor: currentStep.waitingFor,
                } : null
              ].filter(Boolean)
            },
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
