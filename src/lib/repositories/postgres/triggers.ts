/**
 * Trigger query functions for the signal aggregation system.
 *
 * These functions query the various PostgreSQL signal tables to find
 * profiles with recent activity (triggers).
 */

import { query } from "@/lib/db/postgres";
import {
  STEALTH_INTO_SUBSCRIPTION_IDS,
  STEALTH_OUT_SUBSCRIPTION_IDS,
  getStealthType,
  SPECIAL_GROUP_IDS,
  filterGroupIds,
} from "@/lib/constants";
import {
  TriggerQueryResult,
  TriggerEntry,
  MergedTriggerResult,
  StealthEvent,
  ConnectionIdentifier,
  ConnectionData,
  TriggerType,
} from "@/lib/types/triggers";
import {
  ensureLinkedinPrefix,
  buildIdToUrnMap,
  buildAllowedLinkedInIdentifierSet,
} from "@/lib/utils/linkedinUrn";
import { findProfilesByUserIds } from "@/lib/repositories/mongodb/profiles";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Normalize a date to ISO format (YYYY-MM-DD).
 */
function normalizeDate(date: Date | string | null | undefined): string {
  if (!date) {
    return new Date().toISOString().split("T")[0];
  }
  if (typeof date === "string") {
    // Already a string, extract date portion
    return date.split("T")[0];
  }
  return date.toISOString().split("T")[0];
}

/**
 * Build date conditions for SQL queries.
 */
function buildDateConditions(
  dateFrom?: string,
  dateTo?: string,
  dateColumn: string = "date_to"
): { conditions: string[]; params: string[] } {
  const conditions: string[] = [];
  const params: string[] = [];

  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`${dateColumn} >= $${params.length}::date`);
  }

  if (dateTo) {
    params.push(dateTo);
    conditions.push(`${dateColumn} <= $${params.length}::date`);
  }

  return { conditions, params };
}

// =============================================================================
// Group Member Resolution
// =============================================================================

/**
 * Get user IDs for members of specified groups.
 * Handles special group IDs (-1, -2, -3) and regular groups.
 *
 * @param userId - User whose groups to query
 * @param groupIds - Group IDs (can include special IDs)
 * @returns Array of member user IDs
 */
export async function getGroupMemberUserIds(
  userId: number,
  groupIds: number[]
): Promise<string[]> {
  const { regular, hasSaved, hasSkipped, hasAllTracked } =
    filterGroupIds(groupIds);

  const memberIds = new Set<string>();

  // Handle -3: All People Tracked
  if (hasAllTracked) {
    const rows = await query<{ rest_id: string }>(
      `SELECT DISTINCT rest_id::text as rest_id
       FROM user_people_tracked
       WHERE user_id = $1`,
      [userId]
    );
    for (const row of rows) {
      memberIds.add(row.rest_id);
    }
  }

  // Handle -1: Saved/Liked profiles
  if (hasSaved) {
    const rows = await query<{ signal_profile_user_id: string }>(
      `SELECT DISTINCT signal_profile_user_id::text as signal_profile_user_id
       FROM user_signal_status
       WHERE user_id = $1 AND status = 'liked'`,
      [userId]
    );
    for (const row of rows) {
      memberIds.add(row.signal_profile_user_id);
    }
  }

  // Handle -2: Skipped/Disliked profiles
  if (hasSkipped) {
    const rows = await query<{ signal_profile_user_id: string }>(
      `SELECT DISTINCT signal_profile_user_id::text as signal_profile_user_id
       FROM user_signal_status
       WHERE user_id = $1 AND status = 'disliked'`,
      [userId]
    );
    for (const row of rows) {
      memberIds.add(row.signal_profile_user_id);
    }
  }

  // Handle regular groups (positive IDs)
  if (regular.length > 0) {
    const rows = await query<{ signal_profile_user_id: string }>(
      `SELECT DISTINCT sg.signal_profile_user_id::text as signal_profile_user_id
       FROM signal_groups sg
       JOIN user_to_signal_groups utsg ON sg.group_id = utsg.group_id
       WHERE utsg.group_id = ANY($1) AND utsg.user_id = $2`,
      [regular, userId]
    );
    for (const row of rows) {
      memberIds.add(row.signal_profile_user_id);
    }
  }

  return Array.from(memberIds);
}

