import React, { useState } from 'react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Button, 
  Badge, 
  Progress, 
  Accordion, 
  AccordionItem, 
  AccordionTrigger, 
  AccordionContent 
} from "@/components/ui";
import { TaskStatus } from "@prisma/client";
import { 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  ChevronRight, 
  Loader2, 
  PauseCircle,
  PlayCircle,
  XCircle
} from "lucide-react";
import { formatDistanceToNow } from 'date-fns';
import { 
  advanceTaskStep, 
  completeTask, 
  resumeTask, 
  setTaskWaiting, 
  calculateTaskProgress, 
  getCurrentStep,
  formatWaitingDuration
} from '@/lib/client/task-utils';

// Type definitions
interface TaskStep {
  id: string;
  stepNumber: number;
  title: string;
  description?: string;
  status: string;
  waitingFor?: string;
  waitingSince?: string;
  resumeAfter?: string;
  completedAt?: string;
  metadata?: any;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  type: string;
  currentStep: number;
  totalSteps: number;
  steps?: TaskStep[];
  waitingFor?: string;
  waitingSince?: string;
  resumeAfter?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: any;
}

interface MultiStepTaskProps {
  task: Task;
  onTaskUpdated?: (updatedTask: Task) => void;
  onTaskCompleted?: (task: Task) => void;
}

// Status badge component
const StatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case TaskStatus.COMPLETED:
      return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Completed</Badge>;
    case TaskStatus.IN_PROGRESS:
      return <Badge className="bg-blue-500"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> In Progress</Badge>;
    case TaskStatus.WAITING_FOR_RESPONSE:
      return <Badge className="bg-amber-500"><Clock className="w-3 h-3 mr-1" /> Waiting</Badge>;
    case TaskStatus.FAILED:
      return <Badge className="bg-red-500"><AlertCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
    default:
      return <Badge className="bg-gray-500"><PauseCircle className="w-3 h-3 mr-1" /> Pending</Badge>;
  }
};

