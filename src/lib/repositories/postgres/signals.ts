import { query } from "@/lib/db/postgres";

/**
 * Signal from the tracked people signals tables.
 */
export interface TrackedSignal {
  user_id: number;
  screen_name: string;
  name: string;
  signal_date: Date;
  signal_type: string;
  details?: Record<string, unknown>;
}

/**
 * Get recent follows/unfollows for tracked people.
 */
export async function getFollowSignals(params: {
  userIds?: number[];
  days?: number;
  limit?: number;
}): Promise<TrackedSignal[]> {
  const { userIds, days = 30, limit = 100 } = params;

  let sql = `
    SELECT
      ptps.signal_profile_user_id as user_id,
      tp_signal.screen_name as screen_name,
      tp_signal.screen_name as name,
      ptps.date_to as signal_date,
      'follow' as signal_type
    FROM people_tracked_possible_signals_by_day ptps
    LEFT JOIN tracked_people tp_signal
      ON ptps.signal_profile_user_id = tp_signal.rest_id
    WHERE ptps.date_to >= CURRENT_DATE - make_interval(days => ${days})
      AND ptps.is_signal = true
  `;

  const queryParams: unknown[] = [];

  if (userIds && userIds.length > 0) {
    sql += ` AND ptps.signal_profile_user_id = ANY($1)`;
    queryParams.push(userIds);
  }

  sql += ` ORDER BY ptps.date_to DESC LIMIT ${limit}`;

  return query<TrackedSignal>(sql, queryParams);
}

/**
 * Get recent bio changes for tracked people.
 */
export async function getBioChangeSignals(params: {
  userIds?: number[];
  days?: number;
  limit?: number;
}): Promise<TrackedSignal[]> {
  const { userIds, days = 30, limit = 100 } = params;

  let sql = `
    SELECT
      bp.signal_profile_user_id as user_id,
      tp.screen_name as screen_name,
      tp.screen_name as name,
      bp.date_to as signal_date,
      'bio_change' as signal_type
    FROM bio_people_tracked_possible_signals_by_day bp
    LEFT JOIN tracked_people tp
      ON bp.signal_profile_user_id = tp.rest_id
    WHERE bp.date_to >= CURRENT_DATE - make_interval(days => ${days})
      AND bp.is_signal = true
  `;

  const queryParams: unknown[] = [];

  if (userIds && userIds.length > 0) {
    sql += ` AND bp.signal_profile_user_id = ANY($1)`;
    queryParams.push(userIds);
  }

  sql += ` ORDER BY bp.date_to DESC LIMIT ${limit}`;

  return query<TrackedSignal>(sql, queryParams);
}

/**
 * Get stealth LinkedIn signals for tracked people.
 */
export async function getStealthSignals(params: {
  userIds?: number[];
  days?: number;
  limit?: number;
}): Promise<TrackedSignal[]> {
  const { userIds, days = 30, limit = 100 } = params;

  let sql = `
    SELECT
      st.rest_id as user_id,
      tp.screen_name as screen_name,
      tp.screen_name as name,
      st.date_to as signal_date,
      'stealth' as signal_type
    FROM stealth_linkedin_people_tracked_possible_signals_by_day st
    LEFT JOIN tracked_people tp
      ON st.rest_id = tp.rest_id
    WHERE st.date_to >= CURRENT_DATE - make_interval(days => ${days})
      AND st.is_signal = true
  `;

  const queryParams: unknown[] = [];

  if (userIds && userIds.length > 0) {
    sql += ` AND st.rest_id = ANY($1)`;
    queryParams.push(userIds);
  }

  sql += ` ORDER BY st.date_to DESC LIMIT ${limit}`;

  return query<TrackedSignal>(sql, queryParams);
}

/**
 * Network follower information - who from user's network follows a person.
 */
export interface NetworkFollower {
  userId: string;
  screenName: string | null;
  followedDate: Date;
  source: "twitter" | "linkedin";
}

/**
 * Get who from user's network follows each person.
 * Includes both Twitter follows and LinkedIn connections.
 *
 * @param signalUserIds - List of people to check (user_ids or URNs)
 * @param userId - User whose network to check
 * @returns Map of signal_user_id -> list of network followers
 */
