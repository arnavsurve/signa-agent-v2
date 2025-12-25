/**
 * SignalEnrichmentService for merging PostgreSQL signal events with MongoDB profiles.
 *
 * This is the critical service that adds signal context to profile data:
 * - Who from user's network follows this person
 * - Recent bio changes
 * - Stealth mode status
 * - Signal event breakdowns
 */

import {
  getNetworkFollowersForSignals,
  getSignalCountsByType,
  getBioChangesForUsers,
  getStealthStatusForUsers,
  NetworkFollower,
  SignalBreakdown,
} from "@/lib/repositories/postgres/signals";
import {
  getUserLikedSignalIds,
  getUserDislikedSignalIds,
} from "@/lib/repositories/postgres/network";
import {
  EnrichedProfile,
  findProfilesByUserIds,
} from "@/lib/repositories/mongodb/profiles";
import {
  getProfileUrl,
  extractProfileUrlData,
} from "@/lib/utils/profileUrls";

/**
 * Details about a follower from the user's network.
 */
export interface FollowedByDetail {
  userId: string;
  screenName: string | null;
  name: string;
  profileUrl: string;
  profileImageUrl?: string;
  followedDate: Date;
  source: "twitter" | "linkedin";
}

/**
 * Full signal context for a profile.
 */
export interface SignalContext {
  followedBy: string[];
  followedByCount: number;
  followedByDetails: FollowedByDetail[];
  recentBioChange: { date: string } | null;
  stealthStatus: { type: "in" | "out"; date: string; profileUrl?: string } | null;
  signalBreakdown: SignalBreakdown;
  totalSignals: number;
}

/**
 * Profile enriched with signal context.
 */
export interface EnrichedProfileWithSignals extends EnrichedProfile {
  signalContext: SignalContext;
  relevanceScore?: number;
}

/**
 * Options for profile enrichment.
 */
export interface EnrichmentOptions {
  includeFollowedBy?: boolean;
  includeBioChanges?: boolean;
  includeStealth?: boolean;
  days?: number;
}

/**
 * Options for relevance ranking.
 */
export interface RankingOptions {
  boostNetwork?: boolean;
  boostLikedSimilar?: boolean;
}

/**
 * Service for enriching profiles with signal context from PostgreSQL.
 */
export class SignalEnrichmentService {
  /**
   * Enrich MongoDB profiles with PostgreSQL signal context.
   *
   * @param profiles - List of MongoDB profile documents
   * @param userId - User ID for personalized context
   * @param options - Enrichment options
   * @returns Profiles with added signalContext field
   */
  async enrichProfilesWithSignals(
    profiles: EnrichedProfile[],
    userId: number,
    options: EnrichmentOptions = {}
  ): Promise<EnrichedProfileWithSignals[]> {
    const {
      includeFollowedBy = true,
      includeBioChanges = true,
      includeStealth = true,
      days = 30,
    } = options;

    if (!profiles.length) {
      return [];
    }

    // Extract user IDs from profiles
    const userIds = profiles
      .map((p) => p.user_id)
      .filter((id): id is string => !!id);

    if (!userIds.length) {
      return profiles.map((p) => ({
        ...p,
        signalContext: this.createEmptySignalContext(),
      }));
    }

    // Batch fetch all signal data in parallel
    const [
      networkFollowersMap,
      signalCountsMap,
      bioChangesMap,
      stealthStatusMap,
    ] = await Promise.all([
      includeFollowedBy
        ? getNetworkFollowersForSignals(userIds, userId)
        : Promise.resolve(new Map<string, NetworkFollower[]>()),
      getSignalCountsByType(userIds, days),
      includeBioChanges
        ? getBioChangesForUsers(userIds, days)
        : Promise.resolve(new Map()),
      includeStealth
        ? getStealthStatusForUsers(userIds, days)
        : Promise.resolve(new Map()),
    ]);

    // Get all unique follower IDs for profile enrichment
    const allFollowerIds = new Set<string>();
    for (const followers of networkFollowersMap.values()) {
      for (const f of followers) {
        allFollowerIds.add(f.userId);
      }
    }

    // Batch fetch profiles for all followers (for names and profile URLs)
    const followerProfilesMap = new Map<string, EnrichedProfile>();
    if (allFollowerIds.size > 0) {
      const followerProfiles = await findProfilesByUserIds([...allFollowerIds]);
      for (const profile of followerProfiles) {
        followerProfilesMap.set(profile.user_id, profile);
      }
    }

    return profiles.map((profile) => ({
      ...profile,
      signalContext: this.buildSignalContext(profile.user_id, {
        networkFollowersMap,
        signalCountsMap,
        bioChangesMap,
        stealthStatusMap,
        followerProfilesMap,
      }),
    }));
  }

  /**
   * Filter profiles based on user's liked/disliked signals.
   * Removes profiles user has explicitly disliked.
   *
   * @param profiles - List of profiles
   * @param userId - User ID
   * @returns Filtered list of profiles
   */
  async filterByUserPreferences(
    profiles: EnrichedProfileWithSignals[],
    userId: number
  ): Promise<EnrichedProfileWithSignals[]> {
    const dislikedIds = await getUserDislikedSignalIds(userId);

    if (!dislikedIds.size) {
      return profiles;
    }

    return profiles.filter((p) => !dislikedIds.has(p.user_id));
  }

