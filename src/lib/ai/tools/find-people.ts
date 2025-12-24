import { tool } from "ai";
import { z } from "zod";
import { ToolServices, UserContext } from "./index";

/**
 * Zod schema for find_people tool parameters.
 */
const findPeopleSchema = z.object({
  query: z
    .string()
    .optional()
    .describe("Free-text search query to match against names, bios, headlines"),
  locations: z
    .array(z.string())
    .optional()
    .describe("Filter by professional locations (e.g., ['San Francisco', 'New York'])"),
  sectors: z
    .array(z.string())
    .optional()
    .describe("Filter by industry sectors (e.g., ['AI/ML', 'Fintech', 'Healthcare'])"),
  profile_types: z
    .array(z.string())
    .optional()
    .describe("Filter by profile type: 'Founder', 'Investor', 'Operator', etc."),
  stages: z
    .array(z.string())
    .optional()
    .describe("Filter by funding stage: 'Pre-seed', 'Seed', 'Series A', etc."),
  companies: z
    .array(z.string())
    .optional()
    .describe("Filter by current or past company affiliation"),
  universities: z
    .array(z.string())
    .optional()
    .describe("Filter by university/education"),
  investors: z
    .array(z.string())
    .optional()
    .describe("Filter by investor names backing the profile"),
  job_titles: z
    .array(z.string())
    .optional()
    .describe("Filter by job titles (e.g., ['CEO', 'CTO', 'Founder'])"),
  min_funding: z
    .number()
    .optional()
    .describe("Minimum funding amount in dollars"),
  max_funding: z
    .number()
    .optional()
    .describe("Maximum funding amount in dollars"),
  in_my_network: z
    .boolean()
    .default(false)
    .describe(
      "If true, only search within user's tracked network. Default: false (global search)"
    ),
  recent_bio_change: z
    .boolean()
    .default(false)
    .describe("If true, filter to profiles with recent bio changes"),
  stealth_status: z
    .enum(["in", "out"])
    .optional()
    .describe("Filter by LinkedIn stealth status: 'in' or 'out'"),
  min_network_connections: z
    .number()
    .default(0)
    .describe("Minimum number of network connections (followed_by_count)"),
  recent_activity_days: z
    .number()
    .optional()
    .describe("Only show profiles with signals within this many days"),
  signal_days: z
    .number()
    .default(30)
    .describe("Time window for signal calculations"),
  min_bio_change_count: z
    .number()
    .default(0)
    .describe("Minimum number of bio changes in the signal window"),
  sort_by: z
    .enum(["relevance", "network_connections", "funding", "recent_activity"])
    .default("relevance")
    .describe("Sort order for results"),
  limit: z
    .number()
    .default(50)
    .describe("Maximum results per page"),
  page: z
    .number()
    .default(1)
    .describe("Page number for pagination"),
});

/**
 * Create the find_people tool.
 */
export function createFindPeopleTool(services: ToolServices, context: UserContext) {
  return tool({
    description: `PRIMARY SEARCH: Find profiles with signal context (network followers, trending scores).

DEFAULT: Searches the ENTIRE global network.
ONLY set in_my_network=True if user wants to scope to THEIR network (e.g., "in my network", "people I track", "my connections").

Signal filters use OR logic for audience filters (in_my_network, recent_bio_change, stealth_status) and
AND logic for thresholds (min_network_connections, min_bio_change_count, recent_activity_days).
Professional filters AND together (sectors + locations = must match both).

Use cases:
- Stealth entries: set stealth_status="in" (or "out")
- Bio changes: recent_bio_change=True and/or min_bio_change_count>0
- Tracked updates: provide recent_activity_days (requires user_id)
- Classic search: combine sectors, locations, companies, profile_types (['Founder', 'Investor'])

Sort options: "relevance" (default), "network_connections", "funding", "recent_activity".

PAGINATION: Use page parameter to fetch additional results. Default limit=50 per page.
When total_count > limit, call again with page=2, page=3, etc. to get all results.

Returns: Complete enriched profiles including:
- Basic: name, screen_name, description, profile_image_url, followers_count, location
- Professional: profile_type, headline, sectors, locations, job_titles, work_experience, universities
- Funding: amount_raised, stages, investors, is_technical
- Links: linkedin_url, crunchbase_url
- Signal context: followed_by (list of @handles), followed_by_count, recent_bio_change, stealth_status, total_signals`,

    inputSchema: findPeopleSchema,

    execute: async (params) => {
      try {
        const result = await services.searchPeople({
          query: params.query,
          locations: params.locations,
          sectors: params.sectors,
          profileTypes: params.profile_types,
          stages: params.stages,
          companies: params.companies,
          universities: params.universities,
          investors: params.investors,
          jobTitles: params.job_titles,
          minFunding: params.min_funding,
          maxFunding: params.max_funding,
          inMyNetwork: params.in_my_network,
          recentBioChange: params.recent_bio_change,
          stealthStatus: params.stealth_status,
          minNetworkConnections: params.min_network_connections,
          recentActivityDays: params.recent_activity_days,
          signalDays: params.signal_days,
          minBioChangeCount: params.min_bio_change_count,
          sortBy: params.sort_by,
          limit: params.limit,
          page: params.page,
          userId: context.userId,
        });

        return {
          total_count: result.totalCount,
          original_count: result.originalCount,
          page: result.page,
          has_more_pages: result.hasMorePages,
          total_pages: result.totalPages,
          results: result.results,
        };
      } catch (error) {
        console.error("[find_people] Error:", error);
        return {
          error: "Search failed",
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}
