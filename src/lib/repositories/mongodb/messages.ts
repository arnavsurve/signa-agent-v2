import { ObjectId } from "mongodb";
import { getAgentDb } from "@/lib/db/mongodb";
import { Message, MessageWithId, MessageContent, ToolEvent, Profile } from "@/lib/types";

const COLLECTION = "messages";

/**
 * Convert MongoDB document to public format with string ID.
 */
function toPublic(doc: Message): MessageWithId {
  const { _id, ...rest } = doc;
  return {
    ...rest,
    id: _id.toString(),
  };
}

/**
 * Create a new message in a conversation.
 */
export async function createMessage(params: {
  conversationId: string;
  userId: number;
  role: "user" | "assistant" | "system" | "tool";
  content: string | MessageContent[];
  toolEvents?: ToolEvent[];
  people?: Profile[];
}): Promise<MessageWithId> {
  const db = await getAgentDb();

  const doc: Omit<Message, "_id"> = {
    conversation_id: params.conversationId,
    user_id: params.userId,
    role: params.role,
    content: params.content,
    tool_events: params.toolEvents,
    people: params.people,
    created_at: new Date(),
  };

  const result = await db.collection<Message>(COLLECTION).insertOne({
    ...doc,
    _id: new ObjectId(),
  });

  return {
    ...doc,
    id: result.insertedId.toString(),
  };
}

/**
 * Get messages for a conversation.
 */
export async function listMessages(
  conversationId: string,
  userId: number,
  options: { limit?: number } = {}
): Promise<MessageWithId[]> {
  const db = await getAgentDb();
  const { limit = 100 } = options;

  const docs = await db
    .collection<Message>(COLLECTION)
    .find({
      conversation_id: conversationId,
      user_id: userId,
    })
    .sort({ created_at: 1 })
    .limit(limit)
    .toArray();

  return docs.map(toPublic);
}

/**
 * Delete all messages in a conversation.
 */
export async function deleteMessages(
  conversationId: string,
  userId: number
): Promise<number> {
  const db = await getAgentDb();

  const result = await db.collection<Message>(COLLECTION).deleteMany({
    conversation_id: conversationId,
    user_id: userId,
  });

  return result.deletedCount;
}

/**
 * Get the last N messages for a conversation (for context).
 */
export async function getRecentMessages(
  conversationId: string,
  userId: number,
  limit: number = 20
): Promise<MessageWithId[]> {
  const db = await getAgentDb();

  const docs = await db
    .collection<Message>(COLLECTION)
    .find({
      conversation_id: conversationId,
      user_id: userId,
    })
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();

  // Reverse to get chronological order
  return docs.reverse().map(toPublic);
}