// =============================================================================
// Trigger Query Functions
// =============================================================================

/**
 * Query for bio change triggers.
 */
export async function queryBioChangedTrigger(
  dateFrom?: string,
  dateTo?: string
): Promise<TriggerQueryResult> {
  const { conditions, params } = buildDateConditions(dateFrom, dateTo);
  conditions.push("is_signal = true");

  const sql = `
    SELECT
      signal_profile_user_id::text as user_id,
      MAX(date_to) as most_recent_date
    FROM bio_people_tracked_possible_signals_by_day
    WHERE ${conditions.join(" AND ")}
    GROUP BY signal_profile_user_id
    ORDER BY most_recent_date DESC
  `;

  const rows = await query<{ user_id: string; most_recent_date: Date }>(
    sql,
    params
  );

  const userIds = rows.map((r) => r.user_id);
  const dates = new Map<string, string>();
  for (const row of rows) {
    dates.set(row.user_id, normalizeDate(row.most_recent_date));
  }

  return {
    triggerType: "bio_change",
    userIds,
    dates,
  };
}

/**
 * Query for stealth mode triggers (in/out).
 */
export async function queryStealthTrigger(
  types: ("in" | "out")[],
  dateFrom?: string,
  dateTo?: string
): Promise<TriggerQueryResult> {
  if (!types || types.length === 0) {
    return {
      triggerType: "stealth_in",
      userIds: [],
      dates: new Map(),
      stealthEvents: [],
    };
  }

  // Build subscription ID list based on requested types
  const subscriptionIds: string[] = [];
  if (types.includes("in")) {
    subscriptionIds.push(...STEALTH_INTO_SUBSCRIPTION_IDS);
  }
  if (types.includes("out")) {
    subscriptionIds.push(...STEALTH_OUT_SUBSCRIPTION_IDS);
  }

  if (subscriptionIds.length === 0) {
    return {
      triggerType: "stealth_in",
      userIds: [],
      dates: new Map(),
      stealthEvents: [],
    };
  }

  const { conditions, params } = buildDateConditions(dateFrom, dateTo);
  conditions.push("is_signal = true");
  params.push(subscriptionIds as unknown as string);
  conditions.push(`subscription_id = ANY($${params.length})`);

  const sql = `
    SELECT
      rest_id::text as user_id,
      subscription_id,
      date_to,
      profile_url
    FROM stealth_linkedin_people_tracked_possible_signals_by_day
    WHERE ${conditions.join(" AND ")}
    ORDER BY date_to DESC
  `;

  const rows = await query<{
    user_id: string;
    subscription_id: string;
    date_to: Date;
    profile_url: string | null;
  }>(sql, params);

  // Build stealth events and aggregate by user
  const stealthEvents: StealthEvent[] = [];
  const datesByUserId = new Map<string, string>();
  const userIdSet = new Set<string>();

  for (const row of rows) {
    const type = getStealthType(row.subscription_id);
    if (!type) continue;

    userIdSet.add(row.user_id);

    const dateStr = normalizeDate(row.date_to);

    stealthEvents.push({
      userId: row.user_id,
      date: dateStr,
      type,
      linkedinUrl: row.profile_url || undefined,
    });

    // Keep most recent date per user
    if (!datesByUserId.has(row.user_id) || dateStr > datesByUserId.get(row.user_id)!) {
      datesByUserId.set(row.user_id, dateStr);
    }
  }

  return {
    triggerType: types.includes("in") ? "stealth_in" : "stealth_out",
    userIds: Array.from(userIdSet),
    dates: datesByUserId,
    stealthEvents,
  };
}

/**
 * Query for free agent triggers.
 */
