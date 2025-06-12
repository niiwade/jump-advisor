import React, { useState, useEffect, useCallback } from 'react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { 
  Clock, 
  Loader2, 
  PlayCircle,
  RefreshCw,
  Search
} from "lucide-react";
import { getWaitingTasks, resumeTask, formatWaitingDuration } from '@/lib/client/task-utils';
import { formatDistanceToNow } from 'date-fns';

// Type definitions
interface TaskStep {
  id: string;
  stepNumber: number;
  title: string;
  status: string;
  waitingFor?: string;
  waitingSince?: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  type: string;
  currentStep: number;
  totalSteps: number;
  steps?: TaskStep[];
  waitingFor?: string;
  waitingSince?: string;
  resumeAfter?: string;
  createdAt: string;
  updatedAt: string;
}

interface WaitingTasksPanelProps {
  onTaskSelected?: (taskId: string) => void;
  onTaskUpdated?: (task: Task) => void;
}

interface WaitingTasksResponse {
  tasks: Task[];
}

export function WaitingTasksPanel({ onTaskSelected, onTaskUpdated }: WaitingTasksPanelProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [resumingTaskId, setResumingTaskId] = useState<string | null>(null);
  
  // Fetch waiting tasks
  const fetchWaitingTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const includeExpired = activeTab === 'expired';
      const waitingFor = activeTab !== 'all' && activeTab !== 'expired' ? activeTab : undefined;
      
      const response = await getWaitingTasks({
        waitingFor,
        includeSteps: true,
        includeExpired
      }) as WaitingTasksResponse;
      
      setTasks(response.tasks || []);
    } catch (error) {
      console.error('Error fetching waiting tasks:', error);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);
  
  // Initial fetch
  useEffect(() => {
    fetchWaitingTasks();
  }, [fetchWaitingTasks]);
  
  // Handle resuming a task
  const handleResumeTask = async (taskId: string) => {
    setResumingTaskId(taskId);
    try {
      const result = await resumeTask(taskId) as { task: Task };
      
      // Remove the task from the list
      setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId));
      
      if (onTaskUpdated) {
        onTaskUpdated(result.task);
      }
    } catch (error) {
      console.error('Error resuming task:', error);
    } finally {
      setResumingTaskId(null);
    }
  };
  
  // Filter tasks by search query
  const filteredTasks = tasks.filter(task => 
    task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (task.waitingFor && task.waitingFor.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  
  // Group tasks by what they're waiting for
  const waitingForGroups = tasks.reduce<Record<string, Task[]>>((acc, task) => {
    const waitingFor = task.waitingFor || 'unknown';
    if (!acc[waitingFor]) {
      acc[waitingFor] = [];
    }
    acc[waitingFor].push(task);
    return acc;
  }, {});
  
  // Count expired tasks
  const expiredTasksCount = tasks.filter(task => 
    task.resumeAfter && new Date(task.resumeAfter) < new Date()
  ).length;
  
  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Waiting Tasks</CardTitle>
            <CardDescription>Tasks that are waiting for responses or actions</CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => fetchWaitingTasks()}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
        
        {/* Search and filter */}
        <div className="flex gap-2 mt-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="all">
              All ({tasks.length})
            </TabsTrigger>
            {expiredTasksCount > 0 && (
              <TabsTrigger value="expired">
                Expired ({expiredTasksCount})
              </TabsTrigger>
            )}
            {Object.keys(waitingForGroups).map(group => (
              <TabsTrigger key={group} value={group}>
                {group} ({waitingForGroups[group].length})
              </TabsTrigger>
            ))}
          </TabsList>
          
          <TabsContent value={activeTab}>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-[250px]" />
                      <Skeleton className="h-4 w-[200px]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Clock className="mx-auto h-12 w-12 opacity-20 mb-2" />
                <p>No waiting tasks found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTasks.map((task) => (
                  <div 
                    key={task.id} 
                    className="border rounded-lg p-3 hover:bg-gray-50 transition-colors"
                    onClick={() => onTaskSelected && onTaskSelected(task.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium">{task.title}</h3>
                        <p className="text-sm text-gray-500">
                          Waiting for: {task.waitingFor}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-amber-600 bg-amber-50">
                            <Clock className="w-3 h-3 mr-1" />
                            {task.waitingSince ? formatWaitingDuration(task.waitingSince) : 'Waiting'}
                          </Badge>
                          {task.resumeAfter && (
                            <Badge variant="outline" className="text-blue-600 bg-blue-50">
                              Auto-resume {formatDistanceToNow(new Date(task.resumeAfter), { addSuffix: true })}
                            </Badge>
                          )}
                          {task.currentStep && task.totalSteps && (
                            <Badge variant="outline">
                              Step {task.currentStep} of {task.totalSteps}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          handleResumeTask(task.id);
                        }}
                        disabled={resumingTaskId === task.id}
                      >
                        {resumingTaskId === task.id ? (
                          <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Resuming</>
                        ) : (
                          <><PlayCircle className="w-4 h-4 mr-1" /> Resume</>
                        )}
                      </Button>
                    </div>
                    
                    {/* Current step info if available */}
                    {task.steps && task.steps.length > 0 && (
                      <div className="mt-2 pt-2 border-t text-sm">
                        <p className="text-gray-600">
                          Current step: {task.steps.find(s => s.stepNumber === task.currentStep)?.title}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
