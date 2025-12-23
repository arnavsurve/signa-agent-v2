/**
 * RelationshipRepository for querying network relationships from PostgreSQL.
 *
 * Provides access to:
 * - Followed by (outgoing edges): Who does person X follow?
 * - Followers (incoming edges): Who follows person X?
 * - Mutual follows: Bidirectional relationships
 * - Common follows: Intersection of two people's follows
 */

import { query } from "@/lib/db/postgres";

/**
 * Relationship edge data.
 */
export interface RelationshipEdge {
  user_id: string;
  screen_name?: string;
  date_to: Date;
  signal_type: string;
}

/**
 * Mutual follow relationship.
 */
export interface MutualFollow {
  mutual_user_id: string;
  first_date: Date;
  latest_date: Date;
}

/**
 * Common follow (intersection of two people's follows).
 */
export interface CommonFollow {
  common_follow_user_id: string;
  date_to_1: Date;
  date_to_2: Date;
}

/**
 * Get people followed BY this user (outgoing edges).
 *
 * @param userId - Person's user_id (person_tracked_user_id)
 * @param days - Days of history to include
 * @param limit - Maximum results
 * @returns List of people this user follows
 */
export async function getFollowedBy(
  userId: string,
  days: number = 30,
  limit: number = 100
): Promise<RelationshipEdge[]> {
  const sql = `
    SELECT DISTINCT
      signal_profile_user_id as user_id,
      date_to,
      'follow' as signal_type
    FROM people_tracked_possible_signals_by_day
    WHERE person_tracked_user_id = $1
      AND date_to >= CURRENT_DATE - make_interval(days => $2)
      AND is_signal = true
    ORDER BY date_to DESC
    LIMIT $3
  `;

  return query<RelationshipEdge>(sql, [userId, days, limit]);
}

/**
 * Get people who FOLLOW this user (incoming edges).
 *
 * @param userId - Person's user_id (signal_profile_user_id)
 * @param days - Days of history to include
 * @param limit - Maximum results
 * @returns List of people following this user
 */
export async function getFollowers(
  userId: string,
  days: number = 30,
  limit: number = 100
): Promise<RelationshipEdge[]> {
  const sql = `
    SELECT DISTINCT
      person_tracked_user_id as user_id,
      person_tracked_screen_name as screen_name,
      date_to,
      'follow' as signal_type
    FROM people_tracked_possible_signals_by_day
    WHERE signal_profile_user_id = $1
      AND date_to >= CURRENT_DATE - make_interval(days => $2)
      AND is_signal = true
    ORDER BY date_to DESC
    LIMIT $3
  `;

  return query<RelationshipEdge>(sql, [userId, days, limit]);
}

/**
 * Get people with bidirectional follow relationships.
 *
 * @param userId - Person's user_id
 * @param days - Days of history to include
 * @param limit - Maximum results
 * @returns List of mutual follows
 */
export async function getMutualFollows(
  userId: string,
  days: number = 30,
  limit: number = 100
): Promise<MutualFollow[]> {
  const sql = `
    WITH outgoing AS (
      SELECT DISTINCT signal_profile_user_id as connected_user_id,
             MIN(date_to) as first_date_out,
             MAX(date_to) as latest_date_out
      FROM people_tracked_possible_signals_by_day
      WHERE person_tracked_user_id = $1
        AND date_to >= CURRENT_DATE - make_interval(days => $2)
        AND is_signal = true
      GROUP BY signal_profile_user_id
    ),
    incoming AS (
      SELECT DISTINCT person_tracked_user_id as connected_user_id,
             MIN(date_to) as first_date_in,
             MAX(date_to) as latest_date_in
      FROM people_tracked_possible_signals_by_day
      WHERE signal_profile_user_id = $1
        AND date_to >= CURRENT_DATE - make_interval(days => $2)
        AND is_signal = true
      GROUP BY person_tracked_user_id
    )
    SELECT
      o.connected_user_id as mutual_user_id,
      LEAST(o.first_date_out, i.first_date_in) as first_date,
      GREATEST(o.latest_date_out, i.latest_date_in) as latest_date
    FROM outgoing o
    JOIN incoming i ON o.connected_user_id = i.connected_user_id
    ORDER BY latest_date DESC
    LIMIT $3
  `;

  return query<MutualFollow>(sql, [userId, days, limit]);
}

