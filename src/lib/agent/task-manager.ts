import { prisma } from "@/lib/db/prisma";
import { TaskStatus, Task } from "@prisma/client";
import { JsonValue } from "@prisma/client/runtime/library";

type JsonObject = { [Key in string]?: JsonValue };

// Define interfaces for task and step with metadata
interface TaskWithSteps extends Omit<Task, 'metadata' | 'currentStep'> {
  steps?: TaskStepWithMetadata[];
  metadata?: JsonValue;
  title: string;
  currentStep: number;
}

interface TaskStepWithMetadata {
  id: string;
  stepNumber: number;
  status?: string;
  metadata?: JsonValue;
  waitingFor?: string | null;
  waitingSince?: Date | null;
  resumeAfter?: Date | null;
}

// Interval in milliseconds for checking waiting tasks (default: 1 minute)
const CHECK_INTERVAL = 60 * 1000;

// In-memory tracking of the task manager state
let isRunning = false;
let lastCheckTime: Date | null = null;
let checkInterval: NodeJS.Timeout | null = null;

/**
 * Task Manager service that periodically checks for tasks that need to be resumed
 * based on their resumeAfter timestamp
 */
export class TaskManager {
  /**
   * Start the task manager service
   */
  static start() {
    if (isRunning) {
      console.log("Task Manager is already running");
      return;
    }

    console.log("Starting Task Manager service");
    isRunning = true;
    
    // Run an initial check
    this.checkWaitingTasks();
    
    // Set up the interval for periodic checks
    checkInterval = setInterval(() => {
      this.checkWaitingTasks();
    }, CHECK_INTERVAL);
  }
  
  /**
   * Stop the task manager service
   */
  static stop() {
    if (!isRunning) {
      console.log("Task Manager is not running");
      return;
    }
    
    console.log("Stopping Task Manager service");
    
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
    
    isRunning = false;
  }
  
  /**
   * Get the current status of the task manager
   */
  static getStatus() {
    return {
      isRunning,
      lastCheckTime,
    };
  }
  
  /**
   * Check for tasks that are in a waiting state and need to be resumed
   */
  static async checkWaitingTasks() {
    try {
      console.log("Checking for waiting tasks that need to be resumed");
      lastCheckTime = new Date();
      
      // Find tasks that are waiting and have a resumeAfter time in the past
      const tasksToResume = await prisma.task.findMany({
        where: {
          status: TaskStatus.WAITING_FOR_RESPONSE,
          resumeAfter: {
            not: null,
            lt: new Date(), // resumeAfter is in the past
          },
        },
        include: {
          steps: true,
        },
      });
      
      console.log(`Found ${tasksToResume.length} tasks to resume`);
      
      // Process each task
      for (const task of tasksToResume) {
        await this.resumeTask(task);
      }
      
      return tasksToResume;
    } catch (error) {
      console.error("Error checking waiting tasks:", error);
      return [];
    }
  }
  
  /**
   * Resume a task that was in a waiting state
   */
  static async resumeTask(task: TaskWithSteps) {
    try {
      console.log(`Resuming task ${task.id}: ${task.title}`);
      
      // Update the task metadata with auto-resume information
      const updatedMetadata: JsonValue = typeof task.metadata === 'object' && task.metadata !== null
        ? {
            ...task.metadata as Record<string, unknown>,
            autoResumed: true,
            autoResumeTime: new Date().toISOString(),
            waitedFor: task.waitingFor,
            waitingSince: task.waitingSince?.toISOString(),
          }
        : {
            autoResumed: true,
            autoResumeTime: new Date().toISOString(),
            waitedFor: task.waitingFor,
            waitingSince: task.waitingSince?.toISOString(),
          };
      
      // Update the task
      await prisma.task.update({
        where: {
          id: task.id,
        },
        data: {
          status: TaskStatus.IN_PROGRESS,
          waitingFor: null,
          waitingSince: null,
          resumeAfter: null,
          metadata: updatedMetadata,
        },
      });
      
      // If the task has steps, update the current step as well
      if (task.steps && task.steps.length > 0) {
        const currentStep = task.steps.find((step: TaskStepWithMetadata) => step.stepNumber === task.currentStep);
        
        if (currentStep) {
          const stepMetadata: JsonValue = typeof currentStep.metadata === 'object' && currentStep.metadata !== null
            ? {
                ...currentStep.metadata as Record<string, unknown>,
                autoResumed: true,
                autoResumeTime: new Date().toISOString(),
                waitedFor: currentStep.waitingFor,
                waitingSince: currentStep.waitingSince?.toISOString(),
              }
            : {
                autoResumed: true,
                autoResumeTime: new Date().toISOString(),
                waitedFor: currentStep.waitingFor,
                waitingSince: currentStep.waitingSince?.toISOString(),
              };
          
          await prisma.taskStep.update({
            where: {
              id: currentStep.id,
            },
            data: {
              status: TaskStatus.IN_PROGRESS,
              waitingFor: null,
              waitingSince: null,
              resumeAfter: null,
              metadata: stepMetadata,
            },
          });
        }
      }
      
      console.log(`Successfully resumed task ${task.id}`);
      return true;
    } catch (error) {
      console.error(`Error resuming task ${task.id}:`, error);
      return false;
    }
  }
  
