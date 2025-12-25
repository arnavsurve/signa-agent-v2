/**
 * LinkedIn URN utilities for ID normalization and mapping.
 *
 * LinkedIn identifiers can come in multiple formats:
 * - Raw URN: ACoAADQvJI0BZ3Xmunvru9VCLWLTdHd6U2CYnzg
 * - Prefixed: linkedin_ACoAADQvJI0B...
 * - Full URN: urn:li:fsd_profile:ACoAADQvJI0B...
 * - Twitter rest_id: 1760723449503469569
 *
 * These utilities normalize and convert between formats.
 */

import { EnrichedProfile } from "@/lib/repositories/mongodb/profiles";

// =============================================================================
// Canonicalization
// =============================================================================

/**
 * Canonicalize any LinkedIn ID format to raw URN identifier.
 * Returns null if the ID doesn't appear to be a LinkedIn identifier.
 *
 * @param id - Any LinkedIn ID format
 * @returns Raw URN identifier (e.g., "ACoAADQvJI0B...") or null
 */
export function canonicalizeLinkedInId(id: string | null | undefined): string | null {
  if (!id) return null;

  const trimmed = id.trim();
  if (!trimmed) return null;

  // Remove linkedin_ prefix recursively
  if (trimmed.startsWith("linkedin_")) {
    return canonicalizeLinkedInId(trimmed.slice(9));
  }

  // Remove linkedin: or linkedin- prefix
  if (trimmed.startsWith("linkedin:") || trimmed.startsWith("linkedin-")) {
    return canonicalizeLinkedInId(trimmed.slice(9));
  }

  // Handle urn:li:* prefixes
  const urnMatch = trimmed.match(
    /^urn:li:(?:fs_miniProfile|fsd_profile|people):(.+)$/i
  );
  if (urnMatch) {
    return urnMatch[1];
  }

  // Already a raw identifier (starts with ACoA...)
  if (trimmed.startsWith("ACoA")) {
    return trimmed;
  }

  // Could be a numeric Twitter ID - return as-is for now
  // The caller can decide if this is valid
  return trimmed;
}

/**
 * Check if an ID appears to be a LinkedIn identifier.
 */
export function isLinkedInId(id: string | null | undefined): boolean {
  if (!id) return false;

  const trimmed = id.trim().toLowerCase();

  return (
    trimmed.startsWith("linkedin_") ||
    trimmed.startsWith("linkedin:") ||
    trimmed.startsWith("linkedin-") ||
    trimmed.startsWith("urn:li:") ||
    trimmed.startsWith("acoa")
  );
}

/**
 * Check if an ID appears to be a Twitter/numeric ID.
 */
export function isTwitterId(id: string | null | undefined): boolean {
  if (!id) return false;
  return /^\d+$/.test(id.trim());
}

// =============================================================================
// Prefix Management
// =============================================================================

/**
 * Ensure linkedin_ prefix is present.
 *
 * @param urn - LinkedIn URN (raw or prefixed)
 * @returns URN with linkedin_ prefix
 */
export function ensureLinkedinPrefix(urn: string): string {
  if (urn.startsWith("linkedin_")) return urn;
  const canonical = canonicalizeLinkedInId(urn);
  return `linkedin_${canonical || urn}`;
}

/**
 * Remove linkedin_ prefix if present.
 */
export function removeLinkedinPrefix(urn: string): string {
  if (urn.startsWith("linkedin_")) {
    return urn.slice(9);
  }
  return urn;
}

// =============================================================================
// Variant Generation
// =============================================================================

/**
 * Generate all variants of a LinkedIn identifier for matching.
 * Used to build a set of allowed identifiers that can match any format.
 *
 * @param id - Any LinkedIn ID format
 * @returns Array of all possible variants (lowercase)
 */
export function getAllLinkedInIdVariants(id: string): string[] {
  const canonical = canonicalizeLinkedInId(id);
  if (!canonical) return [];

  const lower = canonical.toLowerCase();
  return [
    lower,
    `linkedin_${lower}`,
    `linkedin:${lower}`,
    `linkedin-${lower}`,
    `urn:li:fsd_profile:${lower}`,
    `urn:li:fs_miniprofile:${lower}`,
    `urn:li:people:${lower}`,
  ];
}

/**
 * Build a set of all allowed LinkedIn identifier variants.
 * Used for filtering connections to only those in the user's network.
 *
 * @param ids - Array of user IDs (can be Twitter IDs or LinkedIn URNs)
 * @returns Set of all variant forms (lowercase)
 */
