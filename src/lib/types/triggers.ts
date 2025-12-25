/**
 * Trigger types and interfaces for the signal aggregation system.
 */

// =============================================================================
// Core Trigger Types
// =============================================================================

/**
 * Types of signals/triggers that can be detected.
 */
export type TriggerType =
  | "twitter_follow" // Someone followed someone on Twitter
  | "twitter_followed_by" // Someone was followed by someone on Twitter
  | "linkedin_connection" // New LinkedIn connection (bidirectional)
  | "bio_change" // Bio/headline updated
  | "stealth_in" // Went into LinkedIn stealth mode
  | "stealth_out" // Came out of LinkedIn stealth mode
  | "free_agent"; // Left company / became free agent

/**
 * A single trigger entry representing one event.
 */
export interface TriggerEntry {
  userId: string;
  triggerType: TriggerType;
  date: string; // ISO date string

  // Additional context per trigger type
  relatedUserId?: string; // For follow/connection events
  direction?: "outgoing" | "incoming";
  stealthType?: "in" | "out";
}

// =============================================================================
// Trigger Query Results
// =============================================================================

/**
 * Result from a single trigger query.
 */
export interface TriggerQueryResult {
  triggerType: TriggerType;
  userIds: string[];
  dates: Map<string, string>; // userId -> most recent date

  // Trigger-specific metadata
  stealthEvents?: StealthEvent[];
  connectionData?: ConnectionData;
}

/**
 * Stealth event details.
 */
export interface StealthEvent {
  userId: string;
  date: string;
  type: "in" | "out";
  linkedinUrl?: string;
}

/**
 * LinkedIn connection identifier.
 */
export interface ConnectionIdentifier {
  linkedinUrn: string | null;
  restId: string | null;
  date: string;
  direction: "outgoing" | "incoming";
}

/**
 * Connection data from LinkedIn trigger query.
 */
export interface ConnectionData {
  connectionsByProfile: Map<string, ConnectionIdentifier[]>;
  urnToUserIdMap: Map<string, string>;
  userIdToUrnMap: Map<string, string>;
  allowedIdentifiers?: Set<string>;
}

/**
 * Merged result from multiple trigger queries.
 */
export interface MergedTriggerResult {
  entries: TriggerEntry[];
  datesByUserId: Map<string, string>;
  triggersByUserId: Map<string, TriggerType[]>;
  metadata?: {
    totalTriggersActive: number;
    connectionData?: ConnectionData;
  };
}

// =============================================================================
// Activity Events (for timeline display)
// =============================================================================

/**
 * A person related to an activity event.
 */
export interface RelatedPerson {
  userId: string;
  screenName?: string;
  name: string;
  headline?: string;
  profileUrl: string;
  profileImageUrl?: string;
  linkedinUrl?: string;
  connectionDate: string;
  direction: "outgoing" | "incoming";
  source: "twitter" | "linkedin";
}

/**
 * Bio change details.
 */
export interface BioChange {
  before: string;
  after: string;
  date: string;
}

/**
 * Free agent details.
 */
export interface FreeAgentDetails {
  previousCompany?: string;
  previousTitle?: string;
  companyLogo?: string;
  signalDate: string;
}

/**
 * Stealth details.
 */
export interface StealthDetails {
  type: "in" | "out";
  linkedinUrl?: string;
}

/**
 * A single activity event in a person's timeline.
 */
export interface ActivityEvent {
  eventType: TriggerType;
  date: string;

  // For relationship events (follow, connection)
  relatedPerson?: {
    userId: string;
    screenName?: string;
    name: string;
    headline?: string;
    profileUrl: string;
    profileImageUrl?: string;
    direction: "outgoing" | "incoming" | "mutual";
  };

  // For bio changes
  bioChange?: BioChange;

  // For stealth
  stealthDetails?: StealthDetails;

  // For free agent
  freeAgentDetails?: FreeAgentDetails;
}

/**
 * Summary of a person's activity.
 */
export interface ActivitySummary {
  twitterFollowersCount: number;
  twitterFollowingCount: number;
  linkedinConnectionsCount: number;
  bioChangesCount: number;
  hasStealth: boolean;
  stealthStatus: "in" | "out" | null;
  isFreeAgent: boolean;
  lastActivityDate?: string;
}

/**
 * Complete activity data for a person.
 */
export interface PersonActivity {
  twitterFollowers: RelatedPerson[];
  twitterFollowing: RelatedPerson[];
  linkedinConnections: RelatedPerson[];
  bioChanges: BioChange[];
  activity: ActivityEvent[];
  summary: ActivitySummary;
  freeAgentDetails?: FreeAgentDetails;
}

// =============================================================================
// Trigger Filters
// =============================================================================

/**
 * Filters for processing triggers.
 */
export interface TriggerFilters {
  // Date range
  dateFrom?: string;
  dateTo?: string;
  days?: number; // Alternative: last N days

  // Which triggers to run
  twitterFollow?: boolean;
  linkedinConnection?: boolean;
  bioChange?: boolean;
  stealth?: ("in" | "out")[];
  freeAgent?: boolean;

  // Group-based filtering
  groupIds?: number[]; // For followed_by_groups trigger
  linkedinGroupIds?: number[]; // For linkedin_connections filter

  // Convenience flag
  allTriggers?: boolean; // Enable all triggers
}

/**
 * Internal filters used by trigger queries.
 */
export interface TriggerQueryFilters {
  dateFrom?: string;
  dateTo?: string;
  userId?: number;
  tags?: string[];
  excludeInteracted?: boolean;
}
