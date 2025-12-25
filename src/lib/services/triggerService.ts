/**
 * Trigger Orchestration Service
 *
 * Coordinates execution of multiple trigger queries and aggregates results.
 * Provides high-level methods for getting person activity and feed activity.
 */

import {
  TriggerFilters,
  TriggerQueryResult,
  MergedTriggerResult,
  PersonActivity,
  ActivityEvent,
  ActivitySummary,
  RelatedPerson,
  BioChange,
  FreeAgentDetails,
  TriggerType,
  ConnectionIdentifier,
} from "@/lib/types/triggers";
import {
  queryBioChangedTrigger,
  queryStealthTrigger,
  queryFreeAgentsTrigger,
  queryLinkedInConnectionsTrigger,
  queryFollowedByGroupsTrigger,
  queryTwitterFollowsByPerson,
  queryTwitterFollowersOfPerson,
  queryLinkedInConnectionsOfPerson,
  mergeAndSortTriggerResults,
} from "@/lib/repositories/postgres/triggers";
import {
  getBioChangesForUsers,
  getStealthStatusForUsers,
} from "@/lib/repositories/postgres/signals";
import {
  findProfilesByUserIds,
  findProfileByUserId,
  EnrichedProfile,
} from "@/lib/repositories/mongodb/profiles";
import { SPECIAL_GROUP_IDS, DEFAULT_ACTIVITY_DAYS } from "@/lib/constants";
import { getProfileUrl, extractProfileUrlData } from "@/lib/utils/profileUrls";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get date string for N days ago.
 */
function getDateNDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
}

/**
 * Convert EnrichedProfile to RelatedPerson.
 */
function profileToRelatedPerson(
  profile: EnrichedProfile,
  connectionDate: string,
  direction: "outgoing" | "incoming",
  source: "twitter" | "linkedin"
): RelatedPerson {
  return {
    userId: profile.user_id,
    screenName: profile.screen_name,
    name: profile.name,
    headline: profile.headline,
    // Always use Signa app URL for profiles (they're all complete)
    profileUrl: profile.user_id
      ? `https://app.signa.software/search?user_id=${profile.user_id}`
      : getProfileUrl(
          extractProfileUrlData({
            user_id: profile.user_id,
            linkedin_url: profile.linkedin_url,
            screen_name: profile.screen_name,
          })
        ),
    profileImageUrl: profile.profile_image_url,
    linkedinUrl: profile.linkedin_url,
    connectionDate,
    direction,
    source,
  };
}

// =============================================================================
// Trigger Service Class
// =============================================================================

export class TriggerService {
  /**
   * Expand allTriggers flag into individual trigger flags.
   */
  private expandAllTriggersIfNeeded(filters: TriggerFilters): TriggerFilters {
    if (!filters.allTriggers) {
      return filters;
    }

    return {
      ...filters,
      twitterFollow: true,
      linkedinConnection: true,
      bioChange: true,
      stealth: ["in", "out"],
      freeAgent: true,
      groupIds: filters.groupIds || [SPECIAL_GROUP_IDS.ALL_TRACKED],
      allTriggers: undefined,
    };
  }

  /**
   * Process all active triggers in parallel and merge results.
   */
  async processAllTriggers(
    filters: TriggerFilters,
    userId: number
  ): Promise<MergedTriggerResult> {
    const expanded = this.expandAllTriggersIfNeeded(filters);

    // Calculate date range
    const days = expanded.days || DEFAULT_ACTIVITY_DAYS;
    const dateFrom = expanded.dateFrom || getDateNDaysAgo(days);
    const dateTo = expanded.dateTo;

    // Build array of trigger query promises
    const triggerPromises: Promise<TriggerQueryResult>[] = [];

    if (expanded.bioChange) {
      triggerPromises.push(queryBioChangedTrigger(dateFrom, dateTo));
    }

    if (expanded.stealth && expanded.stealth.length > 0) {
      triggerPromises.push(queryStealthTrigger(expanded.stealth, dateFrom, dateTo));
    }

    if (expanded.freeAgent) {
      triggerPromises.push(queryFreeAgentsTrigger(dateFrom, dateTo));
    }

    if (expanded.linkedinConnection) {
      triggerPromises.push(
        queryLinkedInConnectionsTrigger(
          userId,
          expanded.linkedinGroupIds || expanded.groupIds,
          dateFrom,
          dateTo
        )
      );
    }

    if (
      expanded.twitterFollow &&
      expanded.groupIds &&
      expanded.groupIds.length > 0
    ) {
      triggerPromises.push(
        queryFollowedByGroupsTrigger(userId, expanded.groupIds, dateFrom, dateTo)
      );
    }

    // Execute all trigger queries in parallel
    if (triggerPromises.length === 0) {
      return {
        entries: [],
        datesByUserId: new Map(),
        triggersByUserId: new Map(),
      };
    }

    const triggerResults = await Promise.all(triggerPromises);

    // Merge and sort results
    return mergeAndSortTriggerResults(triggerResults);
  }

