import { tool } from "ai";
import { z } from "zod";
import { ToolServices, UserContext } from "./index";

/**
 * Zod schema for get_person_activity tool parameters.
 */
const getPersonActivitySchema = z.object({
  user_id: z
    .string()
    .optional()
    .describe("The user's rest_id (Twitter ID). Provide this OR screen_name."),
  screen_name: z
    .string()
    .optional()
    .describe("Twitter screen name (without @). Provide this OR user_id."),
  days: z
    .number()
    .default(30)
    .describe("Number of days to look back for activity. Default: 30"),
  include_twitter: z
    .boolean()
    .default(true)
    .describe("Include Twitter follow events"),
  include_linkedin: z
    .boolean()
    .default(true)
    .describe("Include LinkedIn connection events"),
  include_bio: z
    .boolean()
    .default(true)
    .describe("Include bio/headline changes"),
  include_stealth: z
    .boolean()
    .default(true)
    .describe("Include LinkedIn stealth mode events"),
  include_free_agent: z
    .boolean()
    .default(true)
    .describe("Include free agent status (left company)"),
  max_bio_changes: z
    .number()
    .optional()
    .describe("Limit number of bio changes returned. Omit for all."),
});

/**
 * Create the get_person_activity tool.
 * 
 * This tool provides comprehensive activity data for a single person,
 * combining profile details with relationship events and timeline.
 */
export function createGetPersonActivityTool(
  services: ToolServices,
  context: UserContext
) {
  return tool({
    description: `Get complete activity for a person: Twitter follows, LinkedIn connections, bio changes, stealth mode, free agent status.

Combines profile details with a timeline of all relationship events and signal changes.
Use this when exploring a specific person's recent activity or investigating their network movements.

Provide either user_id OR screen_name (not both).

Returns:
- profile: Basic profile info (name, headline, work experience, etc.)
- twitter_followers: People who recently followed this person
- twitter_following: People this person recently followed
- linkedin_connections: Recent LinkedIn connections (bidirectional)
- bio_changes: List of bio/headline changes with before/after text
- stealth_status: Current LinkedIn stealth mode (in/out) if detected
- free_agent_details: If they left a company (previous company, title, date)
- activity: Chronological timeline of all events
- summary: Counts and high-level stats`,

    inputSchema: getPersonActivitySchema,

    execute: async (params) => {
      try {
        // Validate that at least one identifier is provided
        if (!params.user_id && !params.screen_name) {
          return {
            error: "Must provide either user_id or screen_name",
          };
        }

        const result = await services.getPersonActivity({
          userId: params.user_id,
          screenName: params.screen_name,
          days: params.days,
          includeTwitter: params.include_twitter,
          includeLinkedin: params.include_linkedin,
          includeBio: params.include_bio,
          includeStealth: params.include_stealth,
          includeFreeAgent: params.include_free_agent,
          maxBioChanges: params.max_bio_changes,
          requestingUserId: context.userId,
        });

        if (!result) {
          return {
            error: "Person not found",
            user_id: params.user_id,
            screen_name: params.screen_name,
          };
        }

        return {
          profile: result.profile,
          twitter_followers: result.twitterFollowers,
          twitter_following: result.twitterFollowing,
          linkedin_connections: result.linkedinConnections,
          bio_changes: result.bioChanges,
          stealth_status: result.stealthStatus,
          free_agent_details: result.freeAgentDetails,
          activity: result.activity,
          summary: result.summary,
        };
      } catch (error) {
        console.error("[get_person_activity] Error:", error);
        return {
          error: "Failed to get person activity",
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}
