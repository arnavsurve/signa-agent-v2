import { tool } from "ai";
import { z } from "zod";
import { ToolServices, UserContext } from "./index";

/**
 * Create the get_my_feeds tool.
 */
export function createGetMyFeedsTool(
  services: ToolServices,
  context: UserContext
) {
  return tool({
    description: `Get the user's saved feeds.

Feeds are custom saved searches with specific filter combinations.
Use this to discover what feeds the user has set up, then use get_feed_signals() to get activity from a specific feed.`,

    inputSchema: z.object({}),

    execute: async () => {
      try {
        const feeds = await services.getUserFeeds(context.userId);

        return {
          feeds: feeds.map((feed) => ({
            id: feed.id,
            name: feed.name,
            filters: feed.filters,
            created_at: feed.createdAt.toISOString(),
          })),
          count: feeds.length,
        };
      } catch (error) {
        console.error("[get_my_feeds] Error:", error);
        return {
          error: "Failed to get feeds",
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}

/**
 * Zod schema for get_feed_signals tool parameters.
 */
const getFeedSignalsSchema = z.object({
  feed_id: z.number().describe("ID of the feed to get signals from"),
  limit: z.number().default(50).describe("Maximum number of signals to return"),
});

/**
 * Create the get_feed_signals tool.
 */
export function createGetFeedSignalsTool(
  services: ToolServices,
  context: UserContext
) {
  return tool({
    description: `Get recent signals (activity) from a specific feed.

Returns profiles matching the feed's filters that have had recent activity.
Use get_my_feeds() first to discover available feeds.`,

    inputSchema: getFeedSignalsSchema,

    execute: async (params) => {
      try {
        const signals = await services.getFeedSignals(
          params.feed_id,
          context.userId,
          params.limit
        );

        return {
          feed_id: params.feed_id,
          signals: signals.map((signal) => ({
            user_id: signal.userId,
            screen_name: signal.screenName,
            name: signal.name,
            signal_type: signal.signalType,
            signal_date: signal.signalDate,
            details: signal.details,
          })),
          count: signals.length,
        };
      } catch (error) {
        console.error("[get_feed_signals] Error:", error);
        return {
          error: "Failed to get feed signals",
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}