export async function queryFreeAgentsTrigger(
  dateFrom?: string,
  dateTo?: string
): Promise<TriggerQueryResult> {
  const { conditions, params } = buildDateConditions(dateFrom, dateTo);
  conditions.push("is_signal = true");

  const sql = `
    SELECT
      rest_id::text as user_id,
      MAX(date_to) as most_recent_date
    FROM free_agent_people_tracked_possible_signal_by_day
    WHERE ${conditions.join(" AND ")}
    GROUP BY rest_id
    ORDER BY most_recent_date DESC
  `;

  const rows = await query<{ user_id: string; most_recent_date: Date }>(
    sql,
    params
  );

  const userIds = rows.map((r) => r.user_id);
  const dates = new Map<string, string>();
  for (const row of rows) {
    dates.set(row.user_id, normalizeDate(row.most_recent_date));
  }

  return {
    triggerType: "free_agent",
    userIds,
    dates,
  };
}

/**
 * Query for LinkedIn connection triggers (bidirectional).
 *
 * Queries BOTH directions:
 * - Connections made BY tracked people (person_tracked_* matches)
 * - Connections made TO tracked people (signal_profile_* matches)
 */
export async function queryLinkedInConnectionsTrigger(
  userId: number,
  groupIds?: number[],
  dateFrom?: string,
  dateTo?: string
): Promise<TriggerQueryResult> {
  // Get tracked people IDs
  const effectiveGroupIds = groupIds?.length
    ? groupIds
    : [SPECIAL_GROUP_IDS.ALL_TRACKED];

  const trackedPeopleIds = await getGroupMemberUserIds(userId, effectiveGroupIds);

  if (trackedPeopleIds.length === 0) {
    return {
      triggerType: "linkedin_connection",
      userIds: [],
      dates: new Map(),
      connectionData: {
        connectionsByProfile: new Map(),
        urnToUserIdMap: new Map(),
        userIdToUrnMap: new Map(),
      },
    };
  }

  // Build URN map for tracked people
  const idToUrnMap = await buildIdToUrnMap(trackedPeopleIds, findProfilesByUserIds);

  // Build query identifiers
  const allTrackedUserIds = new Set<string>(trackedPeopleIds);
  const allTrackedUrns = new Set<string>();

  for (const [, urn] of idToUrnMap) {
    allTrackedUrns.add(urn);
    allTrackedUserIds.add(ensureLinkedinPrefix(urn));
  }

  const trackedUserIdsList = Array.from(allTrackedUserIds);
  const trackedUrnsList = Array.from(allTrackedUrns);

  // Build allowed identifiers for filtering
  const allowedIdentifiers = buildAllowedLinkedInIdentifierSet([
    ...trackedUserIdsList,
    ...trackedUrnsList,
  ]);

  // Build date conditions
  const { conditions, params } = buildDateConditions(dateFrom, dateTo);
  conditions.push("is_signal = true");

  // Add tracked people conditions (query BOTH directions)
  params.push(trackedUserIdsList as unknown as string);
  const userIdParam = params.length;
  params.push(trackedUrnsList as unknown as string);
  const urnParam = params.length;

  const sql = `
    SELECT
      person_tracked_user_id::text as person_tracked_user_id,
      person_tracked_urn,
      signal_profile_user_id::text as signal_profile_user_id,
      signal_profile_urn,
      date_to
    FROM linkedin_people_tracked_possible_signals_by_day
    WHERE ${conditions.join(" AND ")}
      AND (
        (person_tracked_user_id::text = ANY($${userIdParam}) OR person_tracked_urn = ANY($${urnParam}))
        OR
        (signal_profile_user_id::text = ANY($${userIdParam}) OR signal_profile_urn = ANY($${urnParam}))
      )
    ORDER BY date_to DESC
  `;

  const rows = await query<{
    person_tracked_user_id: string;
    person_tracked_urn: string | null;
    signal_profile_user_id: string;
    signal_profile_urn: string | null;
    date_to: Date;
  }>(sql, params);

  // Process results - determine display profile vs connection based on which side is tracked
  const connectionsByProfile = new Map<string, ConnectionIdentifier[]>();
  const datesByUserId = new Map<string, string>();
  const userIdSet = new Set<string>();
  const urnToUserIdMap = new Map<string, string>();
  const userIdToUrnMap = new Map<string, string>();

  for (const row of rows) {
    const dateStr = normalizeDate(row.date_to);

    // Check which side is tracked (determines direction)
    const personTrackedIsTracked =
      trackedUserIdsList.includes(row.person_tracked_user_id) ||
      (row.person_tracked_urn && trackedUrnsList.includes(row.person_tracked_urn));

    const signalProfileIsTracked =
      trackedUserIdsList.includes(row.signal_profile_user_id) ||
      (row.signal_profile_urn && trackedUrnsList.includes(row.signal_profile_urn));

    // Determine display profile (the one we care about) and connection (the related person)
    let displayUserId: string;
    let connectionUserId: string;
    let connectionUrn: string | null;
    let direction: "outgoing" | "incoming";

    if (personTrackedIsTracked && !signalProfileIsTracked) {
      // Normal case: tracked person made a connection
      displayUserId = row.signal_profile_user_id;
      connectionUserId = row.person_tracked_user_id;
      connectionUrn = row.person_tracked_urn;
      direction = "incoming"; // Connection came TO the display profile
    } else if (signalProfileIsTracked && !personTrackedIsTracked) {
      // Reverse case: connection was made TO a tracked person
      displayUserId = row.person_tracked_user_id;
      connectionUserId = row.signal_profile_user_id;
      connectionUrn = row.signal_profile_urn;
      direction = "outgoing"; // Display profile connected OUT
    } else {
      // Both are tracked - show from signal_profile perspective
      displayUserId = row.signal_profile_user_id;
      connectionUserId = row.person_tracked_user_id;
      connectionUrn = row.person_tracked_urn;
      direction = "incoming";
    }

    userIdSet.add(displayUserId);

    // Update date map
    if (!datesByUserId.has(displayUserId) || dateStr > datesByUserId.get(displayUserId)!) {
      datesByUserId.set(displayUserId, dateStr);
    }

    // Build connection identifier
    const connectionIdentifier: ConnectionIdentifier = {
      linkedinUrn: connectionUrn,
      restId: connectionUserId,
      date: dateStr,
      direction,
    };

    // Add to connections map
    if (!connectionsByProfile.has(displayUserId)) {
      connectionsByProfile.set(displayUserId, []);
    }
    connectionsByProfile.get(displayUserId)!.push(connectionIdentifier);

    // Build URN maps
    if (connectionUrn) {
      urnToUserIdMap.set(connectionUrn.toLowerCase(), connectionUserId);
      userIdToUrnMap.set(connectionUserId, connectionUrn);
    }
  }

  return {
    triggerType: "linkedin_connection",
    userIds: Array.from(userIdSet),
    dates: datesByUserId,
    connectionData: {
      connectionsByProfile,
      urnToUserIdMap,
      userIdToUrnMap,
      allowedIdentifiers,
    },
  };
}

