import { tool } from "ai";
import { z } from "zod";
import { ToolServices, UserContext } from "./index";

/**
 * Zod schema for get_person_details tool parameters.
 */
const getPersonDetailsSchema = z.object({
  user_id: z
    .number()
    .optional()
    .describe("Numeric user ID of the profile to retrieve"),
  screen_name: z
    .string()
    .optional()
    .describe("Twitter/X screen name (handle) of the profile"),
});

/**
 * Create the get_person_details tool.
 */
export function createGetPersonDetailsTool(
  services: ToolServices,
  _context: UserContext
) {
  return tool({
    description: `Get detailed profile information including 90-day signal timeline and full network connections.

Use this tool when you need:
- Complete signal timeline (last 90 days of bio changes, follows, activity)
- Full list of network connections (who follows them, who they follow)
- To get the real name and profile_url for someone you're mentioning

Note: find_people() already returns most profile data. Only call this for timeline or detailed connections.

Provide either user_id OR screen_name (not both).`,

    inputSchema: getPersonDetailsSchema,

    execute: async (params) => {
      if (!params.user_id && !params.screen_name) {
        return {
          error: "Either user_id or screen_name is required",
        };
      }

      try {
        const result = await services.getPersonDetails({
          userId: params.user_id,
          screenName: params.screen_name,
        });

        if (!result) {
          return {
            error: "Profile not found",
            hint: params.screen_name
              ? `No profile found for @${params.screen_name}`
              : `No profile found for user_id ${params.user_id}`,
          };
        }

        return {
          profile: result.profile,
          signal_timeline: result.signalTimeline || [],
          network_connections: result.networkConnections || [],
        };
      } catch (error) {
        console.error("[get_person_details] Error:", error);
        return {
          error: "Failed to get profile details",
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}
