"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "../ui/use-toast";
import axios from "axios";

type IngestionStatus = {
  id: string;
  type: "EMAIL" | "CALENDAR" | "HUBSPOT" | "ALL";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  progress: number;
  total: number;
  createdAt: string;
  updatedAt: string;
};

export function IngestionStatus() {
  const [statuses, setStatuses] = useState<IngestionStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Define fetchStatuses with useCallback to avoid recreation on each render
  const fetchStatuses = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await axios.get("/api/ingest/status");
      setStatuses(response.data.statuses);
    } catch (error) {
      console.error("Error fetching ingestion statuses:", error);
      toast({
        title: "Error",
        description: "Failed to load ingestion statuses",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Fetch ingestion statuses on component mount and periodically
  useEffect(() => {
    fetchStatuses();
    
    // Poll for updates every 5 seconds if there are active ingestions
    const interval = setInterval(() => {
      const hasActiveIngestions = statuses.some(
        status => status.status === "PENDING" || status.status === "IN_PROGRESS"
      );
      
      if (hasActiveIngestions) {
        fetchStatuses();
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [statuses, fetchStatuses]);

  // Format date to readable string
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Get status badge
  const getStatusBadge = (status: IngestionStatus["status"]) => {
    switch (status) {
      case "PENDING":
        return <Badge variant="secondary">Pending</Badge>;
      case "IN_PROGRESS":
        return <Badge variant="default">In Progress</Badge>;
      case "COMPLETED":
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">Completed</Badge>;
      case "FAILED":
        return <Badge variant="destructive">Failed</Badge>;
    }
  };

  // Get type label
  const getTypeLabel = (type: IngestionStatus["type"]) => {
    switch (type) {
      case "EMAIL":
        return "Email Import";
      case "CALENDAR":
        return "Calendar Import";
      case "HUBSPOT":
        return "HubSpot Import";
      case "ALL":
        return "Full Data Import";
    }
  };

  // Calculate progress percentage
  const getProgressPercentage = (status: IngestionStatus) => {
    if (status.total === 0) return 0;
    return Math.round((status.progress / status.total) * 100);
  };

  // Only show the most recent 5 ingestion statuses
  const recentStatuses = statuses
    .sort((a: IngestionStatus, b: IngestionStatus) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Import Status</CardTitle>
        <CardDescription>
          View the status of your data imports
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && statuses.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            Loading import statuses...
          </div>
        ) : recentStatuses.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            No recent data imports
          </div>
        ) : (
          <div className="space-y-4">
            {recentStatuses.map((status) => (
              <div key={status.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{getTypeLabel(status.type)}</div>
                  {getStatusBadge(status.status)}
                </div>
                <Progress value={getProgressPercentage(status)} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {status.progress} of {status.total} items processed
                  </span>
                  <span>{formatDate(status.updatedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