/**
 * Query for Twitter follow triggers based on group membership.
 * Returns profiles that were followed BY members of the specified groups.
 */
export async function queryFollowedByGroupsTrigger(
  userId: number,
  groupIds: number[],
  dateFrom?: string,
  dateTo?: string
): Promise<TriggerQueryResult> {
  if (!groupIds || groupIds.length === 0) {
    return {
      triggerType: "twitter_followed_by",
      userIds: [],
      dates: new Map(),
    };
  }

  // Get member user IDs from specified groups
  const memberIds = await getGroupMemberUserIds(userId, groupIds);

  if (memberIds.length === 0) {
    return {
      triggerType: "twitter_followed_by",
      userIds: [],
      dates: new Map(),
    };
  }

  const { conditions, params } = buildDateConditions(dateFrom, dateTo);
  conditions.push("is_signal = true");
  params.push(memberIds as unknown as string);
  conditions.push(`person_tracked_user_id::text = ANY($${params.length})`);

  const sql = `
    SELECT
      signal_profile_user_id::text as user_id,
      MAX(date_to) as most_recent_date
    FROM people_tracked_possible_signals_by_day
    WHERE ${conditions.join(" AND ")}
    GROUP BY signal_profile_user_id
    ORDER BY most_recent_date DESC
  `;

  const rows = await query<{ user_id: string; most_recent_date: Date }>(
    sql,
    params
  );

  const userIds = rows.map((r) => r.user_id);
  const dates = new Map<string, string>();
  for (const row of rows) {
    dates.set(row.user_id, normalizeDate(row.most_recent_date));
  }

  return {
    triggerType: "twitter_followed_by",
    userIds,
    dates,
  };
}