  /**
   * Manually resume a specific task
   */
  static async manuallyResumeTask(taskId: string, response?: string) {
    try {
      // Find the task
      const task = await prisma.task.findUnique({
        where: {
          id: taskId,
          status: TaskStatus.WAITING_FOR_RESPONSE,
        },
        include: {
          steps: true,
        },
      });
      
      if (!task) {
        throw new Error("Task not found or not in waiting state");
      }
      
      // Update the task metadata with manual resume information
      const updatedMetadata: JsonValue = typeof task.metadata === 'object' && task.metadata !== null
        ? {
            ...task.metadata as Record<string, unknown>,
            manuallyResumed: true,
            manualResumeTime: new Date().toISOString(),
            userResponse: response || null,
            waitedFor: task.waitingFor,
            waitingSince: task.waitingSince?.toISOString(),
          }
        : {
            manuallyResumed: true,
            manualResumeTime: new Date().toISOString(),
            userResponse: response || null,
            waitedFor: task.waitingFor,
            waitingSince: task.waitingSince?.toISOString(),
          };
      
      // Add response if provided
      if (response !== undefined && typeof updatedMetadata === 'object' && updatedMetadata !== null) {
        const metadataObj = updatedMetadata as JsonObject;
        const existingResponses = Array.isArray(metadataObj.responses) ? metadataObj.responses : [];
        
        metadataObj.responses = [
          ...existingResponses,
          {
            timestamp: new Date().toISOString(),
            response,
            waitedFor: task.waitingFor,
          }
        ];
      }
      
      // Update the task
      await prisma.task.update({
        where: {
          id: taskId,
        },
        data: {
          status: TaskStatus.IN_PROGRESS,
          waitingFor: null,
          waitingSince: null,
          resumeAfter: null,
          metadata: updatedMetadata,
        },
      });
      
      // If the task has steps, update the current step as well
      if (task.steps && task.steps.length > 0) {
        const currentStep = task.steps.find((step: TaskStepWithMetadata) => step.stepNumber === task.currentStep);
        
        if (currentStep) {
          const stepMetadata: JsonValue = typeof currentStep.metadata === 'object' && currentStep.metadata !== null
            ? {
                ...currentStep.metadata as Record<string, unknown>,
                manuallyResumed: true,
                manualResumeTime: new Date().toISOString(),
                userResponse: response || null,
                waitedFor: currentStep.waitingFor,
                waitingSince: currentStep.waitingSince?.toISOString(),
              }
            : {
                manuallyResumed: true,
                manualResumeTime: new Date().toISOString(),
                userResponse: response || null,
                waitedFor: currentStep.waitingFor,
                waitingSince: currentStep.waitingSince?.toISOString(),
              };
          
          // Add response if provided
          if (response !== undefined && typeof stepMetadata === 'object' && stepMetadata !== null) {
            const metadataObj = stepMetadata as JsonObject;
            const existingResponses = Array.isArray(metadataObj.responses) ? metadataObj.responses : [];
            
            metadataObj.responses = [
              ...existingResponses,
              {
                timestamp: new Date().toISOString(),
                response,
                waitedFor: currentStep.waitingFor,
              }
            ];
          }
          
          await prisma.taskStep.update({
            where: {
              id: currentStep.id,
            },
            data: {
              status: TaskStatus.IN_PROGRESS,
              waitingFor: null,
              waitingSince: null,
              resumeAfter: null,
              metadata: stepMetadata,
            },
          });
        }
      }
      
      return true;
    } catch (error) {
      console.error(`Error manually resuming task ${taskId}:`, error);
      return false;
    }
  }
}
