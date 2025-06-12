import { NextResponse } from 'next/server';
import { initializeServer } from '@/lib/server-init';

// Initialize the server on first request to this endpoint
initializeServer();

/**
 * GET handler for the agent status endpoint
 */
export async function GET() {
  return NextResponse.json({ 
    status: 'active',
    message: 'Proactive agent is running',
    timestamp: new Date().toISOString()
  });
}
