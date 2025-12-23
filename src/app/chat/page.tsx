"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Composer } from "@/components/chat/composer";
import { MessageSquare } from "lucide-react";

export default function NewChatPage() {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    try {
      // Create new conversation
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstMessage: input.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Navigate to the new conversation with the initial message
        const conversationId = data.conversation?.id || data.id;
        router.push(`/chat/${conversationId}?auto=1`);
      }
    } catch (error) {
      console.error("Failed to create conversation:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-lg">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <MessageSquare className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Welcome to Signa Agent</h1>
          <p className="text-muted-foreground mb-8">
            Ask about people, signals, or network insights. I can help you
            discover connections, analyze trends, and find relevant information.
          </p>
          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-2">Try asking:</p>
            <ul className="space-y-1">
              <li>&quot;Find people in AI/ML sector&quot;</li>
              <li>&quot;Who are the trending founders this week?&quot;</li>
              <li>&quot;Show me signals from my feeds&quot;</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t bg-background p-4">
        <div className="max-w-3xl mx-auto">
          <Composer
            input={input}
            onChange={handleInputChange}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            onStop={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
