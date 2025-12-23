import { Tool } from "ai";
import { createFindPeopleTool } from "./find-people";
import { createGetPersonDetailsTool } from "./get-person-details";
import { createGetMyFeedsTool, createGetFeedSignalsTool } from "./feeds";
import { createGetMyGroupsTool, createGetGroupMembersTool } from "./groups";
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
  minTrendingScore?: number;
  recentActivityDays?: number;
  signalDays?: number;
  minBioChangeCount?: number;
  sortBy?: "relevance" | "trending" | "network_connections" | "funding" | "recent_activity";
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
  followedByCount?: number;
  followedBy?: string[];
  followedByDetails?: FollowedByDetail[];
  trendingScore?: number;
  spikeRatio?: number;
  signalsRecent?: number;
  signalsPrevious?: number;
  latestSignalDate?: string;
  recentBioChange?: boolean;
  bioChangeCount?: number;
  firstBioChange?: string;
  stealthStatus?: "in" | "out" | null;
  totalSignals?: number;
  signalBreakdown?: Record<string, number>;
  recentSignals?: number;
  latestActivityDate?: string;
}

export interface WorkExperience {
  company: string;
  title: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
}

export interface FollowedByDetail {
  userId: number;
  screenName: string;
  name: string;
  profileUrl?: string;
}

export interface GetPersonDetailsParams {
  userId?: number;
  screenName?: string;
}

export interface PersonDetails {
  profile: ProfileResult;
  signalTimeline?: SignalEvent[];
  networkConnections?: NetworkConnection[];
}

export interface SignalEvent {
  date: string;
  type: string;
  description?: string;
}

export interface NetworkConnection {
  userId: number;
  screenName: string;
  name: string;
  relationship: "follows" | "followed_by";
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
  trendingScore?: number;
}

export interface AnalyzeNetworkParams {
  analysisType: "trending" | "influencers" | "clusters";
  sectors?: string[];
  locations?: string[];
  days?: number;
  limit?: number;
}

export interface AnalyzeNetworkResult {
  analysisType: string;
  profiles: ProfileResult[];
  insights?: string[];
  metrics?: Record<string, number | string>;
}

// ============================================================================
// Tool creation
// ============================================================================

/**
 * Create all tools with user context and services.
 */
export function createTools(
  services: ToolServices,
  context: UserContext
): Record<string, Tool> {
  return {
    find_people: createFindPeopleTool(services, context),
    get_person_details: createGetPersonDetailsTool(services, context),
    get_my_feeds: createGetMyFeedsTool(services, context),
    get_feed_signals: createGetFeedSignalsTool(services, context),
    get_my_groups: createGetMyGroupsTool(services, context),
    get_group_members: createGetGroupMembersTool(services, context),
    analyze_network: createAnalyzeNetworkTool(services, context),
    find_by_company: createFindByCompanyTool(services, context),
    find_by_investor: createFindByInvestorTool(services, context),
    get_relationship_network: createGetRelationshipNetworkTool(services, context),
    get_aggregated_feed_signals: createGetAggregatedFeedSignalsTool(services, context),
  };
}
