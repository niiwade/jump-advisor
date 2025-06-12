import { importEmails } from "@/lib/api/gmail";
import { importCalendarEvents } from "@/lib/api/calendar";
import { importHubspotContacts } from "@/lib/api/hubspot";
import { prisma } from "@/lib/db/prisma";
import { createTask } from "@/lib/task/task-utils";

// Define a type for task metadata
interface TaskMetadata {
  currentStep?: number;
  totalSteps?: number;
  progress?: number;
  total?: number;
  errors?: string[];
  warnings?: string[];
  stats?: Record<string, unknown>;
  steps?: Array<{
    stepNumber: number;
    title: string;
    description?: string;
    status?: string;
    metadata?: Record<string, unknown>;
  }>;
  [key: string]: unknown;
}

// We don't need this interface as we're using direct casting

// Helper function to safely serialize metadata for Prisma
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeMetadata(metadata: Record<string, unknown>): any {
  return JSON.parse(JSON.stringify(metadata));
}

// Define interface for import results
interface ImportResult {
  success: boolean;
  count?: number;
  error?: string;
  stats?: {
    totalEmails: number;
    processedEmails: number;
    failedEmails: number;
    skippedEmails: number;
  };
  errors?: string[];
  warnings?: string[];
}

// Define interface for task results
interface TaskSuccessResult {
  success: true;
  taskId: string;
  count: number;
  stats?: ImportResult['stats'];
  errors?: string[];
  warnings?: string[];
}

interface TaskErrorResult {
  success: false;
  taskId?: string;
  error: string;
  stats?: ImportResult['stats'];
  errors?: string[];
  warnings?: string[];
}

type TaskResult = TaskSuccessResult | TaskErrorResult;

// Helper type guard function
function isSuccessResult(result: ImportResult): result is ImportResult & { success: true; count: number } {
  return result.success === true && typeof result.count === 'number';
}

// Ingest all data for a user
export async function ingestAllData(userId: string): Promise<TaskResult> {
  try {
    console.log(`Starting data ingestion for user ${userId}`);
    
    // Create a task to track ingestion progress using the utility function
    const task = await createTask({
      userId,
      title: "Data Ingestion",
      description: "Importing emails, calendar events, and contacts for RAG",
      type: "GENERAL",
      status: "IN_PROGRESS",
      metadata: {
        progress: 0,
        total: 3, // Three steps: emails, calendar, contacts
        errors: [],
        // Store steps information in metadata since there's no steps relation
        steps: [
          {
            stepNumber: 1,
            title: "Email Import",
            description: "Importing emails for RAG",
            status: "PENDING"
          },
          {
            stepNumber: 2,
            title: "Calendar Import",
            description: "Importing calendar events for RAG",
            status: "PENDING"
          },
          {
            stepNumber: 3,
            title: "Contact Import",
            description: "Importing HubSpot contacts for RAG",
            status: "PENDING"
          }
        ]
      }
    });
    
    // Import data in parallel
    const [emailResult, calendarResult, contactResult] = await Promise.all([
      importEmails(userId).catch(error => {
        console.error("Error importing emails:", error);
        return { success: false, error: "Failed to import emails" };
      }),
      importCalendarEvents(userId).catch(error => {
        console.error("Error importing calendar events:", error);
        return { success: false, error: "Failed to import calendar events" };
      }),
      importHubspotContacts(userId).catch(error => {
        console.error("Error importing HubSpot contacts:", error);
        return { success: false, error: "Failed to import HubSpot contacts" };
      }),
    ]);
    
    // Update task with results
    await prisma.task.update({
      where: { id: task.id },
      data: {
        status: "COMPLETED",
        metadata: {
          progress: 100,
          total: 3,
          errors: [
            ...(!emailResult.success && emailResult.error ? [emailResult.error] : []),
            ...(!calendarResult.success && calendarResult.error ? [calendarResult.error] : []),
            ...(!contactResult.success && contactResult.error ? [contactResult.error] : []),
          ],
        },
      },
    });
    
    // Use type guards to safely access properties
    const totalCount = (
      (isSuccessResult(emailResult) ? emailResult.count : 0) +
      (isSuccessResult(calendarResult) ? calendarResult.count : 0) +
      (isSuccessResult(contactResult) ? contactResult.count : 0)
    );
    
    const allSuccessful = emailResult.success && calendarResult.success && contactResult.success;
    
    if (allSuccessful) {
      return {
        success: true,
        taskId: task.id,
        count: totalCount,
      };
    } else {
      return {
        success: false,
        taskId: task.id,
        error: "Failed to complete data ingestion"
      };
    }
  } catch (error) {
    console.error("Error during data ingestion:", error);
    return {
      success: false,
      error: "Failed to complete data ingestion",
    };
  }
}

