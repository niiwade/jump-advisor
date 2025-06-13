import { prisma } from '@/lib/db/prisma';
import { TaskMetadata, TaskStepMetadata, TaskWithSteps } from '../../types/task';

// Interval in milliseconds for checking waiting tasks (default: 1 minute)
const CHECK_INTERVAL = 60 * 1000;

export class TaskManager {
  static async startTaskResumptionScheduler() {
    const checkAndResumeTasks = async () => {
      try {
        const tasksToResume = await prisma.task.findMany({
          where: {
            status: 'WAITING_FOR_RESPONSE',
            metadata: {
              path: ['resumeAfter'],
              lte: new Date().toISOString()
            }
          },
          include: { steps: true }
        });

        const typedTasks = tasksToResume.map(task => {
          const metadata = task.metadata as TaskMetadata || {};
          return {
            ...task,
            currentStep: metadata.currentStep || 1,
            steps: task.steps.map((step, index) => ({
              ...step,
              stepNumber: index + 1,
              metadata: step.metadata as TaskStepMetadata || {}
            })),
            metadata
          } as TaskWithSteps;
        });

        await Promise.all(typedTasks.map(task => this.resumeTask(task)));
      } catch (error) {
        console.error('[TaskManager] Error in task resumption scheduler:', error);
      } finally {
        setTimeout(checkAndResumeTasks, CHECK_INTERVAL);
      }
    };

    checkAndResumeTasks();
  }

  static async resumeTask(task: TaskWithSteps) {
    const metadata = task.metadata || {};
    
    await prisma.task.update({
      where: { id: task.id },
      data: {
        status: 'IN_PROGRESS',
        metadata: {
          ...metadata,
          waitingFor: undefined,
          waitingSince: undefined,
          resumeAfter: undefined
        }
      }
    });

    if (task.steps?.length) {
      await Promise.all(
        task.steps
          .filter(step => step.status === 'WAITING_FOR_RESPONSE')
          .map(step => prisma.taskStep.update({
            where: { id: step.id },
            data: {
              status: 'IN_PROGRESS',
              metadata: {
                ...(step.metadata as TaskStepMetadata || {}),
                waitingFor: undefined,
                waitingSince: undefined
              }
            }
          }))
      );
    }
    
    return true;
  }

  static async manuallyResumeTask(taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { steps: true }
    });

    if (!task) throw new Error(`Task ${taskId} not found`);
    
    const metadata = task.metadata as TaskMetadata || {};
    if (!metadata.waitingFor || !metadata.waitingSince) {
      throw new Error(`Task ${taskId} is not in a waiting state`);
    }

    const typedTask = {
      ...task,
      currentStep: metadata.currentStep || 1,
      steps: task.steps.map((step, index) => ({
        ...step,
        stepNumber: index + 1,
        metadata: step.metadata as TaskStepMetadata || {}
      })),
      metadata
    } as TaskWithSteps;

    return this.resumeTask(typedTask);
  }

  static async getResumableTasks(): Promise<TaskWithSteps[]> {
    const tasks = await prisma.task.findMany({
      where: {
        status: 'WAITING_FOR_RESPONSE',
        metadata: {
          path: ['resumeAfter'],
          lte: new Date().toISOString()
        }
      },
      include: { steps: true }
    });

    return tasks.map(task => {
      const metadata = task.metadata as TaskMetadata || {};
      return {
        ...task,
        currentStep: metadata.currentStep || 1,
        steps: task.steps.map((step, index) => ({
          ...step,
          stepNumber: index + 1,
          metadata: step.metadata as TaskStepMetadata || {}
        })),
        metadata
      } as TaskWithSteps;
    });
  }

  static async resumeReadyTasks(): Promise<TaskWithSteps[]> {
    const tasks = await this.getResumableTasks();
    await Promise.all(tasks.map(task => this.resumeTask(task)));
    return tasks;
  }

  static async updateTaskMetadata(taskId: string, metadata: TaskMetadata) {
    return prisma.task.update({
      where: { id: taskId },
      data: { metadata }
    });
  }

  static async updateStepMetadata(stepId: string, metadata: TaskStepMetadata) {
    return prisma.taskStep.update({
      where: { id: stepId },
      data: { metadata }
    });
  }
}
