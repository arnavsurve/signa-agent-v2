import { tool } from "ai";
import { z } from "zod";
import { ToolServices, UserContext, ProfileResult, Feed } from "./index";
import { searchProfiles } from "@/lib/repositories/mongodb/profiles";
import { getUserFeeds } from "@/lib/repositories/postgres/network";
import { query } from "@/lib/db/postgres";

/**
 * Zod schema for get_aggregated_feed_signals tool parameters.
 */
const getAggregatedFeedSignalsSchema = z.object({
  feed_ids: z
    .array(z.number())
    .optional()
    .describe("Specific feed IDs to aggregate (default: all user feeds)"),
  ranking: z
    .enum(["network_connections", "recent_activity", "funding"])
    .default("recent_activity")
    .describe("How to rank the aggregated results"),
  days: z
    .number()
    .default(7)
    .describe("Number of days of activity to include"),
  limit: z
    .number()
    .default(50)
    .describe("Maximum results to return"),
});

/**
 * Transform raw profile to ProfileResult format.
 */
function profileToResult(p: {
  user_id: string;
  screen_name: string;
  name: string;
  description?: string | null;
  profile_image_url?: string | null;
  followers_count?: number | null;
  location?: string | null;
  profile_type?: string | null;
  headline?: string | null;
  sectors?: string[] | null;
  locations?: string[] | null;
  job_titles?: string[] | null;
  work_experience?: string[] | null;
  universities?: string[] | null;
  investors?: string[] | null;
  amount_raised?: number | null;
  stages?: string[] | null;
  is_technical?: boolean | null;
  linkedin_url?: string | null;
  crunchbase_url?: string | null;
  profile_url?: string | null;

  followed_by_count?: number | null;
  stealth_status?: string | null;
  recent_bio_change?: boolean | null;
  total_signals?: number | null;
}): ProfileResult {
  return {
    userId: parseInt(p.user_id, 10) || 0,
    screenName: p.screen_name,
    name: p.name,
    description: p.description || undefined,
    profileImageUrl: p.profile_image_url || undefined,
    followersCount: p.followers_count || undefined,
    location: p.location || undefined,
    profileType: p.profile_type || undefined,
    headline: p.headline || undefined,
    sectors: p.sectors || undefined,
    locations: p.locations || undefined,
    jobTitles: p.job_titles || undefined,
    workExperience: p.work_experience?.map((company) => ({
      company,
      title: "",
    })),
    universities: p.universities || undefined,
    investors: p.investors || undefined,
    amountRaised: p.amount_raised || undefined,
    stages: p.stages || undefined,
    isTechnical: p.is_technical || undefined,
    linkedinUrl: p.linkedin_url || undefined,
    crunchbaseUrl: p.crunchbase_url || undefined,
    profileUrl: p.profile_url || undefined,
    followedByCount: p.followed_by_count || undefined,
    stealthStatus: (p.stealth_status as "in" | "out" | null) || undefined,
    recentBioChange: p.recent_bio_change || undefined,
    totalSignals: p.total_signals || undefined,
  };
}

/**
 * Get signal counts for users within a time window.
 */
async function getSignalCounts(
  userIds: string[],
  days: number
): Promise<Map<string, number>> {
  if (!userIds.length) return new Map();

  const sql = `
    SELECT
      signal_profile_user_id as user_id,
      COUNT(*) as signal_count
    FROM people_tracked_possible_signals_by_day
    WHERE signal_profile_user_id = ANY($1)
      AND date_to >= CURRENT_DATE - make_interval(days => $2)
      AND is_signal = true
    GROUP BY signal_profile_user_id
  `;

  const rows = await query<{ user_id: string; signal_count: string }>(sql, [
    userIds,
    days,
  ]);

  return new Map(rows.map((r) => [r.user_id, parseInt(r.signal_count, 10)]));
}

/**
 * Apply filters from a feed to search for profiles.
 */