export async function getNetworkFollowersForSignals(
  signalUserIds: string[],
  userId: number
): Promise<Map<string, NetworkFollower[]>> {
  if (!signalUserIds.length) {
    return new Map();
  }

  // Twitter follows
  const twitterRows = await query<{
    signal_profile_user_id: string;
    person_tracked_user_id: string;
    person_tracked_screen_name: string | null;
    followed_date: Date;
  }>(
    `SELECT
      ptps.signal_profile_user_id,
      ptps.person_tracked_user_id,
      ptps.person_tracked_screen_name,
      ptps.date_to as followed_date
    FROM people_tracked_possible_signals_by_day ptps
    JOIN user_people_tracked upt
      ON ptps.person_tracked_user_id = upt.rest_id
    WHERE upt.user_id = $1
      AND ptps.signal_profile_user_id = ANY($2)
      AND ptps.is_signal = true
    ORDER BY ptps.date_to DESC`,
    [userId, signalUserIds]
  );

  // LinkedIn connections
  const linkedinRows = await query<{
    signal_profile_user_id: string;
    person_tracked_user_id: string;
    followed_date: Date;
  }>(
    `SELECT
      lps.signal_profile_urn as signal_profile_user_id,
      lps.person_tracked_urn as person_tracked_user_id,
      lps.date_to as followed_date
    FROM linkedin_people_tracked_possible_signals_by_day lps
    JOIN user_people_tracked upt
      ON lps.person_tracked_urn = upt.rest_id
    WHERE upt.user_id = $1
      AND lps.signal_profile_urn = ANY($2)
      AND lps.is_signal = true
    ORDER BY lps.date_to DESC`,
    [userId, signalUserIds]
  );

  // Group by signal_profile_user_id
  const result = new Map<string, NetworkFollower[]>();

  for (const row of twitterRows) {
    const signalId = row.signal_profile_user_id;
    if (!result.has(signalId)) {
      result.set(signalId, []);
    }
    result.get(signalId)!.push({
      userId: row.person_tracked_user_id,
      screenName: row.person_tracked_screen_name,
      followedDate: row.followed_date,
      source: "twitter",
    });
  }

  for (const row of linkedinRows) {
    const signalId = row.signal_profile_user_id;
    if (!result.has(signalId)) {
      result.set(signalId, []);
    }
    result.get(signalId)!.push({
      userId: row.person_tracked_user_id,
      screenName: null, // LinkedIn doesn't have screen_name
      followedDate: row.followed_date,
      source: "linkedin",
    });
  }

  return result;
}



/**
 * Signal count breakdown by type.
 */
export interface SignalBreakdown {
  follows: number;
  bioChanges: number;
  stealth: number;
  linkedin: number;
}

/**
 * Get signal count breakdown by type for each person.
 * Includes both Twitter follows and LinkedIn connections.
 *
 * @param signalUserIds - List of people to analyze
 * @param days - Number of days to look back
 * @returns Map of user_id -> signal breakdown
 */
