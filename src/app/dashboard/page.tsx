import { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { redirect } from "next/navigation";
import ChatInterface from "@/components/chat/chat-interface";
import { InstructionsPanel } from "@/components/dashboard/instructions-panel";
import { TasksPanel } from "@/components/dashboard/tasks-panel";
import { DataImport } from "@/components/dashboard/data-import";
import { IngestionStatus } from "@/components/dashboard/ingestion-status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata: Metadata = {
  title: "Dashboard | Financial Advisor AI",
  description: "Your AI-powered financial advisor assistant",
};

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b">
        <div className="container flex h-16 items-center px-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">Financial Advisor AI</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="font-medium">
                  {session.user.name || session.user.email}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 container p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <ChatInterface user={session.user} />
          </div>
          <div className="space-y-6">
            <Tabs defaultValue="instructions" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="instructions">Instructions</TabsTrigger>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
              </TabsList>
              <TabsContent value="instructions">
                <InstructionsPanel />
              </TabsContent>
              <TabsContent value="tasks">
                <TasksPanel />
              </TabsContent>
            </Tabs>
            {/* Data ingestion section */}
            <div className="space-y-4">
              <DataImport />
              <IngestionStatus />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