/**
 * Query for Twitter follows made by a specific person (outgoing).
 */
export async function queryTwitterFollowsByPerson(
  personUserId: string,
  dateFrom?: string,
  dateTo?: string,
  limit: number = 100
): Promise<TriggerQueryResult> {
  const { conditions, params } = buildDateConditions(dateFrom, dateTo);
  conditions.push("is_signal = true");
  params.push(personUserId);
  conditions.push(`person_tracked_user_id::text = $${params.length}`);

  const sql = `
    SELECT DISTINCT
      signal_profile_user_id::text as user_id,
      date_to
    FROM people_tracked_possible_signals_by_day
    WHERE ${conditions.join(" AND ")}
    ORDER BY date_to DESC
    LIMIT ${limit}
  `;

  const rows = await query<{ user_id: string; date_to: Date }>(sql, params);

  const userIds = rows.map((r) => r.user_id);
  const dates = new Map<string, string>();
  for (const row of rows) {
    dates.set(row.user_id, normalizeDate(row.date_to));
  }

  return {
    triggerType: "twitter_follow",
    userIds,
    dates,
  };
}

/**
 * Query for Twitter followers of a specific person (incoming).
 */
export async function queryTwitterFollowersOfPerson(
  personUserId: string,
  dateFrom?: string,
  dateTo?: string,
  limit: number = 100
): Promise<TriggerQueryResult> {
  const { conditions, params } = buildDateConditions(dateFrom, dateTo);
  conditions.push("is_signal = true");
  params.push(personUserId);
  conditions.push(`signal_profile_user_id::text = $${params.length}`);

  const sql = `
    SELECT DISTINCT
      person_tracked_user_id::text as user_id,
      person_tracked_screen_name as screen_name,
      date_to
    FROM people_tracked_possible_signals_by_day
    WHERE ${conditions.join(" AND ")}
    ORDER BY date_to DESC
    LIMIT ${limit}
  `;

  const rows = await query<{
    user_id: string;
    screen_name: string | null;
    date_to: Date;
  }>(sql, params);

  const userIds = rows.map((r) => r.user_id);
  const dates = new Map<string, string>();
  for (const row of rows) {
    dates.set(row.user_id, normalizeDate(row.date_to));
  }

  return {
    triggerType: "twitter_followed_by",
    userIds,
    dates,
  };
}

/**
 * Query for LinkedIn connections of a specific person (bidirectional).
 */
