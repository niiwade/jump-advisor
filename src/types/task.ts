import { Task, TaskStep } from '@prisma/client';
import { JsonValue } from '@prisma/client/runtime/library';

export interface TaskMetadata {
  currentStep?: number;
  waitingFor?: string;
  waitingSince?: string;
  resumeAfter?: string;
  [key: string]: JsonValue | undefined;
}

export interface TaskStepMetadata {
  waitingFor?: string;
  waitingSince?: string;
  [key: string]: JsonValue | undefined;
}

export interface TaskStepWithMetadata extends TaskStep {
  stepNumber: number;
  metadata: TaskStepMetadata;
}

export interface TaskWithSteps extends Task {
  steps: TaskStepWithMetadata[];
  currentStep: number;
  metadata: TaskMetadata;
}