/**
 * Get people followed by BOTH users (intersection).
 *
 * @param userId1 - First person's user_id
 * @param userId2 - Second person's user_id
 * @param days - Days of history to include
 * @param limit - Maximum results
 * @returns List of common follows
 */
export async function getCommonFollows(
  userId1: string,
  userId2: string,
  days: number = 30,
  limit: number = 100
): Promise<CommonFollow[]> {
  const sql = `
    SELECT
      p1.signal_profile_user_id as common_follow_user_id,
      MAX(p1.date_to) as date_to_1,
      MAX(p2.date_to) as date_to_2
    FROM people_tracked_possible_signals_by_day p1
    JOIN people_tracked_possible_signals_by_day p2
      ON p1.signal_profile_user_id = p2.signal_profile_user_id
    WHERE p1.person_tracked_user_id = $1
      AND p2.person_tracked_user_id = $2
      AND p1.is_signal = true
      AND p2.is_signal = true
      AND p1.date_to >= CURRENT_DATE - make_interval(days => $3)
      AND p2.date_to >= CURRENT_DATE - make_interval(days => $3)
    GROUP BY p1.signal_profile_user_id
    ORDER BY GREATEST(MAX(p1.date_to), MAX(p2.date_to)) DESC
    LIMIT $4
  `;

  return query<CommonFollow>(sql, [userId1, userId2, days, limit]);
}

/**
 * Get count of relationships for a user.
 *
 * @param userId - Person's user_id
 * @param relationship - "followed_by" or "followers"
 * @param days - Days of history
 * @returns Count of relationships
 */
export async function getFollowCount(
  userId: string,
  relationship: "followed_by" | "followers" = "followed_by",
  days: number = 30
): Promise<number> {
  const sql =
    relationship === "followed_by"
      ? `
        SELECT COUNT(DISTINCT signal_profile_user_id) as count
        FROM people_tracked_possible_signals_by_day
        WHERE person_tracked_user_id = $1
          AND date_to >= CURRENT_DATE - make_interval(days => $2)
          AND is_signal = true
      `
      : `
        SELECT COUNT(DISTINCT person_tracked_user_id) as count
        FROM people_tracked_possible_signals_by_day
        WHERE signal_profile_user_id = $1
          AND date_to >= CURRENT_DATE - make_interval(days => $2)
          AND is_signal = true
      `;

  const result = await query<{ count: string }>(sql, [userId, days]);
  return parseInt(result[0]?.count || "0", 10);
}

/**
 * Get network followers for a list of signal users.
 * Returns who from the user's network follows each signal person.
 *
 * @param signalUserIds - List of people to check
 * @param userId - User whose network to check
 * @returns Map of signal_user_id -> list of followers from network
 */
export async function getNetworkFollowersForSignals(
  signalUserIds: string[],
  userId: number
): Promise<Record<string, Array<{ user_id: string; screen_name?: string; followed_date: Date }>>> {
  if (!signalUserIds.length) {
    return {};
  }

  const sql = `
    SELECT
      ptps.signal_profile_user_id,
      ptps.person_tracked_user_id as user_id,
      ptps.person_tracked_screen_name as screen_name,
      ptps.date_to as followed_date
    FROM people_tracked_possible_signals_by_day ptps
    JOIN user_people_tracked upt
      ON ptps.person_tracked_user_id = upt.rest_id
    WHERE upt.user_id = $1
      AND ptps.signal_profile_user_id = ANY($2)
      AND ptps.is_signal = true
    ORDER BY ptps.date_to DESC
  `;

  const rows = await query<{
    signal_profile_user_id: string;
    user_id: string;
    screen_name: string | null;
    followed_date: Date;
  }>(sql, [userId, signalUserIds]);

  const result: Record<string, Array<{ user_id: string; screen_name?: string; followed_date: Date }>> = {};

  for (const row of rows) {
    const signalId = row.signal_profile_user_id;
    if (!result[signalId]) {
      result[signalId] = [];
    }
    result[signalId].push({
      user_id: row.user_id,
      screen_name: row.screen_name || undefined,
      followed_date: row.followed_date,
    });
  }

  return result;
}