function extractFiltersFromFeed(
  feed: { filters: Record<string, unknown> }
): Record<string, unknown> {
  const filters = feed.filters || {};

  return {
    sectors: filters.sectors as string[] | undefined,
    locations: filters.locations as string[] | undefined,
    profile_types: filters.profile_types as string[] | undefined,
    stages: filters.stages as string[] | undefined,
    companies: filters.companies as string[] | undefined,
    universities: filters.universities as string[] | undefined,
    investors: filters.investors as string[] | undefined,
    job_titles: filters.job_titles as string[] | undefined,
    min_funding: filters.min_funding as number | undefined,
    max_funding: filters.max_funding as number | undefined,
    is_technical: filters.is_technical as boolean | undefined,
  };
}

/**
 * Create the get_aggregated_feed_signals tool.
 */
export function createGetAggregatedFeedSignalsTool(
  services: ToolServices,
  context: UserContext
) {
  return tool({
    description: `Get aggregated activity signals across multiple feeds.

Use this tool when:
- User wants to see "what's happening" or "today's highlights" across their feeds
- Looking for trending people across all tracked profiles
- Finding the most active profiles matching any of their feed criteria
- Getting a unified view of network activity

This tool combines results from multiple feeds, deduplicates them, and ranks by the specified metric:
- network_connections: Most followed by user's tracked network
- recent_activity: Most recent activity
- funding: Highest funding amount (for founders)`,

    inputSchema: getAggregatedFeedSignalsSchema,

    execute: async (params) => {
      try {
        // Get user's feeds
        const allFeeds = await getUserFeeds(context.userId);

        // Filter to requested feeds or use all
        const feedsToUse = params.feed_ids
          ? allFeeds.filter((f) => params.feed_ids!.includes(f.id))
          : allFeeds;

        if (feedsToUse.length === 0) {
          return {
            message: "No feeds found to aggregate",
            feeds_checked: params.feed_ids || [],
            results: [],
          };
        }

        // Collect unique user_ids from all feeds
        const allUserIds = new Set<string>();
        const feedSummaries: Array<{ id: number; name: string; count: number }> = [];

        // For each feed, get matching profiles
        for (const feed of feedsToUse) {
          const filters = extractFiltersFromFeed(feed);

          const searchResult = await searchProfiles({
            ...filters,
            limit: 200, // Get more than needed for aggregation
          } as Parameters<typeof searchProfiles>[0]);

          for (const profile of searchResult.results) {
            allUserIds.add(profile.user_id);
          }

          feedSummaries.push({
            id: feed.id,
            name: feed.name,
            count: searchResult.total_count,
          });
        }

        if (allUserIds.size === 0) {
          return {
            message: "No profiles found matching feed criteria",
            feeds_checked: feedSummaries,
            results: [],
          };
        }

        // Get signal counts for ranking
        const signalCounts = await getSignalCounts(
          Array.from(allUserIds),
          params.days
        );

        // Fetch full profiles with appropriate sorting
        let sortBy: "network_connections" | "funding" | "recent_activity" = "recent_activity";
        if (params.ranking === "funding") sortBy = "funding";
        else if (params.ranking === "network_connections") sortBy = "network_connections";
        else if (params.ranking === "recent_activity") sortBy = "recent_activity";

        const searchResult = await searchProfiles({
          user_ids: Array.from(allUserIds),
          sort_by: sortBy,
          limit: params.limit,
        });

        // Enhance results with signal counts
        const profiles: (ProfileResult & { recentSignals?: number })[] =
          searchResult.results.map((p) => ({
            ...profileToResult(p),
            recentSignals: signalCounts.get(p.user_id) || 0,
          }));

        // Re-sort by signal count if ranking by recent activity
        if (params.ranking === "recent_activity") {
          profiles.sort((a, b) => (b.recentSignals || 0) - (a.recentSignals || 0));
        }

        return {
          ranking: params.ranking,
          days: params.days,
          feeds_aggregated: feedSummaries,
          unique_profiles: allUserIds.size,
          results: profiles.slice(0, params.limit),
        };
      } catch (error) {
        console.error("[get_aggregated_feed_signals] Error:", error);
        return {
          error: "Failed to aggregate feed signals",
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}
