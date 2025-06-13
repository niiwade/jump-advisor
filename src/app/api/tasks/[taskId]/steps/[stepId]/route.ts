import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";
import { TaskStatus, Prisma } from "@prisma/client";
import type { TaskMetadata } from "@/types/task";
import type { RouteContext } from "@/types/next";

// GET a specific step by ID
export async function GET(
  request: NextRequest,
  { params }: RouteContext<{ taskId: string; stepId: string }>
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
    const { taskId, stepId } = await params;
    
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
  { params }: RouteContext<{ taskId: string; stepId: string }>
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
    const { taskId, stepId } = await params;
    
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
      resumeAfter
    } = updateData;
    
    // Prepare update data using Prisma's TaskStepUpdateInput type
    const stepUpdateData: Prisma.TaskStepUpdateInput = {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      metadata: {
        ...(metadata as object || {}),
        status,
        ...(waitingFor !== undefined && { waitingFor }),
        ...(waitingSince !== undefined && { waitingSince }),
        ...(resumeAfter !== undefined && { resumeAfter }),
        ...(status === TaskStatus.COMPLETED && { completedAt: new Date().toISOString() })
      }
    };

    const updatedStep = await prisma.taskStep.update({
      where: { id: stepId },
      data: stepUpdateData
    }) as {
      id: string;
      status: TaskStatus;
      stepNumber: number;
      metadata: Prisma.JsonValue;
      taskId: string;
      createdAt: Date;
      updatedAt: Date;
    };

    // If this step is completed and it's the current step, advance the task to the next step
    if (status === TaskStatus.COMPLETED && (task.metadata as {currentStep: number})?.currentStep === updatedStep.stepNumber) {
      // Check if there's a next step
      const nextStep = await prisma.taskStep.findFirst({
        where: {
          AND: [
            { taskId },
            { metadata: { path: ['stepNumber'], equals: updatedStep.stepNumber + 1 } }
          ]
        },
      });
      
      if (nextStep) {
        // Update the task to the next step
        await prisma.task.update({
          where: {
            id: taskId,
          },
          data: {
            metadata: {
              currentStep: updatedStep.stepNumber + 1,
              status: (nextStep.metadata as TaskMetadata)?.status || TaskStatus.PENDING,
              waitingFor: (nextStep.metadata as TaskMetadata)?.waitingFor || null,
              waitingSince: (nextStep.metadata as TaskMetadata)?.waitingSince || null,
              resumeAfter: (nextStep.metadata as TaskMetadata)?.resumeAfter || null,
            },
          },
        });
      } else {
        // This was the last step, mark the task as completed
        await prisma.task.update({
          where: {
            id: taskId,
          },
          data: {
            metadata: {
              status: TaskStatus.COMPLETED,
              waitingFor: null,
              waitingSince: null,
              resumeAfter: null,
            },
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
  { params }: RouteContext<{ taskId: string; stepId: string }>
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
    const { taskId, stepId } = await params;
    
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
    }) as {
      id: string;
      status: TaskStatus;
      stepNumber: number;
      metadata: Prisma.JsonValue;
      taskId: string;
      createdAt: Date;
      updatedAt: Date;
    };
    
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
    const taskTotalSteps = (task.metadata as {totalSteps?: number})?.totalSteps;
    if (taskTotalSteps && stepToDelete.stepNumber < taskTotalSteps) {
      // Get all steps with higher step numbers
      const stepsToUpdate = await prisma.taskStep.findMany({
        where: {
          taskId,
          metadata: {
            path: ['stepNumber'],
            gt: stepToDelete.stepNumber
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      });
      
      // Update step numbers
      for (const step of stepsToUpdate) {
        await prisma.taskStep.update({
          where: {
            id: step.id,
          },
          data: {
            metadata: {
              stepNumber: (step.metadata as {stepNumber: number})?.stepNumber - 1
            }
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
        metadata: {
          ...(task.metadata as {totalSteps?: number, currentStep?: number}),
          totalSteps: (task.metadata as {totalSteps?: number})?.totalSteps ? 
            (task.metadata as {totalSteps: number}).totalSteps - 1 : 0,
          currentStep: 
            (task.metadata as {currentStep?: number})?.currentStep === undefined ? 1 :
            (task.metadata as {currentStep: number}).currentStep > stepToDelete.stepNumber ? 
              (task.metadata as {currentStep: number}).currentStep - 1 :
            (task.metadata as {currentStep: number}).currentStep === stepToDelete.stepNumber ?
              Math.min(stepToDelete.stepNumber, ((task.metadata as {totalSteps?: number})?.totalSteps || 1) - 1) :
              (task.metadata as {currentStep: number}).currentStep
        }
      }
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