export async function getSignalCountsByType(
  signalUserIds: string[],
  days: number = 30
): Promise<Map<string, SignalBreakdown>> {
  if (!signalUserIds.length) {
    return new Map();
  }

  // Initialize result with zeros
  const result = new Map<string, SignalBreakdown>();
  for (const userId of signalUserIds) {
    result.set(userId, { follows: 0, bioChanges: 0, stealth: 0, linkedin: 0 });
  }

  // Count Twitter follows
  const twitterFollows = await query<{
    signal_profile_user_id: string;
    count: number;
  }>(
    `SELECT
      signal_profile_user_id,
      COUNT(*) as count
    FROM people_tracked_possible_signals_by_day
    WHERE signal_profile_user_id = ANY($1)
      AND date_to >= CURRENT_DATE - make_interval(days => $2)
      AND is_signal = true
    GROUP BY signal_profile_user_id`,
    [signalUserIds, days]
  );

  for (const row of twitterFollows) {
    const breakdown = result.get(row.signal_profile_user_id);
    if (breakdown) {
      breakdown.follows += Number(row.count);
    }
  }

  // Count LinkedIn connections
  const linkedinConnections = await query<{
    signal_profile_user_id: string;
    count: number;
  }>(
    `SELECT
      signal_profile_urn as signal_profile_user_id,
      COUNT(*) as count
    FROM linkedin_people_tracked_possible_signals_by_day
    WHERE signal_profile_urn = ANY($1)
      AND date_to >= CURRENT_DATE - make_interval(days => $2)
      AND is_signal = true
    GROUP BY signal_profile_urn`,
    [signalUserIds, days]
  );

  for (const row of linkedinConnections) {
    const breakdown = result.get(row.signal_profile_user_id);
    if (breakdown) {
      breakdown.follows += Number(row.count);
      breakdown.linkedin = Number(row.count);
    }
  }

  // Count bio changes
  const bioChanges = await query<{
    signal_profile_user_id: string;
    count: number;
  }>(
    `SELECT
      signal_profile_user_id,
      COUNT(*) as count
    FROM bio_people_tracked_possible_signals_by_day
    WHERE signal_profile_user_id = ANY($1)
      AND date_to >= CURRENT_DATE - make_interval(days => $2)
      AND is_signal = true
    GROUP BY signal_profile_user_id`,
    [signalUserIds, days]
  );

  for (const row of bioChanges) {
    const breakdown = result.get(row.signal_profile_user_id);
    if (breakdown) {
      breakdown.bioChanges = Number(row.count);
    }
  }

  // Count stealth events
  const stealthEvents = await query<{
    signal_profile_user_id: string;
    count: number;
  }>(
    `SELECT
      rest_id as signal_profile_user_id,
      COUNT(*) as count
    FROM stealth_linkedin_people_tracked_possible_signals_by_day
    WHERE rest_id = ANY($1)
      AND date_to >= CURRENT_DATE - make_interval(days => $2)
      AND is_signal = true
    GROUP BY rest_id`,
    [signalUserIds, days]
  );

  for (const row of stealthEvents) {
    const breakdown = result.get(row.signal_profile_user_id);
    if (breakdown) {
      breakdown.stealth = Number(row.count);
    }
  }

  return result;
}

/**
 * Signal event for timeline.
 */
export interface SignalEvent {
  eventType: "follow" | "bio_change" | "stealth" | "linkedin";
  actor: string | null;
  actorId: string | null;
  eventDate: Date;
  details: Record<string, unknown> | null;
}

/**
 * Get complete signal timeline for a person.
 * Combines follows, bio changes, and stealth events into chronological timeline.
 *
 * @param signalUserId - The person's user_id
 * @param days - Number of days to look back
 * @returns List of all signal events sorted by date (newest first)
 */
export async function getSignalTimeline(
  signalUserId: string,
  days: number = 90
): Promise<SignalEvent[]> {
  // Get Twitter follows
  const follows = await query<{
    event_type: string;
    actor: string | null;
    actor_id: string | null;
    event_date: Date;
  }>(
    `SELECT
      'follow' as event_type,
      person_tracked_screen_name as actor,
      person_tracked_user_id as actor_id,
      date_to as event_date
    FROM people_tracked_possible_signals_by_day
    WHERE signal_profile_user_id = $1
      AND date_to >= CURRENT_DATE - make_interval(days => $2)
      AND is_signal = true`,
    [signalUserId, days]
  );

  // Get LinkedIn connections
  const linkedinConnections = await query<{
    event_type: string;
    actor_id: string | null;
    event_date: Date;
  }>(
    `SELECT
      'linkedin' as event_type,
      person_tracked_urn as actor_id,
      date_to as event_date
    FROM linkedin_people_tracked_possible_signals_by_day
    WHERE signal_profile_urn = $1
      AND date_to >= CURRENT_DATE - make_interval(days => $2)
      AND is_signal = true`,
    [signalUserId, days]
  );

  // Get bio changes
  const bioChanges = await query<{
    event_type: string;
    event_date: Date;
  }>(
    `SELECT
      'bio_change' as event_type,
      date_to as event_date
    FROM bio_people_tracked_possible_signals_by_day
    WHERE signal_profile_user_id = $1
      AND date_to >= CURRENT_DATE - make_interval(days => $2)
      AND is_signal = true`,
    [signalUserId, days]
  );

  // Get stealth events
  const stealthEvents = await query<{
    event_type: string;
    event_date: Date;
    subscription_id: string | null;
    profile_url: string | null;
  }>(
    `SELECT
      'stealth' as event_type,
      date_to as event_date,
      subscription_id,
      profile_url
    FROM stealth_linkedin_people_tracked_possible_signals_by_day
    WHERE rest_id = $1
      AND date_to >= CURRENT_DATE - make_interval(days => $2)
      AND is_signal = true`,
    [signalUserId, days]
  );

  // Combine all events
  const allEvents: SignalEvent[] = [];

  for (const row of follows) {
    allEvents.push({
      eventType: "follow",
      actor: row.actor,
      actorId: row.actor_id,
      eventDate: row.event_date,
      details: null,
    });
  }

  for (const row of linkedinConnections) {
    allEvents.push({
      eventType: "linkedin",
      actor: null,
      actorId: row.actor_id,
      eventDate: row.event_date,
      details: null,
    });
  }

  for (const row of bioChanges) {
    allEvents.push({
      eventType: "bio_change",
      actor: null,
      actorId: null,
      eventDate: row.event_date,
      details: null,
    });
  }

  for (const row of stealthEvents) {
    allEvents.push({
      eventType: "stealth",
      actor: null,
      actorId: null,
      eventDate: row.event_date,
      details: {
        subscriptionId: row.subscription_id,
        profileUrl: row.profile_url,
        type: row.subscription_id?.includes("into") ? "in" : "out",
      },
    });
  }

  // Sort by date (newest first)
  allEvents.sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime());

  return allEvents;
}

