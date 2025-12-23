import { tool } from "ai";
import { z } from "zod";
import { ToolServices, UserContext, ProfileResult } from "./index";
import { findProfilesByCompany } from "@/lib/repositories/mongodb/profiles";

/**
 * Zod schema for find_by_company tool parameters.
 */
const findByCompanySchema = z.object({
  company: z
    .string()
    .describe("Company name to search for (e.g., 'Stripe', 'Google', 'YC')"),
  current_only: z
    .boolean()
    .default(true)
    .describe("If true, only show current employees. If false, include alumni."),
  roles: z
    .array(z.string())
    .optional()
    .describe("Filter by job titles/roles (e.g., ['CEO', 'CTO', 'Engineer'])"),
  sectors: z
    .array(z.string())
    .optional()
    .describe("Filter by sectors they work in (e.g., ['AI/ML', 'Fintech'])"),
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
 * Create the find_by_company tool.
 */
export function createFindByCompanyTool(
  services: ToolServices,
  context: UserContext
) {
  return tool({
    description: `Find people by company affiliation (current or alumni).

Use this tool when:
- User asks about people at a specific company (e.g., "Who's at Stripe?")
- Looking for talent from specific companies (e.g., "Engineers from Google")
- Finding alumni networks (e.g., "Former YC founders")
- Researching company-specific expertise

Set current_only=false to include people who previously worked at the company.

Returns profiles sorted by funding amount (for founders) or relevance.`,

    inputSchema: findByCompanySchema,

    execute: async (params) => {
      try {
        const result = await findProfilesByCompany({
          company: params.company,
          current_only: params.current_only,
          roles: params.roles,
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
          trendingScore: p.trending_score,
          followedByCount: p.followed_by_count,
          stealthStatus: p.stealth_status as "in" | "out" | null | undefined,
          recentBioChange: p.recent_bio_change,
          totalSignals: p.total_signals,
        }));

        return {
          company: params.company,
          current_only: params.current_only,
          total_count: result.total_count,
          page: result.page,
          has_more_pages: result.has_more,
          results: profiles,
        };
      } catch (error) {
        console.error("[find_by_company] Error:", error);
        return {
          error: "Search failed",
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}
