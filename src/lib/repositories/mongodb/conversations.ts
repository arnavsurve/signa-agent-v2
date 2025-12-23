import { ObjectId, Filter, UpdateFilter } from "mongodb";
import { getAgentDb } from "@/lib/db/mongodb";
import { Conversation, ConversationWithId } from "@/lib/types";

const COLLECTION = "conversations";

/**
 * Convert MongoDB document to public format with string ID.
 */
function toPublic(doc: Conversation): ConversationWithId {
  const { _id, ...rest } = doc;
  return {
    ...rest,
    id: _id.toString(),
  };
}

/**
 * Create a new conversation.
 */
export async function createConversation(
  userId: number,
  firstMessagePreview?: string
): Promise<ConversationWithId> {
  const db = await getAgentDb();
  const now = new Date();

  const doc: Omit<Conversation, "_id"> = {
    user_id: userId,
    title: firstMessagePreview?.slice(0, 50) || "New Conversation",
    first_message_preview: firstMessagePreview || null,
    created_at: now,
    updated_at: now,
  };

  const result = await db.collection<Conversation>(COLLECTION).insertOne({
    ...doc,
    _id: new ObjectId(),
  });

  return {
    ...doc,
    id: result.insertedId.toString(),
  };
}

/**
 * Get a conversation by ID, ensuring it belongs to the user.
 */
export async function getConversation(
  conversationId: string,
  userId: number
): Promise<ConversationWithId | null> {
  const db = await getAgentDb();

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(conversationId);
  } catch {
    return null;
  }

  const doc = await db.collection<Conversation>(COLLECTION).findOne({
    _id: objectId,
    user_id: userId,
  });

  return doc ? toPublic(doc) : null;
}

/**
 * List conversations for a user with optional search.
 */
export async function listConversations(
  userId: number,
  options: {
    limit?: number;
    skip?: number;
    search?: string;
  } = {}
): Promise<ConversationWithId[]> {
  const db = await getAgentDb();
  const { limit = 50, skip = 0, search } = options;

  const filter: Filter<Conversation> = { user_id: userId };

  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { first_message_preview: { $regex: search, $options: "i" } },
    ];
  }

  const docs = await db
    .collection<Conversation>(COLLECTION)
    .find(filter)
    .sort({ updated_at: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  return docs.map(toPublic);
}

/**
 * Update a conversation's title.
 */
export async function updateConversation(
  conversationId: string,
  userId: number,
  updates: { title?: string }
): Promise<boolean> {
  const db = await getAgentDb();

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(conversationId);
  } catch {
    return false;
  }

  const updateDoc: UpdateFilter<Conversation> = {
    $set: {
      ...updates,
      updated_at: new Date(),
    },
  };

  const result = await db.collection<Conversation>(COLLECTION).updateOne(
    { _id: objectId, user_id: userId },
    updateDoc
  );

  return result.matchedCount > 0;
}

/**
 * Delete a conversation.
 */
export async function deleteConversation(
  conversationId: string,
  userId: number
): Promise<boolean> {
  const db = await getAgentDb();

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(conversationId);
  } catch {
    return false;
  }

  const result = await db.collection<Conversation>(COLLECTION).deleteOne({
    _id: objectId,
    user_id: userId,
  });

  return result.deletedCount > 0;
}

/**
 * Update the updated_at timestamp for a conversation.
 */
export async function touchConversation(
  conversationId: string,
  userId: number
): Promise<void> {
  const db = await getAgentDb();

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(conversationId);
  } catch {
    return;
  }

  await db.collection<Conversation>(COLLECTION).updateOne(
    { _id: objectId, user_id: userId },
    { $set: { updated_at: new Date() } }
  );
}
