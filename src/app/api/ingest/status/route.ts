import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";

// GET all ingestion statuses for the current user
export async function GET() {
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
    
    // Get all ingestion statuses for the user
    const statuses = await prisma.ingestionStatus.findMany({
      where: {
        userId,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });
    
    return NextResponse.json({ statuses });
  } catch (error) {
    console.error("Error fetching ingestion statuses:", error);
    return NextResponse.json(
      { error: "Failed to fetch ingestion statuses" },
      { status: 500 }
    );
  }
}

// POST a new ingestion status or update an existing one
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
    const { id, type, status, progress, total } = await req.json();
    
    // Validate input
    if (!type || !status) {
      return NextResponse.json(
        { error: "Type and status are required" },
        { status: 400 }
      );
    }
    
    // If ID is provided, update existing status
    if (id) {
      const existingStatus = await prisma.ingestionStatus.findUnique({
        where: { id },
      });
      
      // Check if status exists and belongs to user
      if (!existingStatus) {
        return NextResponse.json(
          { error: "Ingestion status not found" },
          { status: 404 }
        );
      }
      
      if (existingStatus.userId !== userId) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 403 }
        );
      }
      
      // Update status
      const updatedStatus = await prisma.ingestionStatus.update({
        where: { id },
        data: {
          status,
          progress: progress || existingStatus.progress,
          total: total || existingStatus.total,
        },
      });
      
      return NextResponse.json(updatedStatus);
    } 
    
    // Create new status
    const newStatus = await prisma.ingestionStatus.create({
      data: {
        userId,
        type,
        status,
        progress: progress || 0,
        total: total || 0,
      },
    });
    
    return NextResponse.json(newStatus, { status: 201 });
  } catch (error) {
    console.error("Error updating ingestion status:", error);
    return NextResponse.json(
      { error: "Failed to update ingestion status" },
      { status: 500 }
    );
  }
}
