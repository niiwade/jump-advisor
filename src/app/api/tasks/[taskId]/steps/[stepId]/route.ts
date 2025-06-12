import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";
import { TaskStatus, Prisma } from "@prisma/client";

// GET a specific step by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string; stepId: string } }
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
    const { taskId, stepId } = params;
    
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
    
    // Get the specific step
    const step = await prisma.taskStep.findUnique({
      where: {
        id: stepId,
        taskId, // Ensure the step belongs to the task
      },
    });
    
    if (!step) {
      return NextResponse.json(
        { error: "Step not found" },
        { status: 404 }
      );
    }
    
    return NextResponse.json(step);
  } catch (error) {
    console.error("Error fetching task step:", error);
    return NextResponse.json(
      { error: "Failed to fetch task step" },
      { status: 500 }
    );
  }
}

// PATCH to update a specific step
export async function PATCH(
  request: NextRequest,
  { params }: { params: { taskId: string; stepId: string } }
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
    const { taskId, stepId } = params;
    
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
    
    // Get the update data
    const updateData = await request.json();
    const { 
      title, 
      description, 
      status,
      metadata,
      waitingFor,
      waitingSince,
      resumeAfter,
      completedAt
    } = updateData;
    
    // Prepare update data using Prisma's TaskStepUpdateInput type
    const stepUpdateData: Prisma.TaskStepUpdateInput = {};
    
    if (title !== undefined) stepUpdateData.title = title;
    if (description !== undefined) stepUpdateData.description = description;
    if (status !== undefined) stepUpdateData.status = status;
    if (metadata !== undefined) stepUpdateData.metadata = metadata;
    if (waitingFor !== undefined) stepUpdateData.waitingFor = waitingFor;
    
    // Handle date fields
    if (waitingSince !== undefined) {
      stepUpdateData.waitingSince = waitingSince ? new Date(waitingSince) : null;
    }
    
    if (resumeAfter !== undefined) {
      stepUpdateData.resumeAfter = resumeAfter ? new Date(resumeAfter) : null;
    }
    
    if (completedAt !== undefined) {
      stepUpdateData.completedAt = completedAt ? new Date(completedAt) : null;
    }
    
    // If status is changing to COMPLETED, set completedAt if not provided
    if (status === TaskStatus.COMPLETED && completedAt === undefined) {
      stepUpdateData.completedAt = new Date();
    }
    
    // If status is changing to WAITING_FOR_RESPONSE, set waitingSince if not provided
    if (status === TaskStatus.WAITING_FOR_RESPONSE && waitingSince === undefined && waitingFor) {
      stepUpdateData.waitingSince = new Date();
    }
    
    // Update the step
    const updatedStep = await prisma.taskStep.update({
      where: {
        id: stepId,
      },
      data: stepUpdateData,
    });
    
    // If this step is completed and it's the current step, advance the task to the next step
    if (status === TaskStatus.COMPLETED && task.currentStep === updatedStep.stepNumber) {
      // Check if there's a next step
      const nextStep = await prisma.taskStep.findFirst({
        where: {
          taskId,
          stepNumber: updatedStep.stepNumber + 1,
        },
      });
      
      if (nextStep) {
        // Update the task to the next step
        await prisma.task.update({
          where: {
            id: taskId,
          },
          data: {
            currentStep: updatedStep.stepNumber + 1,
            status: nextStep.status, // Inherit the status of the next step
            waitingFor: nextStep.waitingFor,
            waitingSince: nextStep.waitingSince,
            resumeAfter: nextStep.resumeAfter,
          },
        });
      } else {
        // This was the last step, mark the task as completed
        await prisma.task.update({
          where: {
            id: taskId,
          },
          data: {
            status: TaskStatus.COMPLETED,
            completedAt: new Date(),
            waitingFor: null,
            waitingSince: null,
            resumeAfter: null,
          },
        });
      }
    }
    
    return NextResponse.json(updatedStep);
  } catch (error) {
    console.error("Error updating task step:", error);
    return NextResponse.json(
      { error: "Failed to update task step" },
      { status: 500 }
    );
  }
}

// DELETE a specific step
export async function DELETE(
  request: NextRequest,
  { params }: { params: { taskId: string; stepId: string } }
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
    const { taskId, stepId } = params;
    
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
    
    // Get the step to be deleted
    const stepToDelete = await prisma.taskStep.findUnique({
      where: {
        id: stepId,
        taskId,
      },
    });
    
    if (!stepToDelete) {
      return NextResponse.json(
        { error: "Step not found" },
        { status: 404 }
      );
    }
    
    // Delete the step
    await prisma.taskStep.delete({
      where: {
        id: stepId,
      },
    });
    
    // Reorder remaining steps if necessary
    if (stepToDelete.stepNumber < task.totalSteps) {
      // Get all steps with higher step numbers
      const stepsToUpdate = await prisma.taskStep.findMany({
        where: {
          taskId,
          stepNumber: {
            gt: stepToDelete.stepNumber,
          },
        },
        orderBy: {
          stepNumber: "asc",
        },
      });
      
      // Update step numbers
      for (const step of stepsToUpdate) {
        await prisma.taskStep.update({
          where: {
            id: step.id,
          },
          data: {
            stepNumber: step.stepNumber - 1,
          },
        });
      }
    }
    
    // Update the task's total steps
    await prisma.task.update({
      where: {
        id: taskId,
      },
      data: {
        totalSteps: task.totalSteps - 1,
        // If the current step was deleted or was after the deleted step, adjust it
        currentStep: task.currentStep > stepToDelete.stepNumber 
          ? task.currentStep - 1 
          : task.currentStep === stepToDelete.stepNumber 
            ? Math.min(stepToDelete.stepNumber, task.totalSteps - 1) 
            : task.currentStep,
      },
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting task step:", error);
    return NextResponse.json(
      { error: "Failed to delete task step" },
      { status: 500 }
    );
  }
}