/**
 * Bio change record with date.
 */
export interface BioChange {
  userId: string;
  changeDate: Date;
}

/**
 * Get most recent bio change for each user.
 *
 * @param userIds - List of user IDs to check
 * @param days - Number of days to look back
 * @returns Map of user_id -> most recent bio change date
 */
export async function getBioChangesForUsers(
  userIds: string[],
  days: number = 30
): Promise<Map<string, BioChange>> {
  if (!userIds.length) {
    return new Map();
  }

  const rows = await query<{
    signal_profile_user_id: string;
    latest_change: Date;
  }>(
    `SELECT
      signal_profile_user_id,
      MAX(date_to) as latest_change
    FROM bio_people_tracked_possible_signals_by_day
    WHERE signal_profile_user_id = ANY($1)
      AND date_to >= CURRENT_DATE - make_interval(days => $2)
      AND is_signal = true
    GROUP BY signal_profile_user_id`,
    [userIds, days]
  );

  const result = new Map<string, BioChange>();
  for (const row of rows) {
    result.set(row.signal_profile_user_id, {
      userId: row.signal_profile_user_id,
      changeDate: row.latest_change,
    });
  }

  return result;
}

/**
 * Stealth status record.
 */
export interface StealthStatus {
  userId: string;
  type: "in" | "out";
  date: Date;
  profileUrl: string | null;
}

/**
 * Get most recent stealth status for each user.
 *
 * @param userIds - List of user IDs to check
 * @param days - Number of days to look back
 * @returns Map of user_id -> most recent stealth status
 */
export async function getStealthStatusForUsers(
  userIds: string[],
  days: number = 30
): Promise<Map<string, StealthStatus>> {
  if (!userIds.length) {
    return new Map();
  }

  // Get most recent stealth event for each user
  const rows = await query<{
    rest_id: string;
    subscription_id: string | null;
    date_to: Date;
    profile_url: string | null;
  }>(
    `SELECT DISTINCT ON (rest_id)
      rest_id,
      subscription_id,
      date_to,
      profile_url
    FROM stealth_linkedin_people_tracked_possible_signals_by_day
    WHERE rest_id = ANY($1)
      AND date_to >= CURRENT_DATE - make_interval(days => $2)
      AND is_signal = true
    ORDER BY rest_id, date_to DESC`,
    [userIds, days]
  );

  const result = new Map<string, StealthStatus>();
  for (const row of rows) {
    result.set(row.rest_id, {
      userId: row.rest_id,
      type: row.subscription_id?.includes("into") ? "in" : "out",
      date: row.date_to,
      profileUrl: row.profile_url,
    });
  }

  return result;
}
