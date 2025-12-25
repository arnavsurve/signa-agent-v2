import { NextRequest, NextResponse } from "next/server";
import { verifyToken, extractBearerToken } from "@/lib/auth/jwt";
import {
  createConversation,
  listConversations,
} from "@/lib/repositories/mongodb/conversations";
import { createMessage } from "@/lib/repositories/mongodb/messages";

/**
 * GET /api/conversations
 * List all conversations for the authenticated user.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = extractBearerToken(authHeader);

  if (!token) {
    return NextResponse.json(
      { error: "Authorization required" },
      { status: 401 }
    );
  }

  let userId: number;
  try {
    const payload = await verifyToken(token);
    userId = parseInt(payload.id, 10);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // Parse query parameters
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const search = searchParams.get("search") ?? undefined;

  try {
    const conversations = await listConversations(userId, { limit, skip: offset, search });
    return NextResponse.json({ conversations });
  } catch (error) {
    console.error("[conversations] List error:", error);
    return NextResponse.json(
      { error: "Failed to list conversations" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/conversations
 * Create a new conversation.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = extractBearerToken(authHeader);

  if (!token) {
    return NextResponse.json(
      { error: "Authorization required" },
      { status: 401 }
    );
  }

  let userId: number;
  try {
    const payload = await verifyToken(token);
    userId = parseInt(payload.id, 10);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { firstMessage } = body as {
      firstMessage?: string;
    };

    // Create conversation
    const conversation = await createConversation(
      userId,
      firstMessage?.slice(0, 100)
    );

    // If a first message is provided, save it
    if (firstMessage) {
      await createMessage({
        conversationId: conversation.id,
        userId,
        role: "user",
        content: firstMessage,
      });
    }

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    console.error("[conversations] Create error:", error);
    return NextResponse.json(
      { error: "Failed to create conversation" },
      { status: 500 }
    );
  }
}
