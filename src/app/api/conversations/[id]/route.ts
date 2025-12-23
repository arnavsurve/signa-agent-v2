import { NextRequest, NextResponse } from "next/server";
import { verifyToken, extractBearerToken } from "@/lib/auth/jwt";
import {
  getConversation,
  updateConversation,
  deleteConversation,
} from "@/lib/repositories/mongodb/conversations";
import { listMessages, deleteMessages } from "@/lib/repositories/mongodb/messages";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/conversations/[id]
 * Get a conversation with its messages.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

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
    const conversation = await getConversation(id, userId);
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Get messages for the conversation
    const messages = await listMessages(id, userId);

    return NextResponse.json({ conversation, messages });
  } catch (error) {
    console.error("[conversations] Get error:", error);
    return NextResponse.json(
      { error: "Failed to get conversation" },
      { status: 500 }
    );
  }
}

/**
 * PATCH/PUT /api/conversations/[id]
 * Update a conversation (e.g., title).
 */
async function handleUpdate(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

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
    const { title } = body as { title?: string };

    const updated = await updateConversation(id, userId, { title });
    if (!updated) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Fetch the updated conversation
    const conversation = await getConversation(id, userId);
    return NextResponse.json({ conversation });
  } catch (error) {
    console.error("[conversations] Update error:", error);
    return NextResponse.json(
      { error: "Failed to update conversation" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/conversations/[id]
 * Delete a conversation and its messages.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

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
    // Delete messages first
    await deleteMessages(id, userId);

    // Delete conversation
    const deleted = await deleteConversation(id, userId);
    if (!deleted) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[conversations] Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete conversation" },
      { status: 500 }
    );
  }
}

// Export both PATCH and PUT to handle either method
export { handleUpdate as PATCH, handleUpdate as PUT };
