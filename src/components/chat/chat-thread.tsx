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

function extractProfilesFromMessages(messages: UIMessage[]): Array<Record<string, unknown>> {
  const profiles: Array<Record<string, unknown>> = [];

  for (const message of messages) {
    if (!message.parts) continue;
    for (const part of message.parts) {
      if (!part.type.startsWith("tool-") && part.type !== "dynamic-tool") {
        continue;
      }
      const toolPart = part as Record<string, unknown>;
      const output = toolPart.output as Record<string, unknown> | undefined;
      if (!output) continue;
      const results = (output.results ?? output.profiles) as unknown[] | undefined;
      if (!Array.isArray(results)) continue;
      for (const result of results) {
        if (result && typeof result === "object") {
          profiles.push(result as Record<string, unknown>);
        }
      }
    }
  }

  return profiles;
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
  const hasProfileHydratedRef = useRef(false);
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
    hasProfileHydratedRef.current = false;
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
    if (hasProfileHydratedRef.current) return;
    if (initialMessages.length === 0) return;

    const profiles = extractProfilesFromMessages(initialMessages);
    if (profiles.length > 0) {
      addProfiles(profiles as unknown as Parameters<typeof addProfiles>[0]);
    }
    hasProfileHydratedRef.current = true;
  }, [addProfiles, initialMessages]);

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
    <div className="flex flex-col h-full min-h-0 gap-2">
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4"
      >
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-16">
              <h2 className="text-2xl font-semibold text-foreground mb-2">
                Start a conversation
              </h2>
              <p className="text-sm text-muted-foreground">
                Ask about people, signals, or network insights.
              </p>
            </div>
          ) : (
            <MessageList messages={messages} isLoading={isLoading} />
          )}

          {error && (
            <div className="mt-6 bento-panel rounded-2xl p-4 text-destructive">
              <p className="text-sm font-medium">Error: {error.message}</p>
              <button
                onClick={() => regenerate()}
                className="text-sm underline underline-offset-2 mt-2"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 sm:px-6 pb-2">
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
