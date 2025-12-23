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
 * Get trending people based on signal velocity.
 */
export async function getTrendingPeople(params: {
  days?: number;
  minSpike?: number;
  limit?: number;
}): Promise<{ user_id: number; trending_score: number }[]> {
  const { days = 7, minSpike = 5, limit = 50 } = params;

  const sql = `
    SELECT
      ptps.person_tracked_user_id as user_id,
      COUNT(*) as trending_score
    FROM people_tracked_possible_signals_by_day ptps
    WHERE ptps.is_signal = true
      AND ptps.date_to >= CURRENT_DATE - make_interval(days => ${days})
    GROUP BY ptps.person_tracked_user_id
    HAVING COUNT(*) >= ${minSpike}
    ORDER BY COUNT(*) DESC
    LIMIT ${limit}
  `;

  return query(sql);
}
