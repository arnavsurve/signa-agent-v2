/**
 * Shared constants for the Signa Agent.
 */

// =============================================================================
// Stealth Mode Subscription IDs
// =============================================================================

/**
 * Subscription IDs that indicate a profile went INTO LinkedIn stealth mode.
 */
export const STEALTH_INTO_SUBSCRIPTION_IDS = [
  "29156",
  "29165",
  "29166",
  "29167",
  "29168",
] as const;

/**
 * Subscription IDs that indicate a profile came OUT OF LinkedIn stealth mode.
 */
export const STEALTH_OUT_SUBSCRIPTION_IDS = [
  "29171",
  "29172",
  "29173",
  "29174",
  "29175",
  "29179",
  "29180",
  "29181",
  "29182",
  "29183",
] as const;

/**
 * Get stealth type from subscription ID.
 */
export function getStealthType(
  subscriptionId: string | null | undefined
): "in" | "out" | null {
  if (!subscriptionId) return null;

  if (
    (STEALTH_INTO_SUBSCRIPTION_IDS as readonly string[]).includes(subscriptionId)
  ) {
    return "in";
  }
  if (
    (STEALTH_OUT_SUBSCRIPTION_IDS as readonly string[]).includes(subscriptionId)
  ) {
    return "out";
  }
  return null;
}

// =============================================================================
// Special Group IDs
// =============================================================================

/**
 * Special group IDs with semantic meaning.
 */
export const SPECIAL_GROUP_IDS = {
  /** Saved/liked profiles */
  SAVED: -1,
  /** Skipped/disliked profiles */
  SKIPPED: -2,
  /** All People Tracked (user's tracked network) */
  ALL_TRACKED: -3,
} as const;

/**
 * Check if a group ID is a special group.
 */
export function isSpecialGroupId(groupId: number): boolean {
  return groupId < 0;
}

/**
 * Separate group IDs into special and regular.
 */
export function filterGroupIds(groupIds: number[]): {
  regular: number[];
  hasSaved: boolean;
  hasSkipped: boolean;
  hasAllTracked: boolean;
} {
  const regular: number[] = [];
  let hasSaved = false;
  let hasSkipped = false;
  let hasAllTracked = false;

  for (const id of groupIds) {
    if (id === SPECIAL_GROUP_IDS.SAVED) {
      hasSaved = true;
    } else if (id === SPECIAL_GROUP_IDS.SKIPPED) {
      hasSkipped = true;
    } else if (id === SPECIAL_GROUP_IDS.ALL_TRACKED) {
      hasAllTracked = true;
    } else if (id > 0) {
      regular.push(id);
    }
  }

  return { regular, hasSaved, hasSkipped, hasAllTracked };
}

// =============================================================================
// Default Values
// =============================================================================

/**
 * Default number of days for activity lookback.
 */
export const DEFAULT_ACTIVITY_DAYS = 30;

/**
 * Default limit for results.
 */
export const DEFAULT_RESULT_LIMIT = 50;

/**
 * Maximum results per query.
 */
export const MAX_RESULT_LIMIT = 500;
