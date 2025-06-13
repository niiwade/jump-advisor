import type { JsonValue } from "@prisma/client/runtime/library";

export interface TaskMetadata {
  currentStep?: number;
  totalSteps?: number;
  parentTaskId?: string;
  waitingFor?: string;
  waitingSince?: string; // Store dates as ISO strings
  resumeAfter?: string; // Store dates as ISO strings
  [key: string]: JsonValue | undefined;
}

export type TaskWithMetadata = {
  id: string;
  title: string;
  description: string;
  status: string;
  metadata: TaskMetadata;
  steps?: Array<{
    stepNumber: number;
    title: string;
    description?: string;
    status: string;
    metadata: TaskMetadata;
  }>;
};
