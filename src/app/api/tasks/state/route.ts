import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";
import { Prisma, TaskStatus } from "@prisma/client";
import { z } from "zod";

// Define custom types to avoid type comparison issues
type Task = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: string;
  type: string;
  metadata: Prisma.JsonValue;
  currentStep?: number;
  totalSteps?: number;
  waitingFor?: string | null;
  waitingSince?: Date | null;
  resumeAfter?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// Define a type for TaskStep that matches the schema
type TaskStep = {
  id: string;
  taskId: string;
  stepNumber: number;
  title: string;
  description?: string | null;
  status: string; // Using string instead of TaskStatus enum to avoid type comparison issues
  metadata?: Prisma.JsonValue | null;
  waitingFor?: string | null;
  waitingSince?: Date | null;
  resumeAfter?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// Schema for state transition request
const stateTransitionSchema = z.object({
  taskId: z.string(),
  newStatus: z.enum([
    "PENDING",
    "IN_PROGRESS",
    "COMPLETED",
    "FAILED",
    "WAITING_FOR_RESPONSE"
  ]),
  waitingFor: z.string().optional(),
  waitingDuration: z.number().optional(), // in minutes
  response: z.any().optional(),
  stepId: z.string().optional(),
  advanceToNextStep: z.boolean().optional(),
});

/**
 * POST handler for task state transitions
 * This endpoint handles all task state transitions, including:
 * - Setting a task to waiting state
 * - Resuming a task from waiting state
 * - Completing a task
 * - Failing a task
 * - Setting a task back to pending or in progress
 */
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
    
    // Parse and validate the request body
    const body = await request.json();
    const validationResult = stateTransitionSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const { 
      taskId, 
      newStatus, 
      waitingFor, 
      waitingDuration, 
      response,
      stepId,
      advanceToNextStep
    } = validationResult.data;
    
    // Verify the task exists and belongs to the user
    const task = await prisma.task.findUnique({
      where: {
        id: taskId,
        userId,
      },
      include: {
        steps: true,
      },
    }) as (Task & { steps: TaskStep[] }) | null;
    
    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }
    
    // Prepare the update data for the task
    const updateData: Prisma.TaskUpdateInput = {
      status: newStatus as TaskStatus,
    };
    
    // Handle metadata updates
    let updatedMetadata = (task.metadata as Prisma.JsonObject) || {};
    
    // Handle waiting state
    if (newStatus === "WAITING_FOR_RESPONSE") {
      if (!waitingFor) {
        return NextResponse.json(
          { error: "waitingFor is required when setting status to WAITING_FOR_RESPONSE" },
          { status: 400 }
        );
      }
      
      const now = new Date();
      updateData.waitingFor = waitingFor;
      updateData.waitingSince = now;
      
      // Set resumeAfter if waitingDuration is provided
      let resumeAfterDate: Date | null = null;
      if (waitingDuration) {
        resumeAfterDate = new Date(now.getTime() + waitingDuration * 60 * 1000);
        updateData.resumeAfter = resumeAfterDate;
      }
      
      // Update metadata
      const waitingHistory = Array.isArray(updatedMetadata.waitingHistory) ? updatedMetadata.waitingHistory : [];
      updatedMetadata = {
        ...updatedMetadata,
        waitingHistory: [
          ...waitingHistory,
          {
            timestamp: now.toISOString(),
            waitingFor,
            resumeAfter: resumeAfterDate ? resumeAfterDate.toISOString() : null,
          }
        ]
      };
    } else {
      // Clear waiting state fields when not waiting
      updateData.waitingFor = null;
      updateData.waitingSince = null;
      updateData.resumeAfter = null;
      
      // Add response to metadata if provided
      if (response !== undefined) {
        const responses = Array.isArray(updatedMetadata.responses) ? updatedMetadata.responses : [];
        updatedMetadata = {
          ...updatedMetadata,
          responses: [
            ...responses,
            {
              timestamp: new Date().toISOString(),
              response,
              previousStatus: task.status,
              newStatus,
            }
          ]
        };
      }
    }
    
    // Handle completion
    if (newStatus === "COMPLETED") {
      updateData.completedAt = new Date();
    } else if (task.status === "COMPLETED") {
      // If un-completing a task, clear the completedAt field
      updateData.completedAt = null;
    }
    
    // Update the metadata
    updateData.metadata = updatedMetadata as Prisma.InputJsonValue;
    
    // Handle step-specific updates
    let updatedStep = null;
    if (stepId) {
      // Find the specific step
      const step = task.steps?.find(s => s.id === stepId);
      
      if (!step) {
        return NextResponse.json(
          { error: "Step not found" },
          { status: 404 }
        );
      }
      
      // Prepare step update data
      const stepUpdateData: Prisma.TaskStepUpdateInput = {
        status: newStatus as TaskStatus,
      };
      
      // Handle step waiting state
      if (newStatus === "WAITING_FOR_RESPONSE") {
        stepUpdateData.waitingFor = waitingFor;
        stepUpdateData.waitingSince = new Date();
        
        if (waitingDuration) {
          stepUpdateData.resumeAfter = new Date(Date.now() + waitingDuration * 60 * 1000);
        } else {
          stepUpdateData.resumeAfter = null;
        }
      } else {
        stepUpdateData.waitingFor = null;
        stepUpdateData.waitingSince = null;
        stepUpdateData.resumeAfter = null;
      }
      
      // Handle step completion
      if (newStatus === "COMPLETED") {
        stepUpdateData.completedAt = new Date();
      } else if (step.status === "COMPLETED") {
        // If changing from COMPLETED to another status, clear completedAt
        stepUpdateData.completedAt = null;
      }
      
      // Update step metadata
      const stepMetadata = (step.metadata as Prisma.JsonObject) || {};
      const existingHistory = Array.isArray(stepMetadata.statusHistory) ? stepMetadata.statusHistory : [];
      stepUpdateData.metadata = {
        ...stepMetadata,
        statusHistory: [
          ...existingHistory,
          {
            timestamp: new Date().toISOString(),
            previousStatus: step.status,
            newStatus,
          }
        ]
      } as Prisma.InputJsonValue;
      
      // Add response to step metadata if provided
      if (response !== undefined) {
        const metadata = stepUpdateData.metadata as Prisma.JsonObject;
        const responses = Array.isArray(metadata.responses) ? metadata.responses : [];
        metadata.responses = [
          ...responses,
          {
            timestamp: new Date().toISOString(),
            response,
          }
        ];
        stepUpdateData.metadata = metadata as Prisma.InputJsonValue;
      }
      
      // Update the step
      updatedStep = await prisma.taskStep.update({
        where: {
          id: stepId,
        },
        data: stepUpdateData,
      });
      
      // Handle advancing to next step if requested and current step is completed
      if (advanceToNextStep && newStatus === "COMPLETED") {
        const nextStepNumber = step.stepNumber + 1;
        
        // Check if there is a next step
        const nextStep = task.steps?.find(s => s.stepNumber === nextStepNumber);
        
        if (nextStep) {
          // Store the current step in metadata instead of using the currentStep field
          // since currentStep doesn't exist in the database
          const updatedMetadataWithStep = updateData.metadata as Prisma.JsonObject || {};
          updatedMetadataWithStep.currentStep = nextStepNumber;
          updateData.metadata = updatedMetadataWithStep;
        }
      }
    }
    
    // Update the task
    const updatedTask = await prisma.task.update({
      where: {
        id: taskId,
      },
      data: updateData,
      include: {
        steps: true,
      },
    });
    
    return NextResponse.json({
      task: updatedTask,
      updatedStep,
    });
  } catch (error) {
    console.error("Error updating task state:", error);
    return NextResponse.json(
      { error: "Failed to update task state" },
      { status: 500 }
    );
  }
}
