import {
  ToolServices,
  SearchPeopleParams,
  SearchPeopleResult,
  GetPersonDetailsParams,
  PersonDetails,
  GetPersonActivityParams,
  PersonActivityResult,
  RelatedPersonResult,
  BioChangeResult,
  ActivityEventResult,
  Feed,
  FeedSignal,
  Group,
  GroupMember,
  AnalyzeNetworkParams,
  AnalyzeNetworkResult,
  ProfileResult,
  FollowedByDetail,
} from "@/lib/ai/tools";
import {
  searchProfiles,
  findProfileByUserId,
  findProfileByScreenName,
  findProfilesByUserIds,
  EnrichedProfile,
} from "@/lib/repositories/mongodb/profiles";
import {
  getUserFeeds,
  getUserGroups,
  getGroupMembers as getGroupMembersDb,
} from "@/lib/repositories/postgres/network";
import {
  getFollowSignals,
  getSignalTimeline,
  getNetworkFollowersForSignals,
} from "@/lib/repositories/postgres/signals";
import {
  getSignalEnrichmentService,
  EnrichedProfileWithSignals,
} from "@/lib/services/signalEnrichment";
import { getTriggerService } from "@/lib/services/triggerService";

/**
 * Create the services object that provides implementations for all tools.
 * This wires up the repositories to the tool service interfaces.
 */
export function createToolServices(): ToolServices {
  return {
    searchPeople,
    getPersonDetails,
    getPersonActivity,
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
    // Signal context (basic - use profileToResultWithSignals for enriched)
    followedByCount: profile.followed_by_count,
    stealthStatus: profile.stealth_status as "in" | "out" | null | undefined,
    recentBioChange: profile.recent_bio_change,
    totalSignals: profile.total_signals,
  };
}

/**
 * Transform EnrichedProfileWithSignals to ProfileResult format with full signal context.
 */
function profileToResultWithSignals(
  profile: EnrichedProfileWithSignals
): ProfileResult {
  const ctx = profile.signalContext;

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
    // Enriched signal context
    followedByCount: ctx.followedByCount,
    followedBy: ctx.followedBy,
    followedByDetails: ctx.followedByDetails.map(
      (f): FollowedByDetail => ({
        userId: f.userId,
        screenName: f.screenName || undefined,
        name: f.name,
        profileUrl: f.profileUrl,
        profileImageUrl: f.profileImageUrl,
      })
    ),
    stealthStatus: ctx.stealthStatus?.type || null,
    recentBioChange: ctx.recentBioChange ? true : false,
    recentBioChangeDate: ctx.recentBioChange?.date,
    totalSignals: ctx.totalSignals,
    signalBreakdown: {
      follows: ctx.signalBreakdown.follows,
      bioChanges: ctx.signalBreakdown.bioChanges,
      stealth: ctx.signalBreakdown.stealth,
      linkedin: ctx.signalBreakdown.linkedin,
    },
    relevanceScore: profile.relevanceScore,
  };
}

/**
 * Search for people with filters and signal context.
 */
async function searchPeople(
  params: SearchPeopleParams,
  userId?: number
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

  // If no userId provided, return basic results
  if (!userId) {
    return {
      results: searchResult.results.map(profileToResult),
      totalCount: searchResult.total_count,
      page: searchResult.page,
      hasMorePages: searchResult.has_more,
      totalPages: Math.ceil(searchResult.total_count / limit),
    };
  }

  // Enrich with signal context
  const enrichmentService = getSignalEnrichmentService();
  const enrichedProfiles = await enrichmentService.enrichProfilesWithSignals(
    searchResult.results,
    userId,
    {
      includeFollowedBy: true,
      includeBioChanges: true,
      includeStealth: true,
      days: 30,
    }
  );

  // Rank by relevance if sorting by relevance
  let rankedProfiles = enrichedProfiles;
  if (sortBy === "relevance") {
    rankedProfiles = await enrichmentService.rankByRelevance(
      enrichedProfiles,
      userId
    );
  }

  // Transform to result format with full signal context
  const results = rankedProfiles.map(profileToResultWithSignals);

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
  params: GetPersonDetailsParams,
  userId?: number
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

  // If no userId provided, return basic details
  if (!userId) {
    return {
      profile: profileToResult(profile),
      signalTimeline: [],
      networkConnections: [],
    };
  }

  // Enrich with signal context
  const enrichmentService = getSignalEnrichmentService();
  const [enrichedProfile] = await enrichmentService.enrichProfilesWithSignals(
    [profile],
    userId,
    {
      includeFollowedBy: true,
      includeBioChanges: true,
      includeStealth: true,
      days: 90,
    }
  );

  // Get signal timeline
  const signalTimeline = params.includeTimeline
    ? await getSignalTimeline(profile.user_id, 90)
    : [];

  // Get network connections (who from user's network follows this person)
  const networkConnectionsMap = params.includeNetworkConnections
    ? await getNetworkFollowersForSignals([profile.user_id], userId)
    : new Map();

  const networkConnections = networkConnectionsMap.get(profile.user_id) || [];

  // Enrich network connections with profile data
  const connectionUserIds = networkConnections.map(
    (c: { userId: string }) => c.userId
  );
  const connectionProfiles =
    connectionUserIds.length > 0
      ? await findProfilesByUserIds(connectionUserIds)
      : [];
  const connectionProfilesMap = new Map(
    connectionProfiles.map((p) => [p.user_id, p])
  );

  return {
    profile: profileToResultWithSignals(enrichedProfile),
    signalTimeline: signalTimeline.map((e) => ({
      eventType: e.eventType,
      actor: e.actor || undefined,
      actorId: e.actorId || undefined,
      eventDate: e.eventDate.toISOString(),
      details: e.details || undefined,
    })),
    networkConnections: networkConnections.map(
      (c: {
        userId: string;
        screenName: string | null;
        followedDate: Date;
      }) => {
        const connProfile = connectionProfilesMap.get(c.userId);
        return {
          userId: c.userId,
          screenName: c.screenName || undefined,
          name: connProfile?.name || c.screenName || "Unknown",
          profileUrl:
            connProfile?.profile_url || `https://twitter.com/${c.screenName}`,
          followedDate: c.followedDate.toISOString(),
        };
      }
    ),
  };
}

