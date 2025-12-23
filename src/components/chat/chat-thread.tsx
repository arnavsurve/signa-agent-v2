"use client";

import { useChat, UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useAuth } from "@/contexts/auth-context";
import { useProfileCache } from "@/contexts/profile-cache-context";
import { MessageList } from "./message-list";
import { Composer } from "./composer";
import { useEffect, useRef, useState, useMemo, FormEvent } from "react";

interface ChatThreadProps {
  conversationId: string;
  initialMessages?: UIMessage[];
  autoSendInitial?: boolean;
}

function getTextContent(message: UIMessage): string {
  if (!message.parts) return "";
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { type: "text"; text: string }).text)
    .join("");
}

export function ChatThread({
  conversationId,
  initialMessages = [],
  autoSendInitial = false,
}: ChatThreadProps) {
  const { getAccessToken } = useAuth();
  const { addProfiles } = useProfileCache();
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasHydratedRef = useRef(false);
  const hasAutoSentRef = useRef(false);
  const [input, setInput] = useState("");

  // Create transport with auth headers - memoized to avoid recreating on each render
  const transport = useMemo(() => {
    return new DefaultChatTransport({
      api: "/api/chat",
      headers: () => ({
        Authorization: `Bearer ${getAccessToken()}`,
      }),
      body: () => ({
        conversationId,
      }),
    });
  }, [conversationId, getAccessToken]);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    error,
    regenerate,
    stop,
  } = useChat({
    id: conversationId,
    transport,
    messages: initialMessages,
    onFinish: ({ message }) => {
      // Extract profile data from tool results and cache it
      if (message.parts) {
        for (const part of message.parts) {
          if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
            const toolPart = part as Record<string, unknown>;
            if (toolPart.state === "output-available" && toolPart.output) {
              const result = toolPart.output as Record<string, unknown>;
              if (result?.results && Array.isArray(result.results)) {
                addProfiles(result.results);
              }
            }
          }
        }
      }
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    hasHydratedRef.current = false;
    hasAutoSentRef.current = false;
  }, [conversationId]);

  useEffect(() => {
    if (initialMessages.length === 0) return;
    if (hasHydratedRef.current) return;
    if (messages.length > 0) {
      hasHydratedRef.current = true;
      return;
    }
    setMessages(initialMessages);
    hasHydratedRef.current = true;
  }, [initialMessages, messages.length, setMessages]);

  useEffect(() => {
    if (!autoSendInitial || hasAutoSentRef.current) return;
    if (!hasHydratedRef.current) return;
    if (status !== "ready") return;
    if (initialMessages.length === 0) return;

    const lastMessage = initialMessages[initialMessages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") return;

    const text = getTextContent(lastMessage).trim();
    if (!text) return;

    hasAutoSentRef.current = true;
    void sendMessage({
      text,
      messageId: lastMessage.id,
    });
  }, [autoSendInitial, initialMessages, sendMessage, status]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const text = input.trim();
    setInput("");
    await sendMessage({ text });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <h2 className="text-xl font-medium mb-2">
                Start a conversation
              </h2>
              <p className="text-sm">
                Ask about people, signals, or network insights
              </p>
            </div>
          ) : (
            <MessageList messages={messages} isLoading={isLoading} />
          )}

          {error && (
            <div className="mt-4 p-4 bg-destructive/10 text-destructive rounded-lg">
              <p className="text-sm">Error: {error.message}</p>
              <button
                onClick={() => regenerate()}
                className="text-sm underline mt-2"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="border-t bg-background p-4">
        <div className="max-w-3xl mx-auto">
          <Composer
            input={input}
            onChange={handleInputChange}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            onStop={stop}
          />
        </div>
      </div>
    </div>
  );
}
