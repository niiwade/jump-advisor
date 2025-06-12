"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { Mail, Calendar, User, FileText } from "lucide-react";

type TaskMetadata = {
  emailDraft?: {
    to: string;
    subject: string;
    body: string;
  };
  currentStep?: number;
  totalSteps?: number;
  [key: string]: unknown;
};

type Task = {
  id: string;
  title: string;
  description: string;
  type: "EMAIL" | "CALENDAR" | "HUBSPOT" | "GENERAL";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "WAITING_FOR_RESPONSE";
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  metadata?: TaskMetadata;
};

interface TaskDetailsModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (taskId: string) => void;
}

export function TaskDetailsModal({ task, isOpen, onClose, onComplete }: TaskDetailsModalProps) {
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    } catch {
      return dateString;
    }
  };

  const getTaskIcon = (type: string) => {
    switch (type) {
      case "EMAIL":
        return <Mail className="h-5 w-5 text-blue-500" />;
      case "CALENDAR":
        return <Calendar className="h-5 w-5 text-green-500" />;
      case "HUBSPOT":
        return <User className="h-5 w-5 text-orange-500" />;
      default:
        return <FileText className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PENDING":
        return "bg-yellow-100 text-yellow-800";
      case "IN_PROGRESS":
        return "bg-blue-100 text-blue-800";
      case "COMPLETED":
        return "bg-green-100 text-green-800";
      case "FAILED":
        return "bg-red-100 text-red-800";
      case "WAITING_FOR_RESPONSE":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (!task) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            {getTaskIcon(task.type)}
            <DialogTitle>{task.title}</DialogTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor(task.status)}>
              {task.status.replace(/_/g, " ")}
            </Badge>
            <Badge variant="outline">{task.type}</Badge>
            {task.metadata?.currentStep && task.metadata?.totalSteps && (
              <Badge variant="outline">
                Step {task.metadata.currentStep} of {task.metadata.totalSteps}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-1">Description</h4>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
          </div>

          {task.type === "EMAIL" && task.metadata?.emailDraft && (
            <div className="space-y-3 border rounded-md p-3 bg-gray-50">
              <h4 className="text-sm font-medium">Email Draft Details</h4>
              
              <div>
                <p className="text-xs text-gray-500">To:</p>
                <p className="text-sm">{task.metadata.emailDraft.to || "(Not specified)"}</p>
              </div>
              
              <div>
                <p className="text-xs text-gray-500">Subject:</p>
                <p className="text-sm">{task.metadata.emailDraft.subject || "(No subject)"}</p>
              </div>
              
              {task.metadata.emailDraft.body && (
                <div>
                  <p className="text-xs text-gray-500">Body:</p>
                  <p className="text-sm whitespace-pre-wrap border rounded p-2 bg-white">
                    {task.metadata.emailDraft.body}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
            <div>
              <p>Created:</p>
              <p className="font-medium">{formatDate(task.createdAt)}</p>
              <p className="text-xs">({formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })})</p>
            </div>
            <div>
              <p>{task.status === "COMPLETED" ? "Completed:" : "Last Updated:"}</p>
              <p className="font-medium">
                {task.status === "COMPLETED" && task.completedAt
                  ? formatDate(task.completedAt)
                  : formatDate(task.updatedAt)}
              </p>
              <p className="text-xs">
                ({formatDistanceToNow(
                  new Date(task.status === "COMPLETED" && task.completedAt ? task.completedAt : task.updatedAt),
                  { addSuffix: true }
                )})
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            {task.status !== "COMPLETED" && onComplete && (
              <Button 
                variant="outline" 
                onClick={() => {
                  onComplete(task.id);
                  onClose();
                }}
              >
                Mark as Complete
              </Button>
            )}
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
