"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { ChatThread } from "@/components/chat/chat-thread";
import { UIMessage } from "@ai-sdk/react";
import { Loader2 } from "lucide-react";

export default function ConversationPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { getAccessToken, isLoading: authLoading, isAuthenticated } = useAuth();
  const conversationId = params.conversationId as string;
  const autoSendParam = searchParams.get("auto") === "1";

  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shouldAutoSend, setShouldAutoSend] = useState(autoSendParam);
  const lastConversationIdRef = useRef(conversationId);

  // Wait for auth to load, then check authentication
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (lastConversationIdRef.current !== conversationId) {
      lastConversationIdRef.current = conversationId;
      setShouldAutoSend(autoSendParam);
    }
  }, [autoSendParam, conversationId]);

  useEffect(() => {
    // Don't fetch until auth is loaded and user is authenticated
    if (authLoading || !isAuthenticated) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setMessages([]);

    const fetchMessages = async () => {
      const token = getAccessToken();
      if (!token) {
        setError("Not authenticated");
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/conversations/${conversationId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to load conversation");
        }

        const data = await response.json();

        // Transform messages to UIMessage format
        const uiMessages: UIMessage[] = (data.messages || []).map(
          (msg: Record<string, unknown>) => {
            const content = msg.content;
            let textContent = "";

            // Handle different content formats
            if (typeof content === "string") {
              textContent = content;
            } else if (Array.isArray(content)) {
              // MessageContent[] format
              const textParts = content.filter(
                (c: { type?: string }) => c?.type === "text"
              );
              textContent = textParts
                .map((c: { text?: string }) => c?.text || "")
                .join("");
            }

            const parts: Array<Record<string, unknown>> = [];

            const toolEvents = Array.isArray(msg.tool_events)
              ? (msg.tool_events as Array<Record<string, unknown>>)
              : [];

            if (toolEvents.length > 0) {
              const toolCalls = toolEvents.filter(
                (event) => event.type === "tool_call"
              );
              const toolResults = toolEvents.filter(
                (event) => event.type === "tool_result"
              );
              const resultsById = new Map<string, Record<string, unknown>>();
              for (const event of toolResults) {
                if (event.tool_call_id == null) continue;
                resultsById.set(String(event.tool_call_id), event);
              }
              const handledResultIds = new Set<string>();

              toolCalls.forEach((call, index) => {
                const toolCallId = String(
                  call.tool_call_id ?? `tool-${index}`
                );
                const result = resultsById.get(toolCallId);
                if (result) {
                  handledResultIds.add(toolCallId);
                }
                parts.push({
                  type: `tool-${String(call.tool ?? "tool")}`,
                  toolCallId,
                  input: (call.args as Record<string, unknown>) ?? {},
                  state: result ? "output-available" : "input-available",
                  output: result?.result,
                });
              });

              toolResults.forEach((result, index) => {
                const resultId = String(result.tool_call_id ?? "");
                if (handledResultIds.has(resultId)) {
                  return;
                }
                const toolCallId = String(
                  result.tool_call_id ?? `tool-result-${index}`
                );
                parts.push({
                  type: `tool-${String(result.tool ?? "tool")}`,
                  toolCallId,
                  input: {},
                  state: "output-available",
                  output: result.result,
                });
              });
            }

            if (textContent) {
              parts.push({ type: "text", text: textContent });
            }

            return {
              id: (msg._id as string) || (msg.id as string),
              role: msg.role as "user" | "assistant",
              parts: parts as UIMessage["parts"],
            };
          }
        );

        setMessages(uiMessages);
      } catch (err) {
        console.error("Failed to fetch messages:", err);
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setIsLoading(false);
      }
    };

    fetchMessages();
  }, [conversationId, getAccessToken, authLoading, isAuthenticated]);

  useEffect(() => {
    if (!shouldAutoSend) return;
    if (authLoading || !isAuthenticated || isLoading) return;
    if (messages.length === 0) return;
    router.replace(`/chat/${conversationId}`);
  }, [authLoading, conversationId, isAuthenticated, isLoading, messages.length, router, shouldAutoSend]);

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-destructive mb-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <ChatThread
      conversationId={conversationId}
      initialMessages={messages}
      autoSendInitial={shouldAutoSend}
    />
  );
}
