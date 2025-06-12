import { importEmails } from "@/lib/api/gmail";
import { importCalendarEvents } from "@/lib/api/calendar";
import { importHubspotContacts } from "@/lib/api/hubspot";
import { prisma } from "@/lib/db/prisma";

// Define interface for import results
interface ImportResult {
  success: boolean;
  count?: number;
  error?: string;
}

// Define interface for task results
interface TaskSuccessResult {
  success: true;
  taskId: string;
  count: number;
}

interface TaskErrorResult {
  success: false;
  taskId?: string; // Optional because task might not be created in case of early errors
  error: string;
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
    
    // Create a task to track ingestion progress
    const task = await prisma.task.create({
      data: {
        userId,
        title: "Data Ingestion",
        description: "Importing emails, calendar events, and contacts for RAG",
        type: "GENERAL",
        status: "IN_PROGRESS",
        metadata: {
          currentStep: 1,
          totalSteps: 3, // Three steps: emails, calendar, contacts
          emailsImported: 0,
          calendarEventsImported: 0,
          contactsImported: 0
        }
      },
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
          emailsImported: isSuccessResult(emailResult) ? emailResult.count : 0,
          calendarEventsImported: isSuccessResult(calendarResult) ? calendarResult.count : 0,
          contactsImported: isSuccessResult(contactResult) ? contactResult.count : 0,
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
    
    // Create a task to track ingestion progress
    const task = await prisma.task.create({
      data: {
        userId,
        title: "Email Ingestion",
        description: "Importing emails for RAG",
        type: "EMAIL",
        status: "IN_PROGRESS",
        metadata: {
          currentStep: 1,
          totalSteps: 1,
          emailsImported: 0
        }
      },
    });
    
    // Import emails
    const result = await importEmails(userId);
    
    // Update task with results
    await prisma.task.update({
      where: { id: task.id },
      data: {
        status: result.success ? "COMPLETED" : "FAILED",
        metadata: {
          emailsImported: isSuccessResult(result) ? result.count : 0,
          error: !result.success && result.error ? result.error : null,
        },
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
    console.error("Error during email ingestion:", error);
    // Return a consistent error structure
    return {
      success: false,
      error: "Failed to complete email ingestion",
    };
  }
}

// Ingest calendar events for a user
export async function ingestCalendarEvents(userId: string): Promise<TaskResult> {
  try {
    console.log(`Starting calendar event ingestion for user ${userId}`);
    
    // Create a task to track ingestion progress
    const task = await prisma.task.create({
      data: {
        userId,
        title: "Calendar Ingestion",
        description: "Importing calendar events for RAG",
        type: "CALENDAR",
        status: "IN_PROGRESS",
        metadata: {
          currentStep: 1,
          totalSteps: 1,
          eventsImported: 0
        }
      },
    });
    
    // Import calendar events
    const result = await importCalendarEvents(userId);
    
    // Update task with results
    await prisma.task.update({
      where: { id: task.id },
      data: {
        status: result.success ? "COMPLETED" : "FAILED",
        metadata: {
          eventsImported: isSuccessResult(result) ? result.count : 0,
          error: !result.success && result.error ? result.error : null,
        },
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
    
    // Create a task to track ingestion progress
    const task = await prisma.task.create({
      data: {
        userId,
        title: "HubSpot Contact Ingestion",
        description: "Importing HubSpot contacts for RAG",
        type: "HUBSPOT",
        status: "IN_PROGRESS",
        metadata: {
          currentStep: 1,
          totalSteps: 1,
          contactsImported: 0
        }
      },
    });
    
    // Import HubSpot contacts
    const result = await importHubspotContacts(userId);
    
    // Update task with results
    await prisma.task.update({
      where: { id: task.id },
      data: {
        status: result.success ? "COMPLETED" : "FAILED",
        metadata: {
          contactsImported: isSuccessResult(result) ? result.count : 0,
          error: !result.success && result.error ? result.error : null,
        },
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
