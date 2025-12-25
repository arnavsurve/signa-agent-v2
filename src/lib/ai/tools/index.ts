import { Tool } from "ai";
import { createFindPeopleTool } from "./find-people";
import { createGetPersonActivityTool } from "./get-person-activity";
import { createGetMyFeedsTool, createGetFeedSignalsTool } from "./feeds";
import { createGetMyGroupsTool, createGetGroupMembersTool } from "./groups";

// Legacy imports - kept for backward compatibility, can be removed later
import { createGetPersonDetailsTool } from "./get-person-details";
import { createAnalyzeNetworkTool } from "./analyze-network";
import { createFindByCompanyTool } from "./find-by-company";
import { createFindByInvestorTool } from "./find-by-investor";
import { createGetRelationshipNetworkTool } from "./get-relationship-network";
import { createGetAggregatedFeedSignalsTool } from "./get-aggregated-feed-signals";

/**
 * User context passed to tools for authorization and personalization.
 */
export interface UserContext {
  userId: number;
  conversationId: string;
}

/**
 * Services available to tools for data access.
 */
export interface ToolServices {
  // These will be implemented as we build out the services
  searchPeople: (params: SearchPeopleParams) => Promise<SearchPeopleResult>;
  getPersonDetails: (params: GetPersonDetailsParams) => Promise<PersonDetails | null>;
  getPersonActivity: (params: GetPersonActivityParams) => Promise<PersonActivityResult | null>;
  getUserFeeds: (userId: number) => Promise<Feed[]>;
  getFeedSignals: (feedId: number, userId: number, limit?: number) => Promise<FeedSignal[]>;
  getUserGroups: (userId: number) => Promise<Group[]>;
  getGroupMembers: (groupId: number, userId: number) => Promise<GroupMember[]>;
  analyzeNetwork: (params: AnalyzeNetworkParams) => Promise<AnalyzeNetworkResult>;
}

// ============================================================================
// Type definitions for tool parameters and results
// ============================================================================

export interface SearchPeopleParams {
  query?: string;
  locations?: string[];
  sectors?: string[];
  profileTypes?: string[];
  stages?: string[];
  companies?: string[];
  universities?: string[];
  investors?: string[];
  jobTitles?: string[];
  minFunding?: number;
  maxFunding?: number;
  inMyNetwork?: boolean;
  recentBioChange?: boolean;
  stealthStatus?: "in" | "out" | null;
  minNetworkConnections?: number;
  recentActivityDays?: number;
  signalDays?: number;
  minBioChangeCount?: number;
  sortBy?: "relevance" | "network_connections" | "funding" | "recent_activity";
  limit?: number;
  page?: number;
  userId?: number;
}

export interface SearchPeopleResult {
  results: ProfileResult[];
  totalCount: number;
  originalCount?: number;
  page: number;
  hasMorePages: boolean;
  totalPages: number;
}

export interface ProfileResult {
  userId: number;
  screenName: string;
  name: string;
  description?: string;
  profileImageUrl?: string;
  followersCount?: number;
  location?: string;
  profileType?: string;
  headline?: string;
  sectors?: string[];
  locations?: string[];
  jobTitles?: string[];
  workExperience?: WorkExperience[];
  universities?: string[];
  investors?: string[];
  amountRaised?: number;
  stages?: string[];
  isTechnical?: boolean;
  linkedinUrl?: string;
  crunchbaseUrl?: string;
  profileUrl?: string;
  // Signal context
  followedByCount?: number;
  followedBy?: string[];
  followedByDetails?: FollowedByDetail[];
  signalsRecent?: number;
  latestSignalDate?: string;
  recentBioChange?: boolean;
  recentBioChangeDate?: string;
  bioChangeCount?: number;
  firstBioChange?: string;
  stealthStatus?: "in" | "out" | null;
  totalSignals?: number;
  signalBreakdown?: Record<string, number>;
  recentSignals?: number;
  latestActivityDate?: string;
  relevanceScore?: number;
}

export interface WorkExperience {
  company: string;
  title: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
}

export interface FollowedByDetail {
  userId: number | string;
  screenName?: string;
  name: string;
  profileUrl?: string;
  profileImageUrl?: string;
}

export interface GetPersonDetailsParams {
  userId?: number;
  screenName?: string;
  includeTimeline?: boolean;
  includeNetworkConnections?: boolean;
}

export interface PersonDetails {
  profile: ProfileResult;
  signalTimeline?: SignalEvent[];
  networkConnections?: NetworkConnection[];
}

export interface SignalEvent {
  eventType: string;
  actor?: string;
  actorId?: string;
  eventDate: string;
  details?: Record<string, unknown>;
}

export interface NetworkConnection {
  userId: number | string;
  screenName?: string;
  name: string;
  profileUrl?: string;
  followedDate?: string;
}

export interface Feed {
  id: number;
  name: string;
  filters: Record<string, unknown>;
  createdAt: Date;
}

export interface FeedSignal {
  userId: number;
  screenName: string;
  name: string;
  signalType: string;
  signalDate: string;
  details?: Record<string, unknown>;
}

