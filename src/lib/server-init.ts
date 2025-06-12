import { initializeAgents } from './agent';
import { TaskManager } from "./agent/task-manager";

let initialized = false;

/**
 * Initialize server-side components that should only run once
 * This is designed to be called from API routes or server components
 */
export function initializeServer(): void {
  // Only initialize once
  if (initialized) {
    console.log("Server already initialized");
    return;
  }
  
  // Don't initialize in development mode when fast refresh is active
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_AGENT_INIT === 'true') {
    console.log('Skipping agent initialization in development mode');
    initialized = true;
    return;
  }

  console.log('Initializing server components...');
  
  try {
    // Initialize agents (proactive checking, etc.)
    initializeAgents();
    
    // Start the task manager service for handling multi-step tasks
    TaskManager.start();
    
    console.log('Server initialization complete');
  } catch (error) {
    console.error('Error during server initialization:', error);
  }
  
  initialized = true;
}

/**
 * Get the status of server services
 */
export function getServerStatus() {
  return {
    isInitialized: initialized,
    taskManagerStatus: TaskManager.getStatus(),
  };
}