export function MultiStepTask({ task, onTaskUpdated, onTaskCompleted }: MultiStepTaskProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [responseInput, setResponseInput] = useState<string>('');
  const [waitingInput, setWaitingInput] = useState<string>('');
  const [waitingDuration, setWaitingDuration] = useState<number>(60); // Default 60 minutes
  
  const progress = calculateTaskProgress(task);
  const currentStep = getCurrentStep(task);
  const isTaskCompleted = task.status === TaskStatus.COMPLETED;
  const isTaskWaiting = task.status === TaskStatus.WAITING_FOR_RESPONSE;
  
  // Handle advancing to the next step
  const handleAdvanceStep = async () => {
    if (!currentStep) return;
    
    setIsLoading('advancing');
    try {
      const result = await advanceTaskStep(task.id, currentStep.id);
      if (onTaskUpdated) {
        onTaskUpdated(result.task);
      }
    } catch (error) {
      console.error('Error advancing step:', error);
    } finally {
      setIsLoading(null);
    }
  };
  
  // Handle completing the entire task
  const handleCompleteTask = async () => {
    setIsLoading('completing');
    try {
      const result = await completeTask(task.id);
      if (onTaskCompleted) {
        onTaskCompleted(result.task);
      } else if (onTaskUpdated) {
        onTaskUpdated(result.task);
      }
    } catch (error) {
      console.error('Error completing task:', error);
    } finally {
      setIsLoading(null);
    }
  };
  
  // Handle setting a task to waiting state
  const handleSetWaiting = async () => {
    if (!waitingInput) return;
    
    setIsLoading('waiting');
    try {
      const result = await setTaskWaiting(
        task.id, 
        waitingInput, 
        waitingDuration,
        currentStep?.id
      );
      
      if (onTaskUpdated) {
        onTaskUpdated(result.task);
      }
      
      // Clear inputs
      setWaitingInput('');
    } catch (error) {
      console.error('Error setting task to waiting:', error);
    } finally {
      setIsLoading(null);
    }
  };
  
  // Handle resuming a task from waiting state
  const handleResumeTask = async () => {
    setIsLoading('resuming');
    try {
      const result = await resumeTask(
        task.id, 
        responseInput || undefined,
        currentStep?.id
      );
      
      if (onTaskUpdated) {
        onTaskUpdated(result.task);
      }
      
      // Clear inputs
      setResponseInput('');
    } catch (error) {
      console.error('Error resuming task:', error);
    } finally {
      setIsLoading(null);
    }
  };
  
  // Format the waiting time
  const formattedWaitingTime = task.waitingSince 
    ? formatWaitingDuration(task.waitingSince)
    : null;
  
  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>{task.title}</CardTitle>
            <CardDescription>{task.description}</CardDescription>
          </div>
          <StatusBadge status={task.status} />
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Progress indicator */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">
              Progress: Step {task.currentStep} of {task.totalSteps}
            </span>
            <span className="text-sm font-medium">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
        
        {/* Waiting state info */}
        {isTaskWaiting && (
          <div className="bg-amber-50 p-3 rounded-md mb-4 border border-amber-200">
            <h4 className="font-medium flex items-center text-amber-800">
              <Clock className="w-4 h-4 mr-1" /> 
              Waiting for: {task.waitingFor}
            </h4>
            {formattedWaitingTime && (
              <p className="text-sm text-amber-700 mt-1">
                Waiting for {formattedWaitingTime}
              </p>
            )}
            {task.resumeAfter && (
              <p className="text-sm text-amber-700 mt-1">
                Will auto-resume at {new Date(task.resumeAfter).toLocaleString()}
              </p>
            )}
            
            {/* Response input for waiting tasks */}
            <div className="mt-3">
              <textarea
                className="w-full p-2 border rounded-md text-sm"
                placeholder="Enter response..."
                value={responseInput}
                onChange={(e) => setResponseInput(e.target.value)}
                rows={2}
              />
              <Button 
                onClick={handleResumeTask}
                disabled={isLoading === 'resuming'}
                className="mt-2 bg-amber-600 hover:bg-amber-700"
                size="sm"
              >
                {isLoading === 'resuming' ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Resuming</>
                ) : (
                  <><PlayCircle className="w-4 h-4 mr-1" /> Resume Task</>
                )}
              </Button>
            </div>
          </div>
        )}
        
        {/* Task steps */}
        {task.steps && task.steps.length > 0 && (
          <Accordion type="single" collapsible className="w-full">
            {task.steps.sort((a, b) => a.stepNumber - b.stepNumber).map((step) => (
              <AccordionItem key={step.id} value={step.id}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="flex items-center">
                      {step.status === TaskStatus.COMPLETED ? (
                        <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                      ) : step.status === TaskStatus.WAITING_FOR_RESPONSE ? (
                        <Clock className="w-4 h-4 mr-2 text-amber-500" />
                      ) : step.status === TaskStatus.FAILED ? (
                        <XCircle className="w-4 h-4 mr-2 text-red-500" />
                      ) : step.stepNumber === task.currentStep ? (
                        <Loader2 className="w-4 h-4 mr-2 text-blue-500" />
                      ) : (
                        <div className="w-4 h-4 mr-2 rounded-full border-2 border-gray-300" />
                      )}
                      <span className={`${step.stepNumber === task.currentStep ? 'font-medium' : ''}`}>
                        {step.stepNumber}. {step.title}
                      </span>
                    </div>
                    <StatusBadge status={step.status} />
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {step.description && <p className="mb-3 text-gray-600">{step.description}</p>}
                  
                  {/* Step waiting info */}
                  {step.status === TaskStatus.WAITING_FOR_RESPONSE && (
                    <div className="bg-amber-50 p-2 rounded-md mb-3 border border-amber-200">
                      <p className="text-sm text-amber-700">
                        Waiting for: {step.waitingFor}
                        {step.waitingSince && ` (${formatWaitingDuration(step.waitingSince)})`}
                      </p>
                    </div>
                  )}
                  
                  {/* Step metadata display */}
                  {step.metadata && Object.keys(step.metadata).length > 0 && (
                    <div className="bg-gray-50 p-2 rounded-md mb-3 border border-gray-200">
                      <p className="text-xs font-medium text-gray-500 mb-1">Additional Information</p>
                      <pre className="text-xs overflow-auto max-h-32 p-1">
                        {JSON.stringify(step.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                  
                  {/* Step timestamps */}
                  <div className="text-xs text-gray-500 mt-2">
                    {step.completedAt && (
                      <p>Completed {formatDistanceToNow(new Date(step.completedAt), { addSuffix: true })}</p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
        
        {/* Set to waiting form (only show when task is in progress) */}
        {task.status === TaskStatus.IN_PROGRESS && (
          <div className="mt-4 border-t pt-4">
            <h4 className="font-medium mb-2">Set Task to Waiting State</h4>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                className="p-2 border rounded-md"
                placeholder="What are you waiting for?"
                value={waitingInput}
                onChange={(e) => setWaitingInput(e.target.value)}
              />
              <div className="flex gap-2 items-center">
                <label className="text-sm">Auto-resume after:</label>
                <input
                  type="number"
                  className="p-2 border rounded-md w-20"
                  value={waitingDuration}
                  onChange={(e) => setWaitingDuration(parseInt(e.target.value) || 0)}
                  min="0"
                />
                <span className="text-sm">minutes (0 = never)</span>
              </div>
              <Button 
                onClick={handleSetWaiting}
                disabled={!waitingInput || isLoading === 'waiting'}
                className="bg-amber-500 hover:bg-amber-600"
                size="sm"
              >
                {isLoading === 'waiting' ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Setting to Waiting</>
                ) : (
                  <><Clock className="w-4 h-4 mr-1" /> Set to Waiting</>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      
      <CardFooter className="flex justify-between border-t pt-4">
        {/* Task action buttons */}
        <div className="flex gap-2">
          {task.status !== TaskStatus.COMPLETED && (
            <Button
              onClick={handleCompleteTask}
              disabled={isLoading === 'completing'}
              className="bg-green-600 hover:bg-green-700"
            >
              {isLoading === 'completing' ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Completing</>
              ) : (
                <><CheckCircle className="w-4 h-4 mr-1" /> Complete Task</>
              )}
            </Button>
          )}
          
          {currentStep && task.currentStep < task.totalSteps && task.status !== TaskStatus.COMPLETED && (
            <Button
              onClick={handleAdvanceStep}
              disabled={isLoading === 'advancing' || currentStep.status !== TaskStatus.COMPLETED}
              variant="outline"
            >
              {isLoading === 'advancing' ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Advancing</>
              ) : (
                <><ChevronRight className="w-4 h-4 mr-1" /> Next Step</>
              )}
            </Button>
          )}
        </div>
        
        {/* Created/updated timestamps */}
        <div className="text-xs text-gray-500">
          <p>Created {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}</p>
          <p>Updated {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}</p>
        </div>
      </CardFooter>
    </Card>
  );
}