/**
 * Get comprehensive activity for a person.
 * Uses TriggerService to fetch Twitter follows, LinkedIn connections, bio changes, etc.
 */
async function getPersonActivity(
  params: GetPersonActivityParams
): Promise<PersonActivityResult | null> {
  // Find the profile first
  let profile: EnrichedProfile | null = null;

  if (params.userId) {
    profile = await findProfileByUserId(params.userId);
  } else if (params.screenName) {
    profile = await findProfileByScreenName(params.screenName);
  }

  if (!profile) {
    return null;
  }

  const triggerService = getTriggerService();
  const activity = await triggerService.getPersonActivity(
    profile.user_id,
    params.requestingUserId,
    {
      days: params.days,
      includeTwitter: params.includeTwitter,
      includeLinkedin: params.includeLinkedin,
      includeBio: params.includeBio,
      includeStealth: params.includeStealth,
      includeFreeAgent: params.includeFreeAgent,
      maxBioChanges: params.maxBioChanges,
    }
  );

  // Transform profile to ProfileResult
  const profileResult = profileToResult(profile);

  // Transform activity data to tool result format
  const twitterFollowers: RelatedPersonResult[] = activity.twitterFollowers.map(
    (p) => ({
      userId: p.userId,
      screenName: p.screenName,
      name: p.name,
      headline: p.headline,
      profileUrl: p.profileUrl,
      profileImageUrl: p.profileImageUrl,
      linkedinUrl: p.linkedinUrl,
      connectionDate: p.connectionDate,
      direction: p.direction,
      source: p.source,
    })
  );

  const twitterFollowing: RelatedPersonResult[] = activity.twitterFollowing.map(
    (p) => ({
      userId: p.userId,
      screenName: p.screenName,
      name: p.name,
      headline: p.headline,
      profileUrl: p.profileUrl,
      profileImageUrl: p.profileImageUrl,
      linkedinUrl: p.linkedinUrl,
      connectionDate: p.connectionDate,
      direction: p.direction,
      source: p.source,
    })
  );

  const linkedinConnections: RelatedPersonResult[] =
    activity.linkedinConnections.map((p) => ({
      userId: p.userId,
      screenName: p.screenName,
      name: p.name,
      headline: p.headline,
      profileUrl: p.profileUrl,
      profileImageUrl: p.profileImageUrl,
      linkedinUrl: p.linkedinUrl,
      connectionDate: p.connectionDate,
      direction: p.direction,
      source: p.source,
    }));

  const bioChanges: BioChangeResult[] = activity.bioChanges.map((c) => ({
    before: c.before,
    after: c.after,
    date: c.date,
  }));

  const activityEvents: ActivityEventResult[] = activity.activity.map((e) => ({
    eventType: e.eventType,
    date: e.date,
    relatedPerson: e.relatedPerson
      ? {
          userId: e.relatedPerson.userId,
          screenName: e.relatedPerson.screenName,
          name: e.relatedPerson.name,
          headline: e.relatedPerson.headline,
          profileUrl: e.relatedPerson.profileUrl,
          profileImageUrl: e.relatedPerson.profileImageUrl,
          direction: e.relatedPerson.direction,
        }
      : undefined,
    bioChange: e.bioChange
      ? {
          before: e.bioChange.before,
          after: e.bioChange.after,
          date: e.bioChange.date,
        }
      : undefined,
    stealthDetails: e.stealthDetails,
    freeAgentDetails: e.freeAgentDetails
      ? {
          previousCompany: e.freeAgentDetails.previousCompany,
          previousTitle: e.freeAgentDetails.previousTitle,
          signalDate: e.freeAgentDetails.signalDate,
        }
      : undefined,
  }));

  return {
    profile: profileResult,
    twitterFollowers,
    twitterFollowing,
    linkedinConnections,
    bioChanges,
    stealthStatus: activity.summary.hasStealth
      ? {
          type: activity.summary.stealthStatus!,
          date: activity.activity.find(
            (e) => e.eventType === "stealth_in" || e.eventType === "stealth_out"
          )?.date || "",
          linkedinUrl: activity.activity.find(
            (e) => e.eventType === "stealth_in" || e.eventType === "stealth_out"
          )?.stealthDetails?.linkedinUrl,
        }
      : null,
    freeAgentDetails: activity.freeAgentDetails
      ? {
          previousCompany: activity.freeAgentDetails.previousCompany,
          previousTitle: activity.freeAgentDetails.previousTitle,
          signalDate: activity.freeAgentDetails.signalDate,
        }
      : null,
    activity: activityEvents,
    summary: {
      twitterFollowersCount: activity.summary.twitterFollowersCount,
      twitterFollowingCount: activity.summary.twitterFollowingCount,
      linkedinConnectionsCount: activity.summary.linkedinConnectionsCount,
      bioChangesCount: activity.summary.bioChangesCount,
      hasStealth: activity.summary.hasStealth,
      stealthStatus: activity.summary.stealthStatus,
      isFreeAgent: activity.summary.isFreeAgent,
      lastActivityDate: activity.summary.lastActivityDate,
    },
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
 * Ranking options for group members.
 */
type GroupMemberRanking =
  | "default"
  | "network_connections"
  | "recent_activity";

/**
 * Get members of a group with enriched signal context.
 */
async function getGroupMembersService(
  groupId: number,
  userId: number,
  options?: { ranking?: GroupMemberRanking; limit?: number }
): Promise<GroupMember[]> {
  const { ranking = "default", limit = 50 } = options || {};

  // Get basic member info from database
  const members = await getGroupMembersDb(groupId, userId);

  if (members.length === 0) {
    return [];
  }

  // Fetch full profiles for members
  const memberUserIds = members.map((m) => String(m.user_id));
  const profiles = await findProfilesByUserIds(memberUserIds);

  if (profiles.length === 0) {
    // Fall back to basic member info if no profiles found
    return members.slice(0, limit).map((m) => ({
      userId: m.user_id,
      screenName: m.screen_name,
      name: m.name,
    }));
  }

  // Enrich with signal context
  const enrichmentService = getSignalEnrichmentService();
  const enrichedProfiles = await enrichmentService.enrichProfilesWithSignals(
    profiles,
    userId,
    {
      includeFollowedBy: true,
      includeBioChanges: true,
      days: 30,
    }
  );

  // Rank by specified method
  let rankedProfiles = enrichedProfiles;

  if (ranking === "network_connections") {
    rankedProfiles = [...enrichedProfiles].sort(
      (a, b) =>
        (b.signalContext?.followedByCount || 0) -
        (a.signalContext?.followedByCount || 0)
    );
  } else if (ranking === "recent_activity") {
    rankedProfiles = [...enrichedProfiles].sort(
      (a, b) =>
        (b.signalContext?.totalSignals || 0) -
        (a.signalContext?.totalSignals || 0)
    );
  } else {
    // Default: relevance ranking
    rankedProfiles = await enrichmentService.rankByRelevance(
      enrichedProfiles,
      userId
    );
  }

  // Transform to GroupMember format with enriched data
  return rankedProfiles.slice(0, limit).map((p) => {
    const ctx = p.signalContext;
    return {
      userId: parseInt(p.user_id, 10) || 0,
      screenName: p.screen_name,
      name: p.name,
      headline: p.headline,
      profileUrl: p.profile_url,
      profileImageUrl: p.profile_image_url,
      // Signal context
      followedByCount: ctx.followedByCount,
      followedBy: ctx.followedBy,
      followedByDetails: ctx.followedByDetails.map((f) => ({
        userId: f.userId,
        screenName: f.screenName || undefined,
        name: f.name,
        profileUrl: f.profileUrl,
        profileImageUrl: f.profileImageUrl,
      })),
      recentBioChange: ctx.recentBioChange ? true : false,
      recentBioChangeDate: ctx.recentBioChange?.date,
      totalSignals: ctx.totalSignals,
      relevanceScore: p.relevanceScore,
    };
  });
}

/**
 * Analyze network patterns.
 */
async function analyzeNetwork(
  params: AnalyzeNetworkParams
): Promise<AnalyzeNetworkResult> {
  const { analysisType, sectors, locations, limit = 50 } = params;

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
