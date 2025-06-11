import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";
import { TaskStatus, TaskType } from "@prisma/client";

// POST to mark a task as completed
export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    const userId = session.user.id as string;
    const { taskId, result } = await req.json();
    
    // Validate input
    if (!taskId) {
      return NextResponse.json(
        { error: "Task ID is required" },
        { status: 400 }
      );
    }
    
    // Check if task exists and belongs to user
    const existingTask = await prisma.task.findUnique({
      where: {
        id: taskId,
      },
    });
    
    if (!existingTask) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }
    
    if (existingTask.userId !== userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }
    
    // Update task to completed
    const completedTask = await prisma.task.update({
      where: {
        id: taskId,
      },
      data: {
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
        metadata: existingTask.metadata ? {
          ...(existingTask.metadata as Record<string, unknown>),
          result: result || "Task completed successfully",
        } : {
          result: result || "Task completed successfully",
        },
      },

    });
    
    return NextResponse.json({
      message: "Task marked as completed",
      task: completedTask
    });
  } catch (error) {
    console.error("Error completing task:", error);
    return NextResponse.json(
      { error: "Failed to complete task" },
      { status: 500 }
    );
  }
}

// GET all completed tasks for the current user
export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    const userId = session.user.id as string;
    
    // Get query parameters
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "10");
    const typeParam = url.searchParams.get("type");
    const type = typeParam ? typeParam as TaskType : undefined;
    
    // Build where clause
    const where: { 
      userId: string;
      status: TaskStatus;
      type?: TaskType;
    } = { 
      userId,
      status: TaskStatus.COMPLETED
    };
    
    if (type) where.type = type;
    
    // Get completed tasks
    const completedTasks = await prisma.task.findMany({
      where,
      orderBy: {
        completedAt: "desc",
      },
      take: limit,
    });
    
    return NextResponse.json({ tasks: completedTasks });
  } catch (error) {
    console.error("Error fetching completed tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch completed tasks" },
      { status: 500 }
    );
  }
}