// Ingest emails for a user
export async function ingestEmails(userId: string): Promise<TaskResult> {
  try {
    console.log(`Starting email ingestion for user ${userId}`);
    
    // Create a task to track ingestion progress using the utility function
    const task = await createTask({
      userId,
      title: "Email Ingestion",
      description: "Importing emails for RAG",
      type: "GENERAL",
      status: "IN_PROGRESS",
      metadata: {
        progress: 0,
        total: 1,
        errors: [],
        warnings: [],
        stats: {
          totalEmails: 0,
          processedEmails: 0,
          failedEmails: 0,
          skippedEmails: 0
        },
        // Store steps information in metadata since there's no steps relation
        steps: [
          {
            stepNumber: 1,
            title: "Email Import",
            description: "Importing emails for RAG",
            status: "PENDING"
          }
        ]
      }
    });

    // Since steps are now stored in metadata, we need to update the task directly
    // to mark the first step as IN_PROGRESS
    // Define a type for task metadata
    interface TaskMetadata {
      currentStep?: number;
      totalSteps?: number;
      progress?: number;
      total?: number;
      errors?: unknown[];
      warnings?: unknown[];
      stats?: Record<string, unknown>;
      steps?: Array<{
        stepNumber: number;
        title: string;
        description?: string;
        status?: string;
        metadata?: Record<string, unknown>;
      }>;
      [key: string]: unknown;
    }
    
    const taskMetadata = task.metadata as TaskMetadata;
    const steps = taskMetadata.steps || [];
    
    if (steps.length > 0) {
      steps[0].status = "IN_PROGRESS";
      
      await prisma.task.update({
        where: { id: task.id },
        data: {
          metadata: serializeMetadata({
            ...taskMetadata,
            steps,
            stats: {
              totalEmails: 0,
              processedEmails: 0,
              failedEmails: 0,
              skippedEmails: 0
            }
          })
        }
      });
    }
    
    try {
      // Import emails with progress tracking
      const result = await importEmails(userId, {
        onProgress: async (progress) => {
          // Get current metadata
          const currentTask = await prisma.task.findUnique({
            where: { id: task.id }
          });
          
          if (!currentTask || !currentTask.metadata) return;
          
          // Parse metadata
          const metadata = currentTask.metadata as TaskMetadata;
          const steps = metadata.steps || [];
          
          if (steps.length === 0) return;
          
          // Update the first step's metadata
          steps[0].status = "IN_PROGRESS";
          steps[0].metadata = {
            ...steps[0].metadata,
            progress: progress.percentage,
            stats: {
              totalEmails: progress.total,
              processedEmails: progress.processed,
              failedEmails: progress.failed,
              skippedEmails: progress.skipped
            },
            errors: progress.errors || [],
            warnings: progress.warnings || [],
            lastUpdate: new Date().toISOString()
          };
          
          // Update the task with the modified metadata
          await prisma.task.update({
            where: { id: task.id },
            data: {
              metadata: JSON.parse(JSON.stringify({
                ...metadata,
                steps,
                progress: progress.percentage,
                stats: {
                  totalEmails: progress.total,
                  processedEmails: progress.processed,
                  failedEmails: progress.failed,
                  skippedEmails: progress.skipped
                },
                errors: progress.errors || [],
                warnings: progress.warnings || [],
                lastUpdate: new Date().toISOString()
              }))
            }
          });
        }
      });

      // Update step status based on result
      // Get current task with metadata
      const currentTask = await prisma.task.findUnique({
        where: { id: task.id }
      });
      
      if (currentTask && currentTask.metadata) {
        // Parse metadata
        const metadata = currentTask.metadata as TaskMetadata;
        const steps = metadata.steps || [];
        
        if (steps.length > 0) {
          // Update the first step's status and metadata
          steps[0].status = result.success ? "COMPLETED" : "FAILED";
          steps[0].metadata = {
            ...steps[0].metadata,
            stats: result.stats,
            errors: result.errors || [],
            warnings: result.warnings || []
          };
          
          // Update the task with the modified metadata
          await prisma.task.update({
            where: { id: task.id },
            data: {
              metadata: serializeMetadata({
                ...metadata,
                steps
              })
            }
          });
        }
      }

      // Update task status based on result
      await prisma.task.update({
        where: { id: task.id },
        data: {
          status: result.success ? "COMPLETED" : "FAILED",
          metadata: {
            progress: result.success ? 100 : 0,
            stats: result.stats,
            errors: result.errors || [],
            warnings: result.warnings || []
          }
        }
      });

      if (result.success) {
        return {
          success: true,
          taskId: task.id,
          count: result.count || 0,
          stats: result.stats,
          errors: result.errors,
          warnings: result.warnings
        };
      } else {
        return {
          success: false,
          taskId: task.id,
          error: result.error || "Unknown error",
          stats: result.stats,
          errors: result.errors,
          warnings: result.warnings
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to import emails";
      
      // Since steps are stored in metadata, we need to update the task directly
      const taskMetadata = task.metadata as TaskMetadata || {};
      const steps = taskMetadata.steps || [];
      
      // Create updated metadata with error information
      const updatedMetadata: Record<string, unknown> = {
        ...taskMetadata,
        progress: 0,
        errors: [errorMessage],
        warnings: [],
        stats: {
          totalEmails: 0,
          processedEmails: 0,
          failedEmails: 0,
          skippedEmails: 0
        }
      };
      
      // If there are steps in the metadata, update the first step's status
      if (steps.length > 0) {
        steps[0] = {
          ...steps[0],
          status: "FAILED",
          metadata: {
            ...(steps[0].metadata || {}),
            completedAt: new Date().toISOString(),
            errors: [errorMessage]
          }
        };
        
        updatedMetadata.steps = steps;
      }
      
      // Update the task with the updated metadata
      await prisma.task.update({
        where: { id: task.id },
        data: {
          status: "FAILED",
          metadata: serializeMetadata(updatedMetadata)
        }
      });

      return {
        success: false,
        taskId: task.id,
        error: errorMessage,
        stats: {
          totalEmails: 0,
          processedEmails: 0,
          failedEmails: 0,
          skippedEmails: 0
        },
        errors: [errorMessage],
        warnings: []
      };
    }
  } catch (error) {
    console.error("Error creating email ingestion task:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create email ingestion task",
      stats: {
        totalEmails: 0,
        processedEmails: 0,
        failedEmails: 0,
        skippedEmails: 0
      },
      errors: [],
      warnings: []
    };
  }
}

// Ingest calendar events for a user
export async function ingestCalendarEvents(userId: string): Promise<TaskResult> {
  try {
    console.log(`Starting calendar event ingestion for user ${userId}`);
    
    // Create a task to track ingestion progress using the utility function
    const task = await createTask({
      userId,
      title: "Calendar Ingestion",
      description: "Importing calendar events for RAG",
      type: "CALENDAR",
      status: "IN_PROGRESS",
      metadata: {
        progress: 0,
        total: 1,
        errors: [],
        // Store steps information in metadata since there's no steps relation
        steps: [
          {
            stepNumber: 1,
            title: "Calendar Import",
            description: "Importing calendar events for RAG",
            status: "PENDING"
          }
        ]
      }
    });
    
    // Since steps are now stored in metadata, we need to update the task directly
    // to mark the first step as IN_PROGRESS
    const taskMetadata = task.metadata as TaskMetadata;
    const steps = taskMetadata.steps || [];
    
    if (steps.length > 0) {
      steps[0].status = "IN_PROGRESS";
      
      await prisma.task.update({
        where: { id: task.id },
        data: {
          metadata: {
            ...taskMetadata,
            steps
          }
        }
      });
    }
    
    // Import calendar events
    const result = await importCalendarEvents(userId);
    
    // Update task with results including steps
    const updatedMetadata = {
      ...taskMetadata,
      progress: result.success ? 100 : 0,
      total: 100,
      errors: !result.success && result.error ? [result.error] : [],
    };
    
    // Update step status
    if (steps.length > 0) {
      steps[0].status = result.success ? "COMPLETED" : "FAILED";
      updatedMetadata.steps = steps;
    }
    
    await prisma.task.update({
      where: { id: task.id },
      data: {
        status: result.success ? "COMPLETED" : "FAILED",
        metadata: updatedMetadata,
      },
    });
    
    // Handle result based on success property
    if (isSuccessResult(result)) {
      return {
        success: true,
        taskId: task.id,
        count: result.count
      };
    } else {
      return {
        success: false,
        taskId: task.id,
        error: result.error || "Unknown error"
      };
    }
  } catch (error) {
    console.error("Error during calendar event ingestion:", error);
    // Return a consistent error structure
    return {
      success: false,
      error: "Failed to complete calendar event ingestion",
    };
  }
}

// Ingest HubSpot contacts for a user
export async function ingestHubspotContacts(userId: string): Promise<TaskResult> {
  try {
    console.log(`Starting HubSpot contact ingestion for user ${userId}`);
    
    // Create a task to track ingestion progress using the utility function
    const task = await createTask({
      userId,
      title: "HubSpot Contact Ingestion",
      description: "Importing HubSpot contacts for RAG",
      type: "HUBSPOT",
      status: "IN_PROGRESS",
      metadata: {
        progress: 0,
        total: 1,
        errors: [],
        // Store steps information in metadata since there's no steps relation
        steps: [
          {
            stepNumber: 1,
            title: "Contact Import",
            description: "Importing HubSpot contacts for RAG",
            status: "PENDING"
          }
        ]
      }
    });
    
    // Since steps are now stored in metadata, we need to update the task directly
    // to mark the first step as IN_PROGRESS
    const taskMetadata = task.metadata as TaskMetadata;
    const steps = taskMetadata.steps || [];
    
    if (steps.length > 0) {
      steps[0].status = "IN_PROGRESS";
      
      await prisma.task.update({
        where: { id: task.id },
        data: {
          metadata: {
            ...taskMetadata,
            steps
          }
        }
      });
    }
    
    // Import HubSpot contacts
    const result = await importHubspotContacts(userId);
    
    // Update task with results including steps
    const updatedMetadata = {
      ...taskMetadata,
      progress: result.success ? 100 : 0,
      total: 100,
      errors: !result.success && result.error ? [result.error] : [],
    };
    
    // Update step status
    if (steps.length > 0) {
      steps[0].status = result.success ? "COMPLETED" : "FAILED";
      updatedMetadata.steps = steps;
    }
    
    await prisma.task.update({
      where: { id: task.id },
      data: {
        status: result.success ? "COMPLETED" : "FAILED",
        metadata: updatedMetadata,
      },
    });
    
    // Return properly typed result
    if (isSuccessResult(result)) {
      return {
        success: true,
        taskId: task.id,
        count: result.count
      };
    } else {
      return {
        success: false,
        taskId: task.id,
        error: result.error || "Unknown error"
      };
    }
  } catch (error) {
    console.error("Error during HubSpot contact ingestion:", error);
    // Return a consistent error structure
    return {
      success: false,
      error: "Failed to complete HubSpot contact ingestion",
    };
  }
}
