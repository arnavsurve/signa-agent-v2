import {
  ToolServices,
  SearchPeopleParams,
  SearchPeopleResult,
  GetPersonDetailsParams,
  PersonDetails,
  Feed,
  FeedSignal,
  Group,
  GroupMember,
  AnalyzeNetworkParams,
  AnalyzeNetworkResult,
  ProfileResult,
} from "@/lib/ai/tools";
import {
  searchProfiles,
  findProfileByUserId,
  findProfileByScreenName,
  EnrichedProfile,
} from "@/lib/repositories/mongodb/profiles";
import {
  getUserFeeds,
  getUserGroups,
  getGroupMembers as getGroupMembersDb,
} from "@/lib/repositories/postgres/network";
import {
  getFollowSignals,
  getBioChangeSignals,
  getTrendingPeople,
} from "@/lib/repositories/postgres/signals";

/**
 * Create the services object that provides implementations for all tools.
 * This wires up the repositories to the tool service interfaces.
 */
export function createToolServices(): ToolServices {
  return {
    searchPeople,
    getPersonDetails,
    getUserFeeds: getUserFeedsService,
    getFeedSignals: getFeedSignalsService,
    getUserGroups: getUserGroupsService,
    getGroupMembers: getGroupMembersService,
    analyzeNetwork,
  };
}

/**
 * Transform EnrichedProfile to ProfileResult format expected by tools.
 */
function profileToResult(profile: EnrichedProfile): ProfileResult {
  return {
    userId: parseInt(profile.user_id, 10) || 0,
    screenName: profile.screen_name,
    name: profile.name,
    description: profile.description,
    profileImageUrl: profile.profile_image_url,
    followersCount: profile.followers_count,
    location: profile.location,
    profileType: profile.profile_type,
    headline: profile.headline,
    sectors: profile.sectors,
    locations: profile.locations,
    jobTitles: profile.job_titles,
    workExperience: profile.work_experience?.map((company) => ({
      company,
      title: "",
    })),
    universities: profile.universities,
    investors: profile.investors,
    amountRaised: profile.amount_raised,
    stages: profile.stages,
    isTechnical: profile.is_technical,
    linkedinUrl: profile.linkedin_url,
    crunchbaseUrl: profile.crunchbase_url,
    profileUrl: profile.profile_url,
    // Signal context
    trendingScore: profile.trending_score,
    followedByCount: profile.followed_by_count,
    stealthStatus: profile.stealth_status as "in" | "out" | null | undefined,
    recentBioChange: profile.recent_bio_change,
    totalSignals: profile.total_signals,
  };
}

/**
 * Search for people with filters and signal context.
 */
async function searchPeople(
  params: SearchPeopleParams
): Promise<SearchPeopleResult> {
  const {
    query,
    sectors,
    locations,
    profileTypes,
    stages,
    companies,
    universities,
    investors,
    jobTitles,
    minFunding,
    maxFunding,
    sortBy,
    limit = 50,
    page = 1,
  } = params;

  // Search using MongoDB with full filtering
  const searchResult = await searchProfiles({
    query,
    sectors,
    locations,
    profile_types: profileTypes,
    stages,
    companies,
    universities,
    investors,
    job_titles: jobTitles,
    min_funding: minFunding,
    max_funding: maxFunding,
    sort_by: sortBy,
    limit,
    page,
  });

  // Transform to result format
  const results = searchResult.results.map(profileToResult);

  return {
    results,
    totalCount: searchResult.total_count,
    page: searchResult.page,
    hasMorePages: searchResult.has_more,
    totalPages: Math.ceil(searchResult.total_count / limit),
  };
}

/**
 * Get detailed information for a single person.
 */
async function getPersonDetails(
  params: GetPersonDetailsParams
): Promise<PersonDetails | null> {
  let profile: EnrichedProfile | null = null;

  if (params.userId) {
    profile = await findProfileByUserId(params.userId);
  } else if (params.screenName) {
    profile = await findProfileByScreenName(params.screenName);
  }

  if (!profile) {
    return null;
  }

  return {
    profile: profileToResult(profile),
    signalTimeline: [], // TODO: Fetch from signals table
    networkConnections: [], // TODO: Fetch from relationships
  };
}

/**
 * Get user's feeds.
 */
async function getUserFeedsService(userId: number): Promise<Feed[]> {
  const feeds = await getUserFeeds(userId);
  return feeds.map((f) => ({
    id: f.id,
    name: f.name,
    filters: f.filters,
    createdAt: f.created_at,
  }));
}

/**
 * Get signals from a feed.
 */
async function getFeedSignalsService(
  feedId: number,
  userId: number,
  limit: number = 50
): Promise<FeedSignal[]> {
  // Simplified - would need to apply feed filters
  const signals = await getFollowSignals({ days: 30, limit });
  return signals.map((s) => ({
    userId: s.user_id,
    screenName: s.screen_name,
    name: s.name,
    signalType: s.signal_type,
    signalDate: s.signal_date.toISOString(),
    details: s.details,
  }));
}

