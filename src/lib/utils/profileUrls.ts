/**
 * Profile URL generation utilities.
 * Provides smart URL generation for profiles with fallback logic.
 */

export interface ProfileUrlData {
  userId?: string;
  metadataComplete?: boolean | null;
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
  twitterScreenName?: string | null;
}

/**
 * Generate the best profile URL for a person.
 * Priority order:
 * 1. LinkedIn URL (if available)
 * 2. Twitter URL (if available)
 * 3. Twitter screen name (generate twitter.com URL)
 * 4. Signa search URL (fallback with user_id)
 *
 * @param data - Profile URL data
 * @returns Best available profile URL
 */
export function getProfileUrl(data: ProfileUrlData): string {
  // Try LinkedIn first
  if (data.linkedinUrl) {
    return data.linkedinUrl;
  }

  // Try Twitter URL
  if (data.twitterUrl) {
    return data.twitterUrl;
  }

  // Try Twitter screen name
  if (data.twitterScreenName) {
    return `https://twitter.com/${data.twitterScreenName}`;
  }

  // Fallback to Signa search
  if (data.userId) {
    return `https://app.signa.software/search?user_id=${data.userId}`;
  }

  return "";
}

/**
 * Extract profile URL data from an enriched profile.
 * Use with getProfileUrl() to generate smart URLs.
 *
 * @param profile - Enriched profile object
 * @returns ProfileUrlData for URL generation
 */
export function extractProfileUrlData(profile: {
  user_id?: string;
  metadata_complete?: boolean | null;
  linkedin_url?: string | null;
  twitter_url?: string | null;
  screen_name?: string | null;
}): ProfileUrlData {
  return {
    userId: profile.user_id,
    metadataComplete: profile.metadata_complete,
    linkedinUrl: profile.linkedin_url,
    twitterUrl: profile.twitter_url,
    twitterScreenName: profile.screen_name,
  };
}

/**
 * Generate a Signa app profile URL.
 * This always links to the Signa app's profile page.
 *
 * @param userId - User ID
 * @returns Signa profile URL
 */
export function getSignaProfileUrl(userId: string): string {
  return `https://app.signa.software/search?user_id=${userId}`;
}

/**
 * Generate a Twitter profile URL from screen name.
 *
 * @param screenName - Twitter screen name (without @)
 * @returns Twitter profile URL
 */
export function getTwitterProfileUrl(screenName: string): string {
  return `https://twitter.com/${screenName.replace("@", "")}`;
}

/**
 * Format a name with a profile URL as markdown link.
 *
 * @param name - Display name
 * @param profileUrl - Profile URL
 * @returns Markdown formatted link
 */
export function formatProfileLink(name: string, profileUrl: string): string {
  if (!profileUrl) {
    return name;
  }
  return `[${name}](${profileUrl})`;
}
