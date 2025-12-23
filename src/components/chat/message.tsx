"use client";

import { UIMessage } from "@ai-sdk/react";
import { User, Bot, Loader2 } from "lucide-react";
import { MarkdownText } from "./markdown-text";
import { ToolEvents } from "./tool-events";
import { cn } from "@/lib/utils";

interface MessageProps {
  message: UIMessage;
  isLast: boolean;
  isLoading: boolean;
}

// Helper to extract text content from message parts
function getTextContent(message: UIMessage): string {
  if (!message.parts) return "";
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { type: "text"; text: string }).text)
    .join("");
}

// Helper to extract tool invocations from message parts
function getToolInvocations(message: UIMessage): ToolInvocation[] {
  if (!message.parts) return [];
  return message.parts
    .filter((part) => part.type.startsWith("tool-") || part.type === "dynamic-tool")
    .map((part) => {
      const toolPart = part as Record<string, unknown>;
      return {
        toolCallId: toolPart.toolCallId as string,
        toolName: part.type === "dynamic-tool"
          ? (toolPart.toolName as string)
          : part.type.replace("tool-", ""),
        args: toolPart.input as Record<string, unknown>,
        state: mapToolState(toolPart.state as string),
        result: toolPart.output,
      };
    });
}

// Map v5 tool states to our display states
function mapToolState(state: string): "partial-call" | "call" | "result" {
  switch (state) {
    case "input-streaming":
      return "partial-call";
    case "input-available":
      return "call";
    case "output-available":
    case "output-error":
      return "result";
    default:
      return "call";
  }
}

interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  state: "partial-call" | "call" | "result";
  result?: unknown;
}

export function Message({ message, isLast, isLoading }: MessageProps) {
  const isUser = message.role === "user";
  const textContent = getTextContent(message);
  const toolInvocations = getToolInvocations(message);
  const hasToolInvocations = toolInvocations.length > 0;
  const showSpinner = isLoading && isLast && !textContent && !hasToolInvocations;

  return (
    <div
      className={cn(
        "flex gap-4",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      {/* Content */}
      <div
        className={cn(
          "flex-1 min-w-0 space-y-2",
          isUser ? "text-right" : "text-left"
        )}
      >
        {/* Tool invocations */}
        {hasToolInvocations && (
          <ToolEvents
            invocations={toolInvocations}
            isLoading={isLoading && isLast}
          />
        )}

        {/* Message content */}
        {textContent && (
          <div
            className={cn(
              "inline-block rounded-lg px-4 py-2 max-w-full",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{textContent}</p>
            ) : (
              <MarkdownText content={textContent} />
            )}
          </div>
        )}

        {/* Loading spinner */}
        {showSpinner && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Thinking...</span>
          </div>
        )}
      </div>
    </div>
  );
}
