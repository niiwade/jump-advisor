'use client'
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";
import axios from "axios";

export function DataImport() {
  const [isLoading, setIsLoading] = useState<{
    all: boolean;
    emails: boolean;
    calendar: boolean;
    contacts: boolean;
  }>({
    all: false,
    emails: false,
    calendar: false,
    contacts: false,
  });
  const { toast } = useToast();

  // Function to import data
  const importData = async (type: "all" | "emails" | "calendar" | "contacts") => {
    try {
      setIsLoading((prev) => ({ ...prev, [type]: true }));
      
      const response = await axios.post("/api/ingest", { type });
      
      toast({
        title: "Import started",
        description: `Your ${type === "all" ? "data" : type} import has been initiated.`,
      });
      
      // If we have a task ID, we could poll for status updates
      if (response.data.taskId) {
        // For now, we'll just show a success message
        setTimeout(() => {
          toast({
            title: "Import in progress",
            description: "This may take a few minutes. You'll be notified when it's complete.",
          });
        }, 3000);
      }
    } catch (error) {
      console.error(`Error importing ${type}:`, error);
      toast({
        title: "Error",
        description: `Failed to import ${type}. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setIsLoading((prev) => ({ ...prev, [type]: false }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Import</CardTitle>
        <CardDescription>
          Import your data to enable the AI assistant to provide personalized help
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="default"
            onClick={() => importData("emails")}
            disabled={isLoading.emails || isLoading.all}
            className="flex items-center justify-center"
          >
            {isLoading.emails ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              "Import Emails"
            )}
          </Button>
          
          <Button
            variant="default"
            onClick={() => importData("calendar")}
            disabled={isLoading.calendar || isLoading.all}
            className="flex items-center justify-center"
          >
            {isLoading.calendar ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              "Import Calendar"
            )}
          </Button>
          
          <Button
            variant="default"
            onClick={() => importData("contacts")}
            disabled={isLoading.contacts || isLoading.all}
            className="flex items-center justify-center"
          >
            {isLoading.contacts ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              "Import Contacts"
            )}
          </Button>
          
          <Button
            variant="default"
            onClick={() => importData("all")}
            disabled={isLoading.all || isLoading.emails || isLoading.calendar || isLoading.contacts}
            className="flex items-center justify-center"
          >
            {isLoading.all ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing All...
              </>
            ) : (
              "Import All"
            )}
          </Button>
        </div>
        
        <div className="mt-4 text-xs text-muted-foreground">
          <p>
            Importing your data allows the AI assistant to provide personalized
            recommendations and answer questions about your clients, emails, and calendar.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
