import { prisma } from "@/lib/db/prisma";
import { Prisma, Task, TaskStatus, TaskType } from "@prisma/client";

/**
 * Creates a task with proper handling of currentStep in metadata
 * This ensures consistent task creation across the application
 * 
 * Note: All multi-step task state is stored in the metadata JSON field
 * since the Task model doesn't have columns for currentStep, totalSteps, etc.
 */
export async function createTask({
  userId,
  title,
  description,
  type,
  status = "PENDING",
  metadata = {},
  waitingFor = null,
  waitingSince = null,
  resumeAfter = null,
  parentTaskId = null,
}: {
  userId: string;
  title: string;
  description?: string;
  type: TaskType;
  status?: TaskStatus;
  metadata?: Record<string, unknown>;
  waitingFor?: string | null;
  waitingSince?: Date | null;
  resumeAfter?: Date | null;
  parentTaskId?: string | null;
}): Promise<Task> {
  // All task state information must be stored in the metadata JSON field
  // since the Task model doesn't have columns for these fields
  const enhancedMetadata: Record<string, unknown> = {
    ...metadata,
    // Ensure currentStep is set in metadata (default to 1)
    currentStep: metadata.currentStep || 1,
    // Store these fields in metadata since they don't exist as direct columns
    waitingFor: waitingFor,
    waitingSince: waitingSince,
    resumeAfter: resumeAfter,
    parentTaskId: parentTaskId,
  };

  // Create the task with all information stored in metadata
  return prisma.task.create({
    data: {
      userId,
      title,
      description,
      type,
      status,
      metadata: enhancedMetadata as Prisma.InputJsonValue,
    },
  });
}
