import { startProactiveAgent } from './proactive-agent';

/**
 * Initialize all agent systems
 */
export function initializeAgents(): void {
  // Start the proactive agent to periodically check for new data
  startProactiveAgent();
  
  console.log('All agent systems initialized');
}
