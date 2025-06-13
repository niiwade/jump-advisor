import { NextRequest, NextResponse } from "next/server";
import type { RouteContext } from "@/types/next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";
import type { TaskMetadata } from "@/types/task";

// GET a specific task by ID
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
    
    // Get the task with steps
    const task = await prisma.task.findUnique({
      where: {
        id: taskId,
        userId, // Ensure the task belongs to the user
      },
      include: {
        steps: true
      },
    });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    // Get subtasks via metadata relationship if needed
    const subTasks = await prisma.task.findMany({
      where: { 
        userId,
        metadata: {
          path: ['parentTaskId'],
          equals: taskId
        }
      }
    });

    return NextResponse.json({ task, subTasks });
  } catch (error) {
    console.error("Error fetching task:", error);
    return NextResponse.json(
      { error: "Failed to fetch task" },
      { status: 500 }
    );
  }
}

// PATCH to update a task
export async function PATCH(
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
    
    // Get the update data
    const updateData = await request.json();
    const { 
      title, 
      description, 
      status, 
      currentStep,
      waitingFor,
      waitingSince,
      resumeAfter,
      metadata,
      completedAt
    } = updateData;
    
    // Verify the task exists and belongs to the user
    const existingTask = await prisma.task.findUnique({
      where: {
        id: taskId,
        userId,
      },
    });
    
    if (!existingTask) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }
    
    // Update the task
    const updatedTask = await prisma.task.update({
      where: {
        id: taskId,
        userId,
      },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(status && { status }),
        ...(completedAt && { completedAt }),
        metadata: {
          ...(existingTask.metadata as TaskMetadata),
          ...(currentStep !== undefined && { currentStep }),
          ...(waitingFor !== undefined && { 
            waitingFor,
            ...(waitingFor ? { waitingSince: new Date().toISOString() } : {})
          }),
          ...(waitingSince !== undefined && { waitingSince }),
          ...(resumeAfter !== undefined && { resumeAfter }),
          ...(metadata && metadata)
        }
      },
      include: {
        steps: true
      }
    });
    
    return NextResponse.json(updatedTask);
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

// DELETE a task
export async function DELETE(
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
    const existingTask = await prisma.task.findUnique({
      where: {
        id: taskId,
        userId,
      },
    });
    
    if (!existingTask) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }
    
    // Delete the task (this will cascade delete steps due to the relation)
    await prisma.task.delete({
      where: {
        id: taskId,
      },
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
}
