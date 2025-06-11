"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Trash2, Plus } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import axios from "axios";

type Instruction = {
  id: string;
  instruction: string;
  active: boolean;
  createdAt: string;
};

export function InstructionsPanel() {
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [newInstruction, setNewInstruction] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Fetch all instructions for the user
  const fetchInstructions = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await axios.get("/api/instructions");
      setInstructions(response.data.instructions);
    } catch (error) {
      console.error("Error fetching instructions:", error);
      toast({
        title: "Error",
        description: "Failed to load instructions",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);
  
  // Fetch instructions on component mount
  useEffect(() => {
    fetchInstructions();
  }, [fetchInstructions]);

  // Add a new instruction
  const addInstruction = async () => {
    if (!newInstruction.trim()) return;

    try {
      setIsLoading(true);
      const response = await axios.post("/api/instructions", {
        instruction: newInstruction,
      });

      setInstructions([...instructions, response.data]);
      setNewInstruction("");
      toast({
        title: "Success",
        description: "Instruction added successfully",
      });
    } catch (error) {
      console.error("Error adding instruction:", error);
      toast({
        title: "Error",
        description: "Failed to add instruction",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle instruction active status
  const toggleInstructionStatus = async (id: string, active: boolean) => {
    try {
      setIsLoading(true);
      await axios.patch(`/api/instructions/${id}`, {
        active,
      });

      setInstructions(
        instructions.map((instruction) =>
          instruction.id === id ? { ...instruction, active } : instruction
        )
      );
    } catch (error) {
      console.error("Error updating instruction:", error);
      toast({
        title: "Error",
        description: "Failed to update instruction",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Delete an instruction
  const deleteInstruction = async (id: string) => {
    try {
      setIsLoading(true);
      await axios.delete(`/api/instructions/${id}`);

      setInstructions(instructions.filter((instruction) => instruction.id !== id));
      toast({
        title: "Success",
        description: "Instruction deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting instruction:", error);
      toast({
        title: "Error",
        description: "Failed to delete instruction",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Ongoing Instructions</CardTitle>
        <CardDescription>
          Set up instructions for your AI assistant to follow continuously
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Input
              placeholder="Add a new instruction..."
              value={newInstruction}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewInstruction(e.target.value)}
              disabled={isLoading}
            />
            <Button
              onClick={addInstruction}
              disabled={isLoading || !newInstruction.trim()}
              size="icon"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            {instructions.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                No instructions yet. Add one to get started.
              </div>
            ) : (
              instructions.map((instruction) => (
                <div
                  key={instruction.id}
                  className="flex items-center justify-between p-3 border rounded-md"
                >
                  <div className="flex-1">
                    <p className="text-sm">{instruction.instruction}</p>
                    <p className="text-xs text-muted-foreground">
                      Created on {new Date(instruction.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={instruction.active}
                        onCheckedChange={(checked: boolean) =>
                          toggleInstructionStatus(instruction.id, checked)
                        }
                        disabled={isLoading}
                      />
                      <Label className="text-xs">Active</Label>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteInstruction(instruction.id)}
                      disabled={isLoading}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        Instructions will be followed by the AI assistant when processing your requests and
        responding to events from Gmail, Calendar, and HubSpot.
      </CardFooter>
    </Card>
  );
}
