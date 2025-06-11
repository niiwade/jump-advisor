import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";

// POST to update multiple tasks at once
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
    const { taskIds, status, metadata }: { 
      taskIds: string[]; 
      status?: string; 
      metadata?: Record<string, unknown>; 
    } = await req.json();
    
    // Validate input
    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { error: "Task IDs array is required" },
        { status: 400 }
      );
    }
    
    // Check if all tasks belong to the user
    const tasks = await prisma.task.findMany({
      where: {
        id: { in: taskIds },
      },
    });
    
    const unauthorizedTasks = tasks.filter((task: { userId: string }) => task.userId !== userId);
    if (unauthorizedTasks.length > 0) {
      return NextResponse.json(
        { error: "Unauthorized to update one or more tasks" },
        { status: 403 }
      );
    }
    
    // Update all tasks
    const updateData: {
      status?: string;
      metadata?: Record<string, unknown>;
      completedAt?: Date;
    } = {};
    if (status) updateData.status = status;
    if (metadata) updateData.metadata = metadata;
    
    // If marking as completed, set completedAt
    if (status === "COMPLETED") {
      updateData.completedAt = new Date();
    }
    
    const updatedTasks = await Promise.all(
      taskIds.map(async (taskId: string) => {
        return prisma.task.update({
          where: { id: taskId },
          data: updateData,
        });
      })
    );
    
    return NextResponse.json({ 
      message: `${updatedTasks.length} tasks updated successfully`,
      tasks: updatedTasks 
    });
  } catch (error) {
    console.error("Error updating tasks in bulk:", error);
    return NextResponse.json(
      { error: "Failed to update tasks" },
      { status: 500 }
    );
  }
}

// GET tasks by status or type
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
    const status: string | null = url.searchParams.get("status");
    const type: string | null = url.searchParams.get("type");
    const limit: number = parseInt(url.searchParams.get("limit") || "10");
    
    // Build where clause
    const where: { 
      userId: string;
      status?: string;
      type?: string;
    } = { userId };
    if (status) where.status = status;
    if (type) where.type = type;
    
    // Get filtered tasks
    const tasks = await prisma.task.findMany({
      where,
      orderBy: {
        updatedAt: "desc",
      },
      take: limit,
    });
    
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("Error fetching filtered tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}
