"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "ai/react";
import { Loader2 } from "lucide-react";

interface ChatInterfaceProps {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

export default function ChatInterface({ user }: ChatInterfaceProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [processingType, setProcessingType] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: "/api/chat",
    // Pass user ID in the body for authentication and personalization
    body: {
      userId: user.id
    },
    onResponse: (response) => {
      setIsLoading(false);
      setProcessingType(null);
      
      // Check if the response contains a task creation confirmation
      if (response.ok) {
        const responseText = response.statusText || '';
        if (responseText.includes('task') || responseText.includes('Task')) {
          setStatusMessage('Task created successfully!');
          // Clear status message after 3 seconds
          setTimeout(() => setStatusMessage(null), 3000);
        }
      }
    },
    onError: (error) => {
      setIsLoading(false);
      setProcessingType(null);
      setStatusMessage(`Error: ${error.message || 'Something went wrong'}`);
      // Clear error message after 5 seconds
      setTimeout(() => setStatusMessage(null), 5000);
    }
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle form submission
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (input.trim() === "") return;
    
    // Detect if this is an email drafting request
    const inputLower = input.toLowerCase();
    if (inputLower.includes('draft an email') || inputLower.includes('write an email')) {
      setProcessingType('email');
    } else if (inputLower.includes('schedule') || inputLower.includes('appointment')) {
      setProcessingType('calendar');
    } else if (inputLower.includes('contact') || inputLower.includes('hubspot')) {
      setProcessingType('contact');
    }
    
    setIsLoading(true);
    handleSubmit(e);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-md text-center">
              <h2 className="text-2xl font-bold">Welcome to your Financial Advisor AI</h2>
              <p className="mt-2 text-gray-500">
                Ask me questions about your clients or request me to perform tasks like scheduling appointments.
              </p>
              <div className="mt-4 grid gap-2">
                <div className="rounded-lg border p-3">
                  <p className="font-medium">Examples:</p>
                  <ul className="mt-2 list-disc pl-4 text-sm">
                    <li>&quot;Who mentioned their kid plays baseball?&quot;</li>
                    <li>&quot;Why did Greg say he wanted to sell AAPL stock?&quot;</li>
                    <li>&quot;Schedule an appointment with Sara Smith&quot;</li>
                  </ul>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="font-medium">Ongoing instructions:</p>
                  <ul className="mt-2 list-disc pl-4 text-sm">
                    <li>&quot;When someone emails me that is not in Hubspot, create a contact&quot;</li>
                    <li>&quot;When I create a contact in Hubspot, send them a welcome email&quot;</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-4 ${
                    message.role === "user"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{message.content}</div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      <div className="border-t p-4">
        {statusMessage && (
          <div className={`mb-2 p-2 rounded text-sm ${statusMessage.includes('Error') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
            {statusMessage}
          </div>
        )}
        <form onSubmit={onSubmit} className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Ask a question or request a task..."
            className="flex-1 rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none"
            disabled={isLoading}
          />
          <button
            type="submit"
            className={`rounded-md bg-blue-500 px-4 py-2 text-white flex items-center justify-center min-w-[100px] ${
              isLoading ? "opacity-80" : "hover:bg-blue-600"
            }`}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {processingType === 'email' ? 'Creating email task...' : 
                 processingType === 'calendar' ? 'Scheduling...' : 
                 processingType === 'contact' ? 'Processing contact...' : 'Processing...'}
              </>
            ) : (
              "Send"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