  /**
   * Rank profiles by relevance to user.
   *
   * Scoring:
   * - Network proximity (50%): Followed by user's tracked people
   * - Bio changes (20%): Recent bio updates
   * - Total signals (20%): Overall signal activity
   * - Liked bonus (10%): Previously liked profiles
   *
   * @param profiles - List of enriched profiles
   * @param userId - User ID
   * @param options - Ranking options
   * @returns Profiles sorted by relevance score (highest first)
   */
  async rankByRelevance(
    profiles: EnrichedProfileWithSignals[],
    userId: number,
    options: RankingOptions = {}
  ): Promise<EnrichedProfileWithSignals[]> {
    const { boostNetwork = true, boostLikedSimilar = true } = options;

    if (!profiles.length) {
      return [];
    }

    // Get user's liked signals for potential similarity comparison
    const likedIds = boostLikedSimilar
      ? await getUserLikedSignalIds(userId)
      : new Set<string>();

    // Calculate scores
    const scoredProfiles = profiles.map((profile) => {
      let score = 0;
      const ctx = profile.signalContext;

      // Network proximity (50 points max)
      if (boostNetwork) {
        if (ctx.followedByCount >= 5) {
          score += 50;
        } else if (ctx.followedByCount >= 3) {
          score += 35;
        } else if (ctx.followedByCount >= 1) {
          score += 20;
        }
      }

      // Recent bio change adds 20 points
      if (ctx.recentBioChange) {
        score += 20;
      }

      // Total signals contributes up to 20 points
      score += Math.min(ctx.totalSignals * 2, 20);

      // Preference match bonus (if similar to liked profiles)
      if (boostLikedSimilar && likedIds.has(profile.user_id)) {
        score += 10; // Boost for previously liked
      }

      return {
        ...profile,
        relevanceScore: score,
      };
    });

    // Sort by score (highest first)
    scoredProfiles.sort(
      (a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0)
    );

    return scoredProfiles;
  }

  private buildSignalContext(
    userId: string,
    data: {
      networkFollowersMap: Map<string, NetworkFollower[]>;
      signalCountsMap: Map<string, SignalBreakdown>;
      bioChangesMap: Map<string, { userId: string; changeDate: Date }>;
      stealthStatusMap: Map<
        string,
        { userId: string; type: "in" | "out"; date: Date; profileUrl: string | null }
      >;
      followerProfilesMap: Map<string, EnrichedProfile>;
    }
  ): SignalContext {
    const {
      networkFollowersMap,
      signalCountsMap,
      bioChangesMap,
      stealthStatusMap,
      followerProfilesMap,
    } = data;

    const followers = networkFollowersMap.get(userId) || [];
    const followedBy = followers
      .map((f) => f.screenName)
      .filter((s): s is string => !!s);

    const followedByDetails: FollowedByDetail[] = followers.map((follower) => {
      const followerProfile = followerProfilesMap.get(follower.userId);
      if (followerProfile) {
        return {
          userId: follower.userId,
          screenName: follower.screenName,
          name: followerProfile.name || follower.screenName || "Unknown",
          profileUrl: getProfileUrl(extractProfileUrlData({
            user_id: followerProfile.user_id,
            linkedin_url: followerProfile.linkedin_url,
            screen_name: followerProfile.screen_name,
          })),
          profileImageUrl: followerProfile.profile_image_url,
          followedDate: follower.followedDate,
          source: follower.source,
        };
      }
      return {
        userId: follower.userId,
        screenName: follower.screenName,
        name: follower.screenName || "Unknown",
        profileUrl: follower.screenName
          ? `https://twitter.com/${follower.screenName}`
          : `https://app.signa.software/search?user_id=${follower.userId}`,
        followedDate: follower.followedDate,
        source: follower.source,
      };
    });

    const bioChange = bioChangesMap.get(userId);
    const recentBioChange = bioChange
      ? { date: bioChange.changeDate.toISOString() }
      : null;

    const stealth = stealthStatusMap.get(userId);
    const stealthStatus = stealth
      ? {
          type: stealth.type,
          date: stealth.date.toISOString(),
          profileUrl: stealth.profileUrl || undefined,
        }
      : null;

    const signalBreakdown = signalCountsMap.get(userId) || {
      follows: 0,
      bioChanges: 0,
      stealth: 0,
      linkedin: 0,
    };

    const totalSignals =
      signalBreakdown.follows +
      signalBreakdown.bioChanges +
      signalBreakdown.stealth;

    return {
      followedBy,
      followedByCount: followers.length,
      followedByDetails,
      recentBioChange,
      stealthStatus,
      signalBreakdown,
      totalSignals,
    };
  }

  /**
   * Create an empty signal context for profiles without data.
   */
  private createEmptySignalContext(): SignalContext {
    return {
      followedBy: [],
      followedByCount: 0,
      followedByDetails: [],
      recentBioChange: null,
      stealthStatus: null,
      signalBreakdown: {
        follows: 0,
        bioChanges: 0,
        stealth: 0,
        linkedin: 0,
      },
      totalSignals: 0,
    };
  }
}

let signalEnrichmentServiceInstance: SignalEnrichmentService | null = null;

export function getSignalEnrichmentService(): SignalEnrichmentService {
  if (!signalEnrichmentServiceInstance) {
    signalEnrichmentServiceInstance = new SignalEnrichmentService();
  }
  return signalEnrichmentServiceInstance;
}
