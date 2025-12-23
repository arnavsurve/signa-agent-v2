import { NextRequest } from "next/server";
import { streamText, UIMessage, stepCountIs, convertToModelMessages } from "ai";
import { openai } from "@ai-sdk/openai";
import { verifyToken, extractBearerToken } from "@/lib/auth/jwt";
import { SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { ContextSession } from "@/lib/ai/context/session";
import { createTools } from "@/lib/ai/tools";
import { createToolServices } from "@/lib/services";
import { createMessage } from "@/lib/repositories/mongodb/messages";
import { touchConversation } from "@/lib/repositories/mongodb/conversations";
import type { ToolEvent } from "@/lib/types";

export const maxDuration = 60; // Allow up to 60s for Pro tier

function buildToolEvents(
  toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }>,
  toolResults: Array<{ toolCallId: string; toolName: string; output: unknown }>,
): ToolEvent[] {
  const events: ToolEvent[] = [];

  for (const call of toolCalls) {
    events.push({
      type: "tool_call",
      tool: call.toolName,
      args: call.input as Record<string, unknown>,
      tool_call_id: call.toolCallId,
    });
  }

  for (const result of toolResults) {
    events.push({
      type: "tool_result",
      tool: result.toolName,
      result: result.output,
      tool_call_id: result.toolCallId,
    });
  }

  return events;
}

/**
 * POST /api/chat
 * Main streaming chat endpoint using Vercel AI SDK.
 */
export async function POST(req: NextRequest) {
  // Authenticate user
  const authHeader = req.headers.get("authorization");
  const token = extractBearerToken(authHeader);

  if (!token) {
    return new Response(JSON.stringify({ error: "Authorization required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let userId: number;
  try {
    const payload = await verifyToken(token);
    userId = parseInt(payload.id, 10);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse request body
  const body = await req.json();
  const { messages, conversationId, messageId } = body as {
    messages: UIMessage[];
    conversationId: string;
    messageId?: string;
  };

  if (!conversationId) {
    return new Response(
      JSON.stringify({ error: "conversationId is required" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Save the latest user message to database (it's the last one in the array)
  const lastMessage = messages[messages.length - 1];
  if (!messageId && lastMessage && lastMessage.role === "user") {
    const textPart = lastMessage.parts?.find((p) => p.type === "text") as
      | { type: "text"; text: string }
      | undefined;

    if (textPart?.text) {
      try {
        await createMessage({
          conversationId,
          userId,
          role: "user",
          content: textPart.text,
        });
      } catch (error) {
        console.error("[chat] Error saving user message:", error);
      }
    }
  }

  // Convert UIMessage[] to ModelMessage[] for streamText
  // JSON clone is a workaround for a known AI SDK issue
  const modelMessages = convertToModelMessages(
    JSON.parse(JSON.stringify(messages)) as UIMessage[],
  );

  // Create context session for optimization
  const session = new ContextSession(conversationId, userId);
  session.addMessages(modelMessages);
  const optimizedMessages = await session.getOptimizedMessages();

  // Create services and tools
  const services = createToolServices();
  const tools = createTools(services, { userId, conversationId });

  // Stream the response
  const result = streamText({
    model: openai("gpt-5.2-2025-12-11"),
    system: SYSTEM_PROMPT,
    messages: optimizedMessages,
    tools,
    stopWhen: stepCountIs(10), // Allow up to 10 tool call rounds

    onFinish: async (event) => {
      try {
        const steps = event.steps ?? [event];
        const toolCalls = steps.flatMap((step) => step.toolCalls ?? []);
        const toolResults = steps.flatMap((step) => step.toolResults ?? []);
        const toolEvents = buildToolEvents(toolCalls, toolResults);
        const usage = event.totalUsage ?? event.usage;

        // Save assistant message to database
        await createMessage({
          conversationId,
          userId,
          role: "assistant",
          content: event.text,
          toolEvents: toolEvents.length > 0 ? toolEvents : undefined,
        });

        // Update conversation timestamp
        await touchConversation(conversationId, userId);

        // Record usage metrics
        if (usage) {
          await session.updateUsageMetrics(
            usage.inputTokens ?? 0,
            usage.outputTokens ?? 0,
          );
        }
      } catch (error) {
        console.error("[chat] Error saving message:", error);
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
