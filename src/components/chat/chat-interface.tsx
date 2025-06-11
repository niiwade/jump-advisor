"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "ai/react";

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: "/api/chat",
    // Pass user ID in the body for authentication and personalization
    body: {
      userId: user.id
    },
    onResponse: () => {
      setIsLoading(false);
    },
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle form submission
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (input.trim() === "") return;
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
            className={`rounded-md bg-blue-500 px-4 py-2 text-white ${
              isLoading ? "opacity-50" : "hover:bg-blue-600"
            }`}
            disabled={isLoading}
          >
            {isLoading ? "Thinking..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
