import { TaskStatus } from "@prisma/client";

/**
 * Client-side utility functions for managing tasks and task states
 */

/**
 * Set a task to waiting state
 */
export async function setTaskWaiting(
  taskId: string, 
  waitingFor: string, 
  waitingDuration?: number, 
  stepId?: string
) {
  try {
    const response = await fetch('/api/tasks/state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        taskId,
        newStatus: TaskStatus.WAITING_FOR_RESPONSE,
        waitingFor,
        waitingDuration,
        stepId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to set task to waiting state');
    }

    return await response.json();
  } catch (error) {
    console.error('Error setting task to waiting state:', error);
    throw error;
  }
}

/**
 * Resume a task from waiting state
 */
export async function resumeTask(
  taskId: string, 
  response?: any, 
  stepId?: string
) {
  try {
    const apiResponse = await fetch('/api/tasks/state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        taskId,
        newStatus: TaskStatus.IN_PROGRESS,
        response,
        stepId,
      }),
    });

    if (!apiResponse.ok) {
      const error = await apiResponse.json();
      throw new Error(error.error || 'Failed to resume task');
    }

    return await apiResponse.json();
  } catch (error) {
    console.error('Error resuming task:', error);
    throw error;
  }
}

/**
 * Complete a task
 */
export async function completeTask(
  taskId: string, 
  stepId?: string, 
  advanceToNextStep: boolean = false
) {
  try {
    const response = await fetch('/api/tasks/state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        taskId,
        newStatus: TaskStatus.COMPLETED,
        stepId,
        advanceToNextStep,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to complete task');
    }

    return await response.json();
  } catch (error) {
    console.error('Error completing task:', error);
    throw error;
  }
}

/**
 * Mark a task as failed
 */
export async function failTask(
  taskId: string, 
  response?: any, 
  stepId?: string
) {
  try {
    const apiResponse = await fetch('/api/tasks/state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        taskId,
        newStatus: TaskStatus.FAILED,
        response,
        stepId,
      }),
    });

    if (!apiResponse.ok) {
      const error = await apiResponse.json();
      throw new Error(error.error || 'Failed to mark task as failed');
    }

    return await apiResponse.json();
  } catch (error) {
    console.error('Error marking task as failed:', error);
    throw error;
  }
}

/**
 * Get all tasks in waiting state
 */
export async function getWaitingTasks(options: {
  waitingFor?: string;
  includeSteps?: boolean;
  includeExpired?: boolean;
} = {}) {
  try {
    const { waitingFor, includeSteps, includeExpired } = options;
    
    let url = '/api/tasks/waiting';
    const params = new URLSearchParams();
    
    if (waitingFor) {
      params.append('waitingFor', waitingFor);
    }
    
    if (includeSteps) {
      params.append('includeSteps', 'true');
    }
    
    if (includeExpired) {
      params.append('includeExpired', 'true');
    }
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get waiting tasks');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting waiting tasks:', error);
    throw error;
  }
}

/**
 * Advance a task to the next step
 */
export async function advanceTaskStep(taskId: string, currentStepId: string) {
  try {
    const response = await fetch('/api/tasks/state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        taskId,
        newStatus: TaskStatus.COMPLETED,
        stepId: currentStepId,
        advanceToNextStep: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to advance task step');
    }

    return await response.json();
  } catch (error) {
    console.error('Error advancing task step:', error);
    throw error;
  }
}

/**
 * Create a multi-step task
 */
export async function createMultiStepTask(taskData: {
  title: string;
  description?: string;
  type: string;
  steps: Array<{
    title: string;
    description?: string;
    status?: TaskStatus;
  }>;
  parentTaskId?: string;
  metadata?: Record<string, any>;
}) {
  try {
    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(taskData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create multi-step task');
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating multi-step task:', error);
    throw error;
  }
}

/**
 * Format a waiting duration for display
 */
export function formatWaitingDuration(waitingSince: string | Date | null): string {
  if (!waitingSince) return 'Not waiting';
  
  const waitingDate = typeof waitingSince === 'string' 
    ? new Date(waitingSince) 
    : waitingSince;
  
  const now = new Date();
  const diffMs = now.getTime() - waitingDate.getTime();
  
  // Less than a minute
  if (diffMs < 60000) {
    return 'Just now';
  }
  
  // Less than an hour
  if (diffMs < 3600000) {
    const minutes = Math.floor(diffMs / 60000);
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  
  // Less than a day
  if (diffMs < 86400000) {
    const hours = Math.floor(diffMs / 3600000);
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  
  // More than a day
  const days = Math.floor(diffMs / 86400000);
  return `${days} day${days !== 1 ? 's' : ''}`;
}

/**
 * Check if a task is waiting for a response
 */
export function isTaskWaiting(task: any): boolean {
  return task?.status === TaskStatus.WAITING_FOR_RESPONSE;
}

/**
 * Check if a task has expired its waiting time
 */
export function hasTaskWaitingExpired(task: any): boolean {
  if (!isTaskWaiting(task) || !task.resumeAfter) return false;
  
  const resumeAfter = new Date(task.resumeAfter);
  const now = new Date();
  
  return now > resumeAfter;
}

/**
 * Get the current step of a multi-step task
 */
export function getCurrentStep(task: any): any {
  if (!task?.steps || task.steps.length === 0) return null;
  
  return task.steps.find((step: any) => step.stepNumber === task.currentStep) || null;
}

/**
 * Calculate the progress percentage of a multi-step task
 */
export function calculateTaskProgress(task: any): number {
  if (!task?.totalSteps || task.totalSteps === 0) return 0;
  
  const completedSteps = task.steps?.filter((step: any) => 
    step.status === TaskStatus.COMPLETED
  ).length || 0;
  
  return Math.round((completedSteps / task.totalSteps) * 100);
}
