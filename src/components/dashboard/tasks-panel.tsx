"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, AlertCircle, RefreshCw, Trash2, CheckSquare } from "lucide-react";
import { useToast } from "../ui/use-toast";
import axios from "axios";

type Task = {
  id: string;
  title: string;
  description: string;
  type: "EMAIL" | "CALENDAR" | "HUBSPOT" | "GENERAL";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "WAITING_FOR_RESPONSE";
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
};

export function TasksPanel() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch all tasks for the user
  const fetchTasks = useCallback(async (filter?: string) => {
    try {
      setIsLoading(true);
      let url = "/api/tasks";
      
      // Apply filters if specified
      if (filter) {
        url = `/api/tasks/bulk?status=${filter}`;
        setActiveFilter(filter);
      } else {
        setActiveFilter(null);
      }
      
      const response = await axios.get(url);
      setTasks(response.data.tasks || response.data);
      // Clear any selected tasks when refreshing
      setSelectedTasks([]);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      toast({
        title: "Error",
        description: "Failed to load tasks",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Fetch tasks on component mount
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);
  
  // Mark a task as completed
  const completeTask = useCallback(async (taskId: string) => {
    try {
      setIsLoading(true);
      await axios.post("/api/tasks/complete", { taskId });
      toast({
        title: "Success",
        description: "Task marked as completed",
      });
      fetchTasks(activeFilter || undefined);
    } catch (error) {
      console.error("Error completing task:", error);
      toast({
        title: "Error",
        description: "Failed to complete task",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, fetchTasks, activeFilter]);
  
  // Delete a task
  const deleteTask = useCallback(async (taskId: string) => {
    try {
      setIsLoading(true);
      await axios.delete(`/api/tasks/${taskId}`);
      toast({
        title: "Success",
        description: "Task deleted successfully",
      });
      fetchTasks(activeFilter || undefined);
    } catch (error) {
      console.error("Error deleting task:", error);
      toast({
        title: "Error",
        description: "Failed to delete task",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, fetchTasks, activeFilter]);
  
  // Toggle task selection
  const toggleTaskSelection = useCallback((taskId: string) => {
    setSelectedTasks(prev => {
      if (prev.includes(taskId)) {
        return prev.filter(id => id !== taskId);
      } else {
        return [...prev, taskId];
      }
    });
  }, []);
  
  // Bulk complete selected tasks
  const bulkCompleteTasks = useCallback(async () => {
    if (selectedTasks.length === 0) return;
    
    try {
      setIsLoading(true);
      await axios.post("/api/tasks/bulk", { 
        taskIds: selectedTasks,
        status: "COMPLETED"
      });
      toast({
        title: "Success",
        description: `${selectedTasks.length} tasks marked as completed`,
      });
      fetchTasks(activeFilter || undefined);
    } catch (error) {
      console.error("Error completing tasks in bulk:", error);
      toast({
        title: "Error",
        description: "Failed to complete tasks",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedTasks, setIsLoading, toast, fetchTasks, activeFilter]);

  // Get status icon based on task status
  const getStatusIcon = useCallback((status: Task["status"]) => {
    switch (status) {
      case "COMPLETED":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "PENDING":
      case "IN_PROGRESS":
        return <Clock className="h-4 w-4 text-amber-500" />;
      case "FAILED":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "WAITING_FOR_RESPONSE":
        return <RefreshCw className="h-4 w-4 text-blue-500" />;
    }
  }, []);

  // Get badge color based on task type
  const getTypeBadgeVariant = useCallback((type: Task["type"]) => {
    switch (type) {
      case "EMAIL":
        return "default";
      case "CALENDAR":
        return "secondary";
      case "HUBSPOT":
        return "outline";
      case "GENERAL":
        return "destructive";
    }
  }, []);

  // Format date to readable string
  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  }, []);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Tasks</CardTitle>
          <CardDescription>
            View and manage tasks created by your AI assistant
          </CardDescription>
        </div>
        <div className="flex space-x-2">
          {selectedTasks.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={bulkCompleteTasks}
              disabled={isLoading}
            >
              <CheckSquare className="h-4 w-4 mr-2" />
              Complete Selected
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchTasks()}
            disabled={isLoading}
            className={activeFilter ? "bg-gray-100" : ""}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            All Tasks
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex space-x-2 mb-4">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => fetchTasks("PENDING")}
            className={activeFilter === "PENDING" ? "bg-gray-100" : ""}
          >
            Pending
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => fetchTasks("IN_PROGRESS")}
            className={activeFilter === "IN_PROGRESS" ? "bg-gray-100" : ""}
          >
            In Progress
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => fetchTasks("COMPLETED")}
            className={activeFilter === "COMPLETED" ? "bg-gray-100" : ""}
          >
            Completed
          </Button>
        </div>
        <div className="space-y-4">
          {tasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {activeFilter 
                ? `No ${activeFilter.toLowerCase()} tasks found.` 
                : "No tasks yet. Your AI assistant will create tasks when needed."}
            </div>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                className={`border rounded-md p-4 space-y-2 ${selectedTasks.includes(task.id) ? "border-blue-500 bg-blue-50" : ""}`}
                onClick={() => toggleTaskSelection(task.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(task.status)}
                    <h3 className="font-medium">{task.title}</h3>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={getTypeBadgeVariant(task.type)}>
                      {task.type}
                    </Badge>
                    {task.status !== "COMPLETED" && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          completeTask(task.id);
                        }}
                      >
                        <CheckSquare className="h-4 w-4 text-green-500" />
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        deleteTask(task.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
                {task.description && (
                  <p className="text-sm text-muted-foreground">
                    {task.description}
                  </p>
                )}
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Created: {formatDate(task.createdAt)}</span>
                  <span>
                    {task.status === "COMPLETED" && task.completedAt 
                      ? `Completed: ${formatDate(task.completedAt)}` 
                      : `Updated: ${formatDate(task.updatedAt)}`}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        Tasks are automatically created and managed by the AI assistant when processing your requests.
        {tasks.length > 0 && (
          <span className="ml-1 font-medium">
            {selectedTasks.length > 0 ? `${selectedTasks.length} tasks selected` : ``}
          </span>
        )}
      </CardFooter>
    </Card>
  );
}