export async function queryLinkedInConnectionsOfPerson(
  personUserId: string,
  personLinkedinUrn: string | null,
  dateFrom?: string,
  dateTo?: string,
  limit: number = 100
): Promise<{
  connections: ConnectionIdentifier[];
  dates: Map<string, string>;
}> {
  const { conditions, params } = buildDateConditions(dateFrom, dateTo);
  conditions.push("is_signal = true");

  // Build person identifiers for bidirectional query
  const personIdentifiers = [personUserId];
  if (personLinkedinUrn) {
    personIdentifiers.push(personLinkedinUrn);
    personIdentifiers.push(ensureLinkedinPrefix(personLinkedinUrn));
  }

  params.push(personIdentifiers as unknown as string);
  const identParam = params.length;

  const sql = `
    SELECT
      person_tracked_user_id::text as person_tracked_user_id,
      person_tracked_urn,
      signal_profile_user_id::text as signal_profile_user_id,
      signal_profile_urn,
      date_to
    FROM linkedin_people_tracked_possible_signals_by_day
    WHERE ${conditions.join(" AND ")}
      AND (
        person_tracked_user_id::text = ANY($${identParam})
        OR person_tracked_urn = ANY($${identParam})
        OR signal_profile_user_id::text = ANY($${identParam})
        OR signal_profile_urn = ANY($${identParam})
      )
    ORDER BY date_to DESC
    LIMIT ${limit}
  `;

  const rows = await query<{
    person_tracked_user_id: string;
    person_tracked_urn: string | null;
    signal_profile_user_id: string;
    signal_profile_urn: string | null;
    date_to: Date;
  }>(sql, params);

  const connections: ConnectionIdentifier[] = [];
  const dates = new Map<string, string>();

  for (const row of rows) {
    const dateStr = normalizeDate(row.date_to);

    // Determine which side is the person and which is the connection
    const personIsPerson =
      personIdentifiers.includes(row.person_tracked_user_id) ||
      (row.person_tracked_urn && personIdentifiers.includes(row.person_tracked_urn));

    let connectionUserId: string;
    let connectionUrn: string | null;
    let direction: "outgoing" | "incoming";

    if (personIsPerson) {
      // Person is on person_tracked side - they made the connection (outgoing)
      connectionUserId = row.signal_profile_user_id;
      connectionUrn = row.signal_profile_urn;
      direction = "outgoing";
    } else {
      // Person is on signal_profile side - they received the connection (incoming)
      connectionUserId = row.person_tracked_user_id;
      connectionUrn = row.person_tracked_urn;
      direction = "incoming";
    }

    connections.push({
      linkedinUrn: connectionUrn,
      restId: connectionUserId,
      date: dateStr,
      direction,
    });

    if (!dates.has(connectionUserId) || dateStr > dates.get(connectionUserId)!) {
      dates.set(connectionUserId, dateStr);
    }
  }

  return { connections, dates };
}

// =============================================================================
// Merge and Sort
// =============================================================================

/**
 * Merge multiple trigger query results into a single sorted result.
 * Deduplicates by userId, keeping the most recent date and all trigger types.
 */
export function mergeAndSortTriggerResults(
  results: TriggerQueryResult[]
): MergedTriggerResult {
  const datesByUserId = new Map<string, string>();
  const triggersByUserId = new Map<string, TriggerType[]>();
  const entries: TriggerEntry[] = [];

  // Aggregate metadata
  let connectionData: ConnectionData | undefined;

  for (const result of results) {
    // Capture connection data if present
    if (result.connectionData) {
      connectionData = result.connectionData;
    }

    for (const userId of result.userIds) {
      const date = result.dates.get(userId) || "";

      // Update most recent date
      const existingDate = datesByUserId.get(userId);
      if (!existingDate || date > existingDate) {
        datesByUserId.set(userId, date);
      }

      // Add trigger type
      if (!triggersByUserId.has(userId)) {
        triggersByUserId.set(userId, []);
      }
      const triggers = triggersByUserId.get(userId)!;
      if (!triggers.includes(result.triggerType)) {
        triggers.push(result.triggerType);
      }

      // Create entry
      const entry: TriggerEntry = {
        userId,
        triggerType: result.triggerType,
        date,
      };

      // Add stealth type if applicable
      if (result.stealthEvents) {
        const stealthEvent = result.stealthEvents.find(
          (e) => e.userId === userId
        );
        if (stealthEvent) {
          entry.stealthType = stealthEvent.type;
        }
      }

      entries.push(entry);
    }
  }

  // Sort entries by date DESC, then userId for determinism
  entries.sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateB !== dateA) {
      return dateB - dateA;
    }
    return a.userId.localeCompare(b.userId);
  });

  return {
    entries,
    datesByUserId,
    triggersByUserId,
    metadata: {
      totalTriggersActive: results.length,
      connectionData,
    },
  };
}
