import { tool } from "ai";
import { z } from "zod";
import { ToolServices, UserContext, ProfileResult } from "./index";
import {
  getFollowedBy,
  getFollowers,
  getMutualFollows,
  getCommonFollows,
} from "@/lib/repositories/postgres/relationships";
import {
  findProfileByUserId,
  findProfileByScreenName,
  searchProfiles,
} from "@/lib/repositories/mongodb/profiles";

/**
 * Zod schema for get_relationship_network tool parameters.
 */
const getRelationshipNetworkSchema = z.object({
  person: z
    .string()
    .describe("Screen name or name of the person to analyze (e.g., 'elonmusk' or 'Elon Musk')"),
  relationship: z
    .enum(["followed_by", "followers", "mutual", "common_with"])
    .describe(
      "Type of relationship: followed_by (who they follow), followers (who follows them), mutual (bidirectional), common_with (common follows with another person)"
    ),
  other_person: z
    .string()
    .optional()
    .describe("Required for 'common_with' relationship - the other person to compare against"),
  sectors: z
    .array(z.string())
    .optional()
    .describe("Filter by sectors (e.g., ['AI/ML', 'Fintech'])"),
  locations: z
    .array(z.string())
    .optional()
    .describe("Filter by locations (e.g., ['San Francisco', 'New York'])"),
  days: z
    .number()
    .default(90)
    .describe("Number of days of history to include"),
  limit: z
    .number()
    .default(50)
    .describe("Maximum results"),
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
 * Resolve a person identifier to user_id.
 */
async function resolvePersonToUserId(person: string): Promise<string | null> {
  // First try as screen name
  const profile = await findProfileByScreenName(person);
  if (profile) {
    return profile.user_id;
  }

  // Try as numeric user ID
  const numericId = parseInt(person, 10);
  if (!isNaN(numericId)) {
    const profileById = await findProfileByUserId(numericId);
    if (profileById) {
      return profileById.user_id;
    }
  }

  // Try searching by name
  const searchResult = await searchProfiles({ query: person, limit: 1 });
  if (searchResult.results.length > 0) {
    return searchResult.results[0].user_id;
  }

  return null;
}

/**
 * Create the get_relationship_network tool.
 */
export function createGetRelationshipNetworkTool(
  services: ToolServices,
  context: UserContext
) {
  return tool({
    description: `Explore network relationships and connections.

Use this tool when:
- User asks who follows someone (e.g., "Who follows Elon Musk?")
- User asks who someone follows (e.g., "Who does @sama follow?")
- Looking for mutual connections (e.g., "Who has mutual follows with this founder?")
- Finding common connections between two people (e.g., "Who do both @elonmusk and @sama follow?")

Relationship types:
- followed_by: People this person follows (outgoing connections)
- followers: People who follow this person (incoming connections)
- mutual: Bidirectional follow relationships
- common_with: People followed by BOTH the person and another person (requires other_person)

Results can be filtered by sectors and locations to find relevant connections.`,

    inputSchema: getRelationshipNetworkSchema,

    execute: async (params) => {
      try {
        // Validate common_with requires other_person
        if (params.relationship === "common_with" && !params.other_person) {
          return {
            error: "other_person parameter is required for common_with relationship",
          };
        }

        // Resolve person to user_id
        const userId = await resolvePersonToUserId(params.person);
        if (!userId) {
          return {
            error: `Could not find person: ${params.person}`,
            suggestion: "Try using their Twitter screen name or search for them first",
          };
        }

        let relationshipUserIds: string[] = [];
        let relationshipDetails: Record<string, unknown> = {};

        // Get relationship data from PostgreSQL
        switch (params.relationship) {
          case "followed_by": {
            const edges = await getFollowedBy(userId, params.days, params.limit);
            relationshipUserIds = edges.map((e) => e.user_id);
            relationshipDetails = {
              type: "followed_by",
              count: edges.length,
            };
            break;
          }
          case "followers": {
            const edges = await getFollowers(userId, params.days, params.limit);
            relationshipUserIds = edges.map((e) => e.user_id);
            relationshipDetails = {
              type: "followers",
              count: edges.length,
            };
            break;
          }
          case "mutual": {
            const mutuals = await getMutualFollows(userId, params.days, params.limit);
            relationshipUserIds = mutuals.map((m) => m.mutual_user_id);
            relationshipDetails = {
              type: "mutual",
              count: mutuals.length,
            };
            break;
          }
          case "common_with": {
            const otherUserId = await resolvePersonToUserId(params.other_person!);
            if (!otherUserId) {
              return {
                error: `Could not find other person: ${params.other_person}`,
              };
            }
            const commons = await getCommonFollows(
              userId,
              otherUserId,
              params.days,
              params.limit
            );
            relationshipUserIds = commons.map((c) => c.common_follow_user_id);
            relationshipDetails = {
              type: "common_with",
              other_person: params.other_person,
              count: commons.length,
            };
            break;
          }
        }

        if (relationshipUserIds.length === 0) {
          return {
            person: params.person,
            relationship: params.relationship,
            message: `No ${params.relationship} relationships found`,
            results: [],
          };
        }

        // Fetch full profiles from MongoDB with optional filters
        const searchResult = await searchProfiles({
          user_ids: relationshipUserIds,
          sectors: params.sectors,
          locations: params.locations,
          limit: params.limit,
        });

        const profiles: ProfileResult[] = searchResult.results.map(profileToResult);

        return {
          person: params.person,
          relationship: params.relationship,
          ...relationshipDetails,
          total_count: searchResult.total_count,
          filtered_count: profiles.length,
          filters_applied: {
            sectors: params.sectors,
            locations: params.locations,
          },
          results: profiles,
        };
      } catch (error) {
        console.error("[get_relationship_network] Error:", error);
        return {
          error: "Failed to get relationship network",
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}
