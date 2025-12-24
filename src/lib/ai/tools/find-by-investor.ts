import { tool } from "ai";
import { z } from "zod";
import { ToolServices, UserContext, ProfileResult } from "./index";
import { findProfilesByInvestor } from "@/lib/repositories/mongodb/profiles";

/**
 * Zod schema for find_by_investor tool parameters.
 */
const findByInvestorSchema = z.object({
  investor: z
    .string()
    .describe("Investor or VC firm name (e.g., 'a16z', 'Sequoia', 'Y Combinator')"),
  stages: z
    .array(z.string())
    .optional()
    .describe("Filter by funding stages (e.g., ['Seed', 'Series A'])"),
  sectors: z
    .array(z.string())
    .optional()
    .describe("Filter by sectors (e.g., ['AI/ML', 'Healthcare'])"),
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
 * Create the find_by_investor tool.
 */
export function createFindByInvestorTool(
  services: ToolServices,
  context: UserContext
) {
  return tool({
    description: `Find founders backed by a specific investor or VC firm.

Use this tool when:
- User asks about portfolio companies (e.g., "Who's backed by a16z?")
- Looking for founders with specific investors (e.g., "Sequoia-backed AI companies")
- Researching investor networks (e.g., "YC founders in fintech")
- Finding patterns in investor portfolios

Returns founders sorted by funding amount (highest first).

Common investor names:
- VC firms: a16z, Sequoia, Kleiner Perkins, Accel, Benchmark, Index
- Accelerators: Y Combinator, Techstars, 500 Startups
- Angel investors: Use full names (e.g., "Naval Ravikant")`,

    inputSchema: findByInvestorSchema,

    execute: async (params) => {
      try {
        const result = await findProfilesByInvestor({
          investor: params.investor,
          stages: params.stages,
          sectors: params.sectors,
          limit: params.limit,
          page: params.page,
        });

        // Transform to ProfileResult format
        const profiles: ProfileResult[] = result.results.map((p) => ({
          userId: parseInt(p.user_id, 10) || 0,
          screenName: p.screen_name,
          name: p.name,
          description: p.description,
          profileImageUrl: p.profile_image_url,
          followersCount: p.followers_count,
          location: p.location,
          profileType: p.profile_type,
          headline: p.headline,
          sectors: p.sectors,
          locations: p.locations,
          jobTitles: p.job_titles,
          workExperience: p.work_experience?.map((company) => ({
            company,
            title: "",
          })),
          universities: p.universities,
          investors: p.investors,
          amountRaised: p.amount_raised,
          stages: p.stages,
          isTechnical: p.is_technical,
          linkedinUrl: p.linkedin_url,
          crunchbaseUrl: p.crunchbase_url,
          profileUrl: p.profile_url,
          followedByCount: p.followed_by_count,
          stealthStatus: p.stealth_status as "in" | "out" | null | undefined,
          recentBioChange: p.recent_bio_change,
          totalSignals: p.total_signals,
        }));

        return {
          investor: params.investor,
          total_count: result.total_count,
          page: result.page,
          has_more_pages: result.has_more,
          results: profiles,
        };
      } catch (error) {
        console.error("[find_by_investor] Error:", error);
        return {
          error: "Search failed",
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}