  /**
   * Get complete activity for a single person.
   * Combines Twitter follows, LinkedIn connections, bio changes, stealth, and free agent status.
   */
  async getPersonActivity(
    personUserId: string,
    requestingUserId: number,
    options?: {
      days?: number;
      includeTwitter?: boolean;
      includeLinkedin?: boolean;
      includeBio?: boolean;
      includeStealth?: boolean;
      includeFreeAgent?: boolean;
      maxBioChanges?: number;
    }
  ): Promise<PersonActivity> {
    const {
      days = DEFAULT_ACTIVITY_DAYS,
      includeTwitter = true,
      includeLinkedin = true,
      includeBio = true,
      includeStealth = true,
      includeFreeAgent = true,
      maxBioChanges,
    } = options || {};

    const dateFrom = getDateNDaysAgo(days);

    // Fetch person's profile first (to get LinkedIn URN)
    const personProfile = await findProfileByUserId(personUserId);
    const personLinkedinUrn = personProfile?.linkedin_urn || null;

    // Run queries in parallel
    const [
      twitterFollowsResult,
      twitterFollowersResult,
      linkedinConnectionsResult,
      bioChanges,
      stealthStatus,
      freeAgentResult,
    ] = await Promise.all([
      includeTwitter
        ? queryTwitterFollowsByPerson(personUserId, dateFrom)
        : Promise.resolve({ userIds: [] as string[], dates: new Map<string, string>(), triggerType: "twitter_follow" as const }),
      includeTwitter
        ? queryTwitterFollowersOfPerson(personUserId, dateFrom)
        : Promise.resolve({ userIds: [] as string[], dates: new Map<string, string>(), triggerType: "twitter_followed_by" as const }),
      includeLinkedin
        ? queryLinkedInConnectionsOfPerson(personUserId, personLinkedinUrn, dateFrom)
        : Promise.resolve({ connections: [] as ConnectionIdentifier[], dates: new Map<string, string>() }),
      includeBio
        ? getBioChangesForUsers([personUserId], days)
        : Promise.resolve(new Map<string, { userId: string; changeDate: Date }>()),
      includeStealth
        ? getStealthStatusForUsers([personUserId], days)
        : Promise.resolve(new Map<string, { userId: string; type: "in" | "out"; date: Date; profileUrl: string | null }>()),
      includeFreeAgent
        ? queryFreeAgentsTrigger(dateFrom)
        : Promise.resolve({ userIds: [] as string[], dates: new Map<string, string>(), triggerType: "free_agent" as const }),
    ]);

    // Collect all related user IDs for profile enrichment
    const allRelatedUserIds = new Set<string>();
    twitterFollowsResult.userIds.forEach((id) => allRelatedUserIds.add(id));
    twitterFollowersResult.userIds.forEach((id) => allRelatedUserIds.add(id));
    linkedinConnectionsResult.connections.forEach((c) => {
      if (c.restId) allRelatedUserIds.add(c.restId);
    });

    // Batch fetch profiles for all related users
    const relatedProfiles =
      allRelatedUserIds.size > 0
        ? await findProfilesByUserIds(Array.from(allRelatedUserIds))
        : [];
    const profilesMap = new Map<string, EnrichedProfile>();
    for (const profile of relatedProfiles) {
      profilesMap.set(profile.user_id, profile);
    }

    // Build Twitter followers list
    const twitterFollowers: RelatedPerson[] = [];
    for (const userId of twitterFollowersResult.userIds) {
      const profile = profilesMap.get(userId);
      const date = twitterFollowersResult.dates.get(userId) || "";
      if (profile) {
        twitterFollowers.push(
          profileToRelatedPerson(profile, date, "incoming", "twitter")
        );
      } else {
        twitterFollowers.push({
          userId,
          name: "Unknown",
          profileUrl: `https://twitter.com/i/user/${userId}`,
          connectionDate: date,
          direction: "incoming",
          source: "twitter",
        });
      }
    }

    // Build Twitter following list
    const twitterFollowing: RelatedPerson[] = [];
    for (const userId of twitterFollowsResult.userIds) {
      const profile = profilesMap.get(userId);
      const date = twitterFollowsResult.dates.get(userId) || "";
      if (profile) {
        twitterFollowing.push(
          profileToRelatedPerson(profile, date, "outgoing", "twitter")
        );
      } else {
        twitterFollowing.push({
          userId,
          name: "Unknown",
          profileUrl: `https://twitter.com/i/user/${userId}`,
          connectionDate: date,
          direction: "outgoing",
          source: "twitter",
        });
      }
    }

    // Build LinkedIn connections list
    const linkedinConnections: RelatedPerson[] = [];
    for (const connection of linkedinConnectionsResult.connections) {
      const profile = connection.restId
        ? profilesMap.get(connection.restId)
        : null;
      if (profile) {
        linkedinConnections.push(
          profileToRelatedPerson(
            profile,
            connection.date,
            connection.direction,
            "linkedin"
          )
        );
      } else {
        linkedinConnections.push({
          userId: connection.restId || connection.linkedinUrn || "unknown",
          name: "Unknown",
          profileUrl: connection.linkedinUrn
            ? `https://linkedin.com/in/${connection.linkedinUrn}`
            : "#",
          connectionDate: connection.date,
          direction: connection.direction,
          source: "linkedin",
        });
      }
    }

    // Build bio changes list
    const bioChangeList: BioChange[] = [];
    if (personProfile?.bio_changes) {
      const changes = maxBioChanges
        ? personProfile.bio_changes.slice(0, maxBioChanges)
        : personProfile.bio_changes;
      for (const change of changes) {
        bioChangeList.push({
          before: change.before.description,
          after: change.after.description,
          date: change.after.date || change.before.date,
        });
      }
    }

    // Check free agent status
    const isFreeAgent = freeAgentResult.userIds.includes(personUserId);
    let freeAgentDetails: FreeAgentDetails | undefined;
    if (isFreeAgent) {
      // Get company from work_experience (first entry is typically most recent)
      const previousCompany = personProfile?.work_experience?.[0];
      const previousTitle = personProfile?.job_titles?.[0];
      freeAgentDetails = {
        previousCompany,
        previousTitle,
        signalDate: freeAgentResult.dates.get(personUserId) || "",
      };
    }

    // Check stealth status
    const stealthInfo = stealthStatus.get(personUserId);

    // Build activity timeline
    const activity: ActivityEvent[] = [];

    // Add Twitter follower events
    for (const person of twitterFollowers) {
      activity.push({
        eventType: "twitter_followed_by",
        date: person.connectionDate,
        relatedPerson: {
          userId: person.userId,
          screenName: person.screenName,
          name: person.name,
          headline: person.headline,
          profileUrl: person.profileUrl,
          profileImageUrl: person.profileImageUrl,
          direction: "incoming",
        },
      });
    }

    // Add Twitter following events
    for (const person of twitterFollowing) {
      activity.push({
        eventType: "twitter_follow",
        date: person.connectionDate,
        relatedPerson: {
          userId: person.userId,
          screenName: person.screenName,
          name: person.name,
          headline: person.headline,
          profileUrl: person.profileUrl,
          profileImageUrl: person.profileImageUrl,
          direction: "outgoing",
        },
      });
    }

    // Add LinkedIn connection events
    for (const person of linkedinConnections) {
      activity.push({
        eventType: "linkedin_connection",
        date: person.connectionDate,
        relatedPerson: {
          userId: person.userId,
          screenName: person.screenName,
          name: person.name,
          headline: person.headline,
          profileUrl: person.profileUrl,
          profileImageUrl: person.profileImageUrl,
          direction: person.direction,
        },
      });
    }

    // Add bio change events
    for (const change of bioChangeList) {
      activity.push({
        eventType: "bio_change",
        date: change.date,
        bioChange: change,
      });
    }

    // Add stealth event
    if (stealthInfo) {
      activity.push({
        eventType: stealthInfo.type === "in" ? "stealth_in" : "stealth_out",
        date: stealthInfo.date.toISOString(),
        stealthDetails: {
          type: stealthInfo.type,
          linkedinUrl: stealthInfo.profileUrl || undefined,
        },
      });
    }

    // Add free agent event
    if (isFreeAgent && freeAgentDetails) {
      activity.push({
        eventType: "free_agent",
        date: freeAgentDetails.signalDate,
        freeAgentDetails,
      });
    }

    // Sort activity by date DESC
    activity.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });

    // Build summary
    const summary: ActivitySummary = {
      twitterFollowersCount: twitterFollowers.length,
      twitterFollowingCount: twitterFollowing.length,
      linkedinConnectionsCount: linkedinConnections.length,
      bioChangesCount: bioChangeList.length,
      hasStealth: !!stealthInfo,
      stealthStatus: stealthInfo?.type || null,
      isFreeAgent,
      lastActivityDate: activity.length > 0 ? activity[0].date : undefined,
    };

    return {
      twitterFollowers,
      twitterFollowing,
      linkedinConnections,
      bioChanges: bioChangeList,
      activity,
      summary,
      freeAgentDetails,
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let triggerServiceInstance: TriggerService | null = null;

/**
 * Get the singleton TriggerService instance.
 */
export function getTriggerService(): TriggerService {
  if (!triggerServiceInstance) {
    triggerServiceInstance = new TriggerService();
  }
  return triggerServiceInstance;
}