export interface Group {
  id: number;
  name: string;
  description?: string;
  memberCount?: number;
  createdAt: Date;
}

export interface GroupMember {
  userId: number;
  screenName: string;
  name: string;
  headline?: string;
  profileUrl?: string;
  profileImageUrl?: string;
  // Signal context
  followedByCount?: number;
  followedBy?: string[];
  followedByDetails?: FollowedByDetail[];
  recentBioChange?: boolean;
  recentBioChangeDate?: string;
  totalSignals?: number;
  relevanceScore?: number;
}

export interface AnalyzeNetworkParams {
  analysisType: "influencers" | "clusters";
  sectors?: string[];
  locations?: string[];
  limit?: number;
}

export interface AnalyzeNetworkResult {
  analysisType: string;
  profiles: ProfileResult[];
  insights?: string[];
  metrics?: Record<string, number | string>;
}

// ============================================================================
// Person Activity Types
// ============================================================================

export interface GetPersonActivityParams {
  userId?: string;
  screenName?: string;
  days?: number;
  includeTwitter?: boolean;
  includeLinkedin?: boolean;
  includeBio?: boolean;
  includeStealth?: boolean;
  includeFreeAgent?: boolean;
  maxBioChanges?: number;
  requestingUserId: number;
}

export interface PersonActivityResult {
  profile: ProfileResult;
  twitterFollowers: RelatedPersonResult[];
  twitterFollowing: RelatedPersonResult[];
  linkedinConnections: RelatedPersonResult[];
  bioChanges: BioChangeResult[];
  stealthStatus: StealthStatusResult | null;
  freeAgentDetails: FreeAgentResult | null;
  activity: ActivityEventResult[];
  summary: ActivitySummaryResult;
}

export interface RelatedPersonResult {
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

export interface BioChangeResult {
  before: string;
  after: string;
  date: string;
}

export interface StealthStatusResult {
  type: "in" | "out";
  date: string;
  linkedinUrl?: string;
}

export interface FreeAgentResult {
  previousCompany?: string;
  previousTitle?: string;
  signalDate: string;
}

export interface ActivityEventResult {
  eventType: string;
  date: string;
  relatedPerson?: {
    userId: string;
    screenName?: string;
    name: string;
    headline?: string;
    profileUrl: string;
    profileImageUrl?: string;
    direction: "outgoing" | "incoming" | "mutual";
  };
  bioChange?: BioChangeResult;
  stealthDetails?: { type: "in" | "out"; linkedinUrl?: string };
  freeAgentDetails?: FreeAgentResult;
}

export interface ActivitySummaryResult {
  twitterFollowersCount: number;
  twitterFollowingCount: number;
  linkedinConnectionsCount: number;
  bioChangesCount: number;
  hasStealth: boolean;
  stealthStatus: "in" | "out" | null;
  isFreeAgent: boolean;
  lastActivityDate?: string;
}

// ============================================================================
// Tool creation
// ============================================================================

/**
 * Create the core consolidated tool set (6 tools).
 *
 * This is the recommended tool set for production use:
 * 1. find_people - Search profiles with filters and signal context
 * 2. get_person_activity - Complete activity for a person (replaces get_person_details, get_relationship_network)
 * 3. get_my_feeds - List user's saved feeds
 * 4. get_feed_signals - Get signals from a feed (aka get_feed_activity)
 * 5. get_my_groups - List user's groups
 * 6. get_group_members - Get group members with signals (aka get_group_activity)
 */
export function createTools(
  services: ToolServices,
  context: UserContext
): Record<string, Tool> {
  return {
    // Core tools (recommended)
    find_people: createFindPeopleTool(services, context),
    get_person_activity: createGetPersonActivityTool(services, context),
    get_my_feeds: createGetMyFeedsTool(services, context),
    get_feed_signals: createGetFeedSignalsTool(services, context),
    get_my_groups: createGetMyGroupsTool(services, context),
    get_group_members: createGetGroupMembersTool(services, context),
  };
}

/**
 * Create the full tool set including legacy tools.
 *
 * Use this for backward compatibility. The legacy tools are:
 * - get_person_details: Replaced by get_person_activity
 * - analyze_network: Useful for influencer/cluster analysis
 * - find_by_company: Use find_people with companies filter instead
 * - find_by_investor: Use find_people with investors filter instead
 * - get_relationship_network: Replaced by get_person_activity
 * - get_aggregated_feed_signals: For cross-feed aggregation
 */
export function createAllTools(
  services: ToolServices,
  context: UserContext
): Record<string, Tool> {
  return {
    // Core tools
    ...createTools(services, context),

    // Legacy tools (for backward compatibility)
    get_person_details: createGetPersonDetailsTool(services, context),
    analyze_network: createAnalyzeNetworkTool(services, context),
    find_by_company: createFindByCompanyTool(services, context),
    find_by_investor: createFindByInvestorTool(services, context),
    get_relationship_network: createGetRelationshipNetworkTool(services, context),
    get_aggregated_feed_signals: createGetAggregatedFeedSignalsTool(services, context),
  };
}
