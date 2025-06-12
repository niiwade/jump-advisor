import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, CheckCircle } from 'lucide-react';

interface AgentStatusProps {
  userId: string;
}

export function AgentStatus({ userId }: AgentStatusProps) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle');
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch agent status on component mount
  useEffect(() => {
    checkAgentStatus();
  }, []);

  // Check agent status
  const checkAgentStatus = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/agent');
      const data = await response.json();
      
      if (data.status === 'active') {
        setStatus('idle');
        setLastChecked(data.timestamp);
      } else {
        setStatus('error');
      }
    } catch (error) {
      console.error('Error checking agent status:', error);
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  // Manually trigger data check
  const triggerDataCheck = async () => {
    try {
      setStatus('checking');
      
      // Call the API to trigger a manual check
      const response = await fetch('/api/agent/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setStatus('success');
        setLastChecked(new Date().toISOString());
        
        // Reset to idle after 3 seconds
        setTimeout(() => {
          setStatus('idle');
        }, 3000);
      } else {
        setStatus('error');
      }
    } catch (error) {
      console.error('Error triggering data check:', error);
      setStatus('error');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Proactive Agent
          {status === 'idle' && <Badge variant="outline">Active</Badge>}
          {status === 'checking' && <Badge variant="secondary">Checking</Badge>}
          {status === 'success' && <Badge variant="default">Updated</Badge>}
          {status === 'error' && <Badge variant="destructive">Error</Badge>}
        </CardTitle>
        <CardDescription>
          Automatically checks for new data from your connected services
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="text-sm">
            <span className="font-medium">Status:</span>{' '}
            {isLoading ? (
              <span className="flex items-center">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Checking...
              </span>
            ) : status === 'error' ? (
              'Error connecting to agent'
            ) : (
              'Running'
            )}
          </div>
          {lastChecked && (
            <div className="text-sm">
              <span className="font-medium">Last checked:</span>{' '}
              {new Date(lastChecked).toLocaleString()}
            </div>
          )}
          <div className="text-sm">
            <span className="font-medium">Check interval:</span> Every 15 minutes
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button
          onClick={triggerDataCheck}
          disabled={status === 'checking'}
          variant="outline"
          className="w-full"
        >
          {status === 'checking' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking...
            </>
          ) : status === 'success' ? (
            <>
              <CheckCircle className="mr-2 h-4 w-4" /> Updated
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" /> Check Now
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