/**
 * Get user's groups.
 */
async function getUserGroupsService(userId: number): Promise<Group[]> {
  const groups = await getUserGroups(userId);
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description || undefined,
    createdAt: g.created_at,
  }));
}

/**
 * Get members of a group.
 */
async function getGroupMembersService(
  groupId: number,
  userId: number
): Promise<GroupMember[]> {
  const members = await getGroupMembersDb(groupId, userId);
  return members.map((m) => ({
    userId: m.user_id,
    screenName: m.screen_name,
    name: m.name,
  }));
}

/**
 * Analyze network patterns.
 */
async function analyzeNetwork(
  params: AnalyzeNetworkParams
): Promise<AnalyzeNetworkResult> {
  const { analysisType, sectors, locations, days = 7, limit = 50 } = params;

  if (analysisType === "trending") {
    // Get trending people based on signal velocity
    const trending = await getTrendingPeople({ days, limit: limit * 2 });

    if (trending.length === 0) {
      return {
        analysisType,
        profiles: [],
        insights: [`No trending profiles found in the last ${days} days`],
      };
    }

    // Fetch full profiles from MongoDB with optional filters
    const userIds = trending.map((t) => t.user_id.toString());
    const searchResult = await searchProfiles({
      user_ids: userIds,
      sectors,
      locations,
      sort_by: "trending",
      limit,
    });

    // Merge trending scores with profiles
    const trendingMap = new Map(
      trending.map((t) => [t.user_id.toString(), t.trending_score])
    );

    const profiles = searchResult.results.map((p) => ({
      ...profileToResult(p),
      trendingScore: trendingMap.get(p.user_id) || p.trending_score,
    }));

    // Sort by trending score
    profiles.sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0));

    return {
      analysisType,
      profiles: profiles.slice(0, limit),
      insights: [
        `Found ${profiles.length} trending profiles in the last ${days} days`,
        profiles.length > 0
          ? `Top trending: ${profiles[0].name || profiles[0].screenName} with score ${profiles[0].trendingScore}`
          : "",
      ].filter(Boolean),
      metrics: {
        totalTrending: trending.length,
        averageScore:
          profiles.reduce((sum, p) => sum + (p.trendingScore || 0), 0) /
          Math.max(profiles.length, 1),
      },
    };
  }

  if (analysisType === "influencers") {
    // Find high-connection nodes (most followed_by_count)
    const searchResult = await searchProfiles({
      sectors,
      locations,
      sort_by: "network_connections",
      limit,
    });

    const profiles = searchResult.results.map(profileToResult);

    // Calculate metrics
    const totalConnections = profiles.reduce(
      (sum, p) => sum + (p.followedByCount || 0),
      0
    );
    const avgConnections = totalConnections / Math.max(profiles.length, 1);

    return {
      analysisType,
      profiles,
      insights: [
        `Found ${profiles.length} influencers based on network connections`,
        profiles.length > 0
          ? `Most connected: ${profiles[0].name || profiles[0].screenName} with ${profiles[0].followedByCount || 0} network followers`
          : "",
        `Average network connections: ${Math.round(avgConnections)}`,
      ].filter(Boolean),
      metrics: {
        totalInfluencers: profiles.length,
        totalConnections,
        averageConnections: Math.round(avgConnections),
      },
    };
  }

  if (analysisType === "clusters") {
    // Find clusters based on shared sectors/locations/investors
    // Group profiles by their primary sector
    const searchResult = await searchProfiles({
      sectors,
      locations,
      limit: limit * 2,
    });

    const profiles = searchResult.results.map(profileToResult);

    // Group by primary sector
    const sectorClusters: Record<string, ProfileResult[]> = {};
    for (const profile of profiles) {
      const primarySector = profile.sectors?.[0] || "Other";
      if (!sectorClusters[primarySector]) {
        sectorClusters[primarySector] = [];
      }
      sectorClusters[primarySector].push(profile);
    }

    // Sort clusters by size and take top profiles from each
    const sortedClusters = Object.entries(sectorClusters)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5);

    // Take top profiles from each cluster
    const clusteredProfiles: ProfileResult[] = [];
    for (const [, clusterProfiles] of sortedClusters) {
      clusteredProfiles.push(...clusterProfiles.slice(0, Math.ceil(limit / 5)));
    }

    return {
      analysisType,
      profiles: clusteredProfiles.slice(0, limit),
      insights: [
        `Identified ${sortedClusters.length} sector clusters`,
        ...sortedClusters
          .slice(0, 3)
          .map(
            ([sector, profs]) =>
              `${sector}: ${profs.length} profiles (e.g., ${profs[0]?.name || profs[0]?.screenName})`
          ),
      ],
      metrics: {
        totalClusters: sortedClusters.length,
        largestCluster: sortedClusters[0]?.[1]?.length || 0,
        largestClusterName: sortedClusters[0]?.[0] || "None",
      },
    };
  }

  // Unknown analysis type
  return {
    analysisType,
    profiles: [],
    insights: [`Unknown analysis type: '${analysisType}'`],
  };
}