export function buildAllowedLinkedInIdentifierSet(ids: string[]): Set<string> {
  const variants = new Set<string>();

  for (const id of ids) {
    // Add the ID itself (lowercase)
    variants.add(id.toLowerCase());

    // If it looks like a LinkedIn ID, add all variants
    if (isLinkedInId(id)) {
      for (const variant of getAllLinkedInIdVariants(id)) {
        variants.add(variant);
      }
    }
  }

  return variants;
}

// =============================================================================
// ID Mapping
// =============================================================================

/**
 * Build a map of user_id -> LinkedIn URN.
 *
 * For LinkedIn-prefixed IDs, canonicalizes directly.
 * For Twitter IDs, looks up the linkedin_urn from the profile.
 *
 * @param userIds - Array of user IDs (Twitter or LinkedIn)
 * @param findProfilesByUserIds - Function to fetch profiles from MongoDB
 * @returns Map of user_id -> canonical LinkedIn URN
 */
export async function buildIdToUrnMap(
  userIds: string[],
  findProfilesByUserIds: (
    ids: string[]
  ) => Promise<Array<{ user_id: string; linkedin_urn?: string }>>
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  // Separate LinkedIn IDs (already have URN) from Twitter IDs (need lookup)
  const twitterIds: string[] = [];

  for (const id of userIds) {
    if (isLinkedInId(id)) {
      const canonical = canonicalizeLinkedInId(id);
      if (canonical) {
        result.set(id, canonical);
      }
    } else if (isTwitterId(id)) {
      twitterIds.push(id);
    }
  }

  // Batch lookup Twitter IDs in MongoDB
  if (twitterIds.length > 0) {
    try {
      const profiles = await findProfilesByUserIds(twitterIds);
      for (const profile of profiles) {
        const linkedinUrn =
          (profile as EnrichedProfile).linkedin_urn ||
          (profile as unknown as { enriched_data?: { linkedin_urn?: string } })
            ?.enriched_data?.linkedin_urn;

        if (linkedinUrn) {
          const canonical = canonicalizeLinkedInId(linkedinUrn);
          if (canonical) {
            result.set(profile.user_id, canonical);
          }
        }
      }
    } catch (error) {
      console.error("[buildIdToUrnMap] Error fetching profiles:", error);
    }
  }

  return result;
}

/**
 * Build a reverse map of LinkedIn URN -> user_id.
 */
export function buildUrnToIdMap(
  idToUrnMap: Map<string, string>
): Map<string, string> {
  const result = new Map<string, string>();

  for (const [userId, urn] of idToUrnMap) {
    // Add the canonical URN
    result.set(urn.toLowerCase(), userId);

    // Also add prefixed variants for robust matching
    result.set(`linkedin_${urn.toLowerCase()}`, userId);
  }

  return result;
}

// =============================================================================
// Connection Filtering
// =============================================================================

/**
 * Check if a connection identifier is in the allowed set.
 *
 * @param identifier - Connection identifier with linkedinUrn and/or restId
 * @param allowedIdentifiers - Set of allowed identifier variants
 * @returns true if the connection is allowed
 */
export function isConnectionAllowed(
  identifier: { linkedinUrn?: string | null; restId?: string | null },
  allowedIdentifiers: Set<string>
): boolean {
  if (allowedIdentifiers.size === 0) {
    // If no filter, allow all
    return true;
  }

  // Check LinkedIn URN variants
  if (identifier.linkedinUrn) {
    const variants = getAllLinkedInIdVariants(identifier.linkedinUrn);
    for (const variant of variants) {
      if (allowedIdentifiers.has(variant)) {
        return true;
      }
    }
  }

  // Check rest_id
  if (identifier.restId) {
    if (allowedIdentifiers.has(identifier.restId.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Filter connections to only those in the allowed set.
 *
 * @param connectionsByProfile - Map of profile URN -> connection identifiers
 * @param allowedIdentifiers - Set of allowed identifier variants
 * @returns Filtered map
 */
export function filterConnectionsByAllowedIdentifiers<
  T extends { linkedinUrn?: string | null; restId?: string | null }
>(
  connectionsByProfile: Map<string, T[]>,
  allowedIdentifiers: Set<string>
): Map<string, T[]> {
  if (allowedIdentifiers.size === 0) {
    return new Map(connectionsByProfile);
  }

  const filtered = new Map<string, T[]>();

  for (const [profileUrn, connections] of connectionsByProfile) {
    const allowedConnections = connections.filter((conn) =>
      isConnectionAllowed(conn, allowedIdentifiers)
    );

    if (allowedConnections.length > 0) {
      filtered.set(profileUrn, allowedConnections);
    }
  }

  return filtered;
}
