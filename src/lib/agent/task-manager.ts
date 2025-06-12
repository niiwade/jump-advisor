import { prisma } from "@/lib/db/prisma";
import { TaskStatus } from "@prisma/client";

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
  static async resumeTask(task: any) {
    try {
      console.log(`Resuming task ${task.id}: ${task.title}`);
      
      // Update the task metadata with auto-resume information
      const updatedMetadata = {
        ...(task.metadata || {}),
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
        const currentStep = task.steps.find((step: any) => step.stepNumber === task.currentStep);
        
        if (currentStep) {
          const stepMetadata = {
            ...(currentStep.metadata || {}),
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
  static async manuallyResumeTask(taskId: string, response?: any) {
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
      const updatedMetadata = {
        ...(task.metadata || {}),
        manuallyResumed: true,
        resumeTime: new Date().toISOString(),
        waitedFor: task.waitingFor,
        waitingSince: task.waitingSince?.toISOString(),
      };
      
      // Add response if provided
      if (response !== undefined) {
        updatedMetadata.responses = [
          ...(updatedMetadata.responses || []),
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
        const currentStep = task.steps.find((step: any) => step.stepNumber === task.currentStep);
        
        if (currentStep) {
          const stepMetadata = {
            ...(currentStep.metadata || {}),
            manuallyResumed: true,
            resumeTime: new Date().toISOString(),
            waitedFor: currentStep.waitingFor,
            waitingSince: currentStep.waitingSince?.toISOString(),
          };
          
          // Add response if provided
          if (response !== undefined) {
            stepMetadata.responses = [
              ...(stepMetadata.responses || []),
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
