import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";
import { TaskStatus, TaskType, Prisma } from "@prisma/client";

// POST to update multiple tasks at once
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
    const { taskIds, status, metadata }: { 
      taskIds: string[]; 
      status?: TaskStatus; 
      metadata?: Prisma.InputJsonValue; 
    } = await req.json();
    
    // Validate input
    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { error: "Task IDs array is required" },
        { status: 400 }
      );
    }
    
    // Check if all tasks belong to the user
    const tasks = await prisma.task.findMany({
      where: {
        id: { in: taskIds },
      },
    });
    
    const unauthorizedTasks = tasks.filter((task: { userId: string }) => task.userId !== userId);
    if (unauthorizedTasks.length > 0) {
      return NextResponse.json(
        { error: "Unauthorized to update one or more tasks" },
        { status: 403 }
      );
    }
    
    // Update all tasks
    const updateData: Prisma.TaskUpdateInput = {};
    if (status) updateData.status = status;
    if (metadata) updateData.metadata = metadata;
    
    // If marking as completed, set completedAt
    if (status === TaskStatus.COMPLETED) {
      updateData.completedAt = new Date();
    }
    
    const updatedTasks = await Promise.all(
      taskIds.map(async (taskId: string) => {
        return prisma.task.update({
          where: { id: taskId },
          data: updateData as Prisma.TaskUpdateInput,
        });
      })
    );
    
    return NextResponse.json({ 
      message: `${updatedTasks.length} tasks updated successfully`,
      tasks: updatedTasks 
    });
  } catch (error) {
    console.error("Error updating tasks in bulk:", error);
    return NextResponse.json(
      { error: "Failed to update tasks" },
      { status: 500 }
    );
  }
}

// GET tasks by status or type
export async function GET(req: NextRequest) {
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
    const url = new URL(req.url);
    const statusParam: string | null = url.searchParams.get("status");
    const status = statusParam ? statusParam as TaskStatus : undefined;
    const typeParam: string | null = url.searchParams.get("type");
    const type = typeParam ? typeParam as TaskType : undefined;
    const limit: number = parseInt(url.searchParams.get("limit") || "10");
    
    // Build where clause
    const where: { 
      userId: string;
      status?: TaskStatus;
      type?: TaskType;
    } = { userId };
    if (status) where.status = status;
    if (type) where.type = type;
    
    // Get filtered tasks
    const tasks = await prisma.task.findMany({
      where,
      orderBy: {
        updatedAt: "desc",
      },
      take: limit,
      // Select only the fields that exist in the database
      select: {
        id: true,
        userId: true,
        title: true,
        description: true,
        status: true,
        type: true,
        metadata: true,
        parentTaskId: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
        // Exclude fields that don't exist in the database:
        // - currentStep, totalSteps, waitingFor, waitingSince, resumeAfter
      },
    });
    
    // Define a type for task metadata that includes our custom fields
    interface TaskMetadata {
      currentStep?: number;
      totalSteps?: number;
      [key: string]: unknown;
    }
    
    // Add default currentStep and totalSteps values to each task
    const tasksWithMissingFields = tasks.map(task => ({
      ...task,
      // Get currentStep from metadata or default to 1
      currentStep: (task.metadata as TaskMetadata)?.currentStep || 1,
      // Get totalSteps from metadata or default to 1
      totalSteps: (task.metadata as TaskMetadata)?.totalSteps || 1,
    }));
    
    return NextResponse.json({ tasks: tasksWithMissingFields });
  } catch (error) {
    console.error("Error fetching filtered tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}
