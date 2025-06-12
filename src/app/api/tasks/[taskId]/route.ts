import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";
import { TaskStatus, Prisma } from "@prisma/client";

// GET a specific task by ID
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
    
    // Get the task with steps
    const task = await prisma.task.findUnique({
      where: {
        id: taskId,
        userId, // Ensure the task belongs to the user
      },
      include: {
        steps: true,
        subTasks: true,
      },
    });
    
    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }
    
    return NextResponse.json(task);
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
    
    // Prepare update data using Prisma's TaskUpdateInput type
    const taskUpdateData: Prisma.TaskUpdateInput = {};
    
    if (title !== undefined) taskUpdateData.title = title;
    if (description !== undefined) taskUpdateData.description = description;
    if (status !== undefined) taskUpdateData.status = status;
    if (currentStep !== undefined) taskUpdateData.currentStep = currentStep;
    if (waitingFor !== undefined) taskUpdateData.waitingFor = waitingFor;
    if (metadata !== undefined) taskUpdateData.metadata = metadata;
    
    // Handle date fields
    if (waitingSince !== undefined) {
      taskUpdateData.waitingSince = waitingSince ? new Date(waitingSince) : null;
    }
    
    if (resumeAfter !== undefined) {
      taskUpdateData.resumeAfter = resumeAfter ? new Date(resumeAfter) : null;
    }
    
    if (completedAt !== undefined) {
      taskUpdateData.completedAt = completedAt ? new Date(completedAt) : null;
    }
    
    // If status is changing to COMPLETED or FAILED, set completedAt if not provided
    if (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED) {
      // Use type assertion with a more specific type
      (taskUpdateData as Prisma.TaskUpdateInput & { completedAt: Date }).completedAt = new Date();
    }
    
    // If status is changing to WAITING_FOR_RESPONSE, set waitingSince if not provided
    if (status === TaskStatus.WAITING_FOR_RESPONSE && waitingSince === undefined && waitingFor) {
      taskUpdateData.waitingSince = new Date();
    }
    
    // Update the task
    const updatedTask = await prisma.task.update({
      where: {
        id: taskId,
      },
      data: taskUpdateData,
      include: {
        steps: true,
      },
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
