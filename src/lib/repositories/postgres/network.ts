import { query } from "@/lib/db/postgres";

/**
 * Tracked person record.
 */
export interface TrackedPerson {
  id: number;
  user_id: number;
  tracked_user_id: number;
  screen_name: string;
  name: string;
  created_at: Date;
}

/**
 * User group record.
 */
export interface UserGroup {
  id: number;
  name: string;
  description: string | null;
  user_id: number;
  created_at: Date;
}

/**
 * User feed record.
 */
export interface UserFeed {
  id: number;
  name: string;
  filters: Record<string, unknown>;
  user_id: number;
  created_at: Date;
}

/**
 * Get tracked people for a user.
 */
export async function getTrackedPeople(userId: number): Promise<TrackedPerson[]> {
  return query<TrackedPerson>(
    `SELECT
      id,
      user_id,
      tracked_user_id,
      screen_name,
      name,
      created_at
    FROM user_people_tracked
    WHERE user_id = $1
    ORDER BY created_at DESC`,
    [userId]
  );
}

/**
 * Get tracked people user IDs for a user.
 */
export async function getTrackedPeopleIds(userId: number): Promise<number[]> {
  const rows = await query<{ tracked_user_id: number }>(
    `SELECT tracked_user_id FROM user_people_tracked WHERE user_id = $1`,
    [userId]
  );
  return rows.map((r) => r.tracked_user_id);
}

/**
 * Get groups for a user.
 */
export async function getUserGroups(userId: number): Promise<UserGroup[]> {
  return query<UserGroup>(
    `SELECT
      g.id,
      g.title as name,
      NULL::text as description,
      utsg.user_id,
      g.created_at
    FROM user_to_signal_groups utsg
    JOIN groups g ON utsg.group_id = g.id
    WHERE utsg.user_id = $1
    ORDER BY g.title`,
    [userId]
  );
}

/**
 * Get members of a group.
 */
export async function getGroupMembers(
  groupId: number,
  userId: number
): Promise<{ user_id: number; screen_name: string; name: string }[]> {
  return query(
    `SELECT
      sg.signal_profile_user_id as user_id,
      tp.screen_name as screen_name,
      tp.screen_name as name
    FROM signal_groups sg
    JOIN user_to_signal_groups utsg ON sg.group_id = utsg.group_id
    LEFT JOIN tracked_people tp ON sg.signal_profile_user_id = tp.rest_id
    WHERE utsg.group_id = $1 AND utsg.user_id = $2`,
    [groupId, userId]
  );
}

/**
 * Get feeds for a user.
 */
export async function getUserFeeds(userId: number): Promise<UserFeed[]> {
  return query<UserFeed>(
    `SELECT
      f.id,
      f.title as name,
      f.filters,
      utf.user_id,
      f.created_at
    FROM feeds f
    JOIN user_to_feeds utf ON f.id = utf.feed_id
    WHERE utf.user_id = $1
    ORDER BY f.created_at DESC`,
    [userId]
  );
}

/**
 * Get user's signal preferences (liked/disliked signals).
 */
export async function getUserSignalPreferences(
  userId: number
): Promise<{ liked: number[]; disliked: number[] }> {
  const rows = await query<{ signal_user_id: number; status: string }>(
    `SELECT signal_user_id, status
    FROM user_signal_status
    WHERE user_id = $1`,
    [userId]
  );

  const liked: number[] = [];
  const disliked: number[] = [];

  for (const row of rows) {
    if (row.status === "liked") {
      liked.push(row.signal_user_id);
    } else if (row.status === "disliked") {
      disliked.push(row.signal_user_id);
    }
  }

  return { liked, disliked };
}
