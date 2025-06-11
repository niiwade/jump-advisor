import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { ingestAllData, ingestEmails, ingestCalendarEvents, ingestHubspotContacts } from "@/lib/rag/ingestion";

// API route to trigger data ingestion
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
    const body = await req.json();
    const { type } = body;
    
    let result;
    
    // Determine which data to ingest
    switch (type) {
      case "all":
        result = await ingestAllData(userId);
        break;
      case "emails":
        result = await ingestEmails(userId);
        break;
      case "calendar":
        result = await ingestCalendarEvents(userId);
        break;
      case "contacts":
        result = await ingestHubspotContacts(userId);
        break;
      default:
        return NextResponse.json(
          { error: "Invalid ingestion type" },
          { status: 400 }
        );
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error during data ingestion:", error);
    return NextResponse.json(
      { error: "Failed to process ingestion request" },
      { status: 500 }
    );
  }
}
