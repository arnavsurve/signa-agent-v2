import { ObjectId } from "mongodb";
import { getAgentDb } from "@/lib/db/mongodb";
import { ContextMetrics } from "@/lib/types";

const COLLECTION = "context_usage_metrics";

/**
 * Insert context usage metrics.
 */
export async function insertContextMetrics(
  metrics: Omit<ContextMetrics, "_id">
): Promise<string> {
  const db = await getAgentDb();

  const result = await db.collection<ContextMetrics>(COLLECTION).insertOne({
    ...metrics,
    _id: new ObjectId(),
  });

  return result.insertedId.toString();
}

/**
 * Get metrics for a conversation.
 */
export async function getConversationMetrics(
  conversationId: string,
  userId: number
): Promise<ContextMetrics[]> {
  const db = await getAgentDb();

  const docs = await db
    .collection<ContextMetrics>(COLLECTION)
    .find({
      conversation_id: conversationId,
      user_id: userId,
    })
    .sort({ timestamp: -1 })
    .toArray();

  return docs;
}

/**
 * Get the latest metrics for a conversation.
 */
export async function getLatestMetrics(
  conversationId: string,
  userId: number
): Promise<ContextMetrics | null> {
  const db = await getAgentDb();

  const doc = await db
    .collection<ContextMetrics>(COLLECTION)
    .findOne(
      {
        conversation_id: conversationId,
        user_id: userId,
      },
      { sort: { timestamp: -1 } }
    );

  return doc;
}
