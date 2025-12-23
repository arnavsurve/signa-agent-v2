import { getPrimaryDb } from "@/lib/db/mongodb";

const COLLECTION = "twitter-new-followings-profiles";

/**
 * Location normalization mapping (user input → database format)
 */
const LOCATION_ALIASES: Record<string, string> = {
  "san francisco": "SF",
  sf: "SF",
  "bay area": "SF",
  "new york": "NYC",
  "new york city": "NYC",
  nyc: "NYC",
  "los angeles": "LA",
  la: "LA",
};

/**
 * Raw profile document from MongoDB (matches actual database structure)
 */
export interface RawProfile {
  user_id: string;
  screen_name: string;
  name: string;
  profile_image_url?: string;
  description?: string;
  location?: string;
  followers_count?: number;
  enriched_data?: {
    type?: string;
    founder_name?: string;
    name?: string;
    headline?: string;
    sectors?: string[];
    locations?: string[];
    stages?: string[];
    investors?: string[];
    universities?: string[];
    work_experience?: string[];
    job_titles?: string[];
    tags?: string[];
    amount_raised?: number;
    is_technical?: boolean;
    linkedin_url?: string;
    linkedin_urn?: string;
    crunchbase_url?: string;
  };
  metadata?: {
    complete?: boolean;
    created_at?: Date;
  };
}

/**
 * Enriched profile returned to callers (flattened structure)
 */
export interface EnrichedProfile {
  user_id: string;
  screen_name: string;
  name: string;
  profile_image_url?: string;
  headline?: string;
  description?: string;
  location?: string;
  followers_count?: number;
  // Enriched data
  profile_type?: string;
  sectors?: string[];
  locations?: string[];
  stages?: string[];
  investors?: string[];
  universities?: string[];
  work_experience?: string[];
  job_titles?: string[];
  amount_raised?: number;
  is_technical?: boolean;
  linkedin_url?: string;
  crunchbase_url?: string;
  // Signal context (populated by enrichment)
  trending_score?: number;
  followed_by_count?: number;
  stealth_status?: string;
  recent_bio_change?: boolean;
  total_signals?: number;
  profile_url?: string;
}

/**
 * Search parameters for profiles
 */
export interface SearchProfilesParams {
  // Text search
  query?: string;
  // Classification filters
  profile_types?: string[];
  stages?: string[];
  sectors?: string[];
  // Professional filters
  locations?: string[];
  investors?: string[];
  universities?: string[];
  companies?: string[];
  job_titles?: string[];
  // Numeric filters
  min_funding?: number;
  max_funding?: number;
  min_followers?: number;
  max_followers?: number;
  // Boolean filters
  is_technical?: boolean;
  // User filters
  user_ids?: string[];
  exclude_user_ids?: string[];
  // Pagination
  page?: number;
  limit?: number;
  // Sorting
  sort_by?: "relevance" | "trending" | "network_connections" | "funding" | "recent_activity";
}

/**
 * Search results with pagination metadata
 */
export interface SearchResult {
  results: EnrichedProfile[];
  total_count: number;
  page: number;
  limit: number;
  has_more: boolean;
}

/**
 * Normalize location names for database matching.
 */
function normalizeLocation(location: string): string {
  const lower = location.toLowerCase().trim();
  return LOCATION_ALIASES[lower] || location;
}

/**
 * Transform raw MongoDB profile to enriched profile format.
 */
function transformProfile(raw: RawProfile): EnrichedProfile {
  const enriched = raw.enriched_data || {};

  return {
    user_id: raw.user_id,
    screen_name: raw.screen_name,
    name: enriched.founder_name || enriched.name || raw.name,
    profile_image_url: raw.profile_image_url,
    headline: enriched.headline,
    description: raw.description,
    location: raw.location,
    followers_count: raw.followers_count,
    // Enriched fields
    profile_type: enriched.type,
    sectors: enriched.sectors,
    locations: enriched.locations,
    stages: enriched.stages,
    investors: enriched.investors,
    universities: enriched.universities,
    work_experience: enriched.work_experience,
    job_titles: enriched.job_titles,
    amount_raised: enriched.amount_raised,
    is_technical: enriched.is_technical,
    linkedin_url: enriched.linkedin_url,
    crunchbase_url: enriched.crunchbase_url,
    // Profile URL (to be populated)
    profile_url: raw.screen_name
      ? `https://x.com/${raw.screen_name}`
      : undefined,
  };
}

/**
 * Build MongoDB match stage from search parameters.
 */
function buildMatchStage(params: SearchProfilesParams): Record<string, unknown> {
  const match: Record<string, unknown> = {
    "metadata.complete": true,
  };

  // Text search across name fields
  if (params.query) {
    match.$or = [
      { name: { $regex: params.query, $options: "i" } },
      { screen_name: { $regex: params.query, $options: "i" } },
      { "enriched_data.founder_name": { $regex: params.query, $options: "i" } },
      { "enriched_data.name": { $regex: params.query, $options: "i" } },
      { description: { $regex: params.query, $options: "i" } },
    ];
  }

  // Profile type filter
  if (params.profile_types && params.profile_types.length > 0) {
    // Capitalize to match database format (Founder, Investor, etc.)
    const normalizedTypes = params.profile_types.map(
      (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
    );
    match["enriched_data.type"] = { $in: normalizedTypes };
  }

  // Stages filter
  if (params.stages && params.stages.length > 0) {
    match["enriched_data.stages"] = { $in: params.stages };
  }

  // Sectors filter
  if (params.sectors && params.sectors.length > 0) {
    match["enriched_data.sectors"] = { $in: params.sectors };
  }

  // Locations filter (with normalization)
  if (params.locations && params.locations.length > 0) {
    const normalizedLocations = params.locations.map(normalizeLocation);
    match["enriched_data.locations"] = { $in: normalizedLocations };
  }

  // Investors filter
  if (params.investors && params.investors.length > 0) {
    match["enriched_data.investors"] = { $in: params.investors };
  }

  // Universities filter
  if (params.universities && params.universities.length > 0) {
    match["enriched_data.universities"] = { $in: params.universities };
  }

  // Companies (work experience) filter
  if (params.companies && params.companies.length > 0) {
    match["enriched_data.work_experience"] = { $in: params.companies };
  }

  // Job titles filter
  if (params.job_titles && params.job_titles.length > 0) {
    match["enriched_data.job_titles"] = { $in: params.job_titles };
  }

  // Funding range filter
  if (params.min_funding !== undefined || params.max_funding !== undefined) {
    const amountFilter: Record<string, number> = {};
    if (params.min_funding !== undefined) {
      amountFilter.$gte = params.min_funding;
    }
    if (params.max_funding !== undefined) {
      amountFilter.$lte = params.max_funding;
    }
    match["enriched_data.amount_raised"] = amountFilter;
  }

  // Followers range filter
  if (params.min_followers !== undefined || params.max_followers !== undefined) {
    const followersFilter: Record<string, number> = {};
    if (params.min_followers !== undefined) {
      followersFilter.$gte = params.min_followers;
    }
    if (params.max_followers !== undefined) {
      followersFilter.$lte = params.max_followers;
    }
    match.followers_count = followersFilter;
  }

  // Technical filter
  if (params.is_technical !== undefined) {
    match["enriched_data.is_technical"] = params.is_technical;
  }

  // User ID inclusion filter
  if (params.user_ids && params.user_ids.length > 0) {
    match.user_id = { $in: params.user_ids };
  }

  // User ID exclusion filter
  if (params.exclude_user_ids && params.exclude_user_ids.length > 0) {
    if (match.user_id) {
      // Combine with existing user_id filter
      match.user_id = {
        ...(match.user_id as Record<string, unknown>),
        $nin: params.exclude_user_ids,
      };
    } else {
      match.user_id = { $nin: params.exclude_user_ids };
    }
  }

  return match;
}

/**
 * Get sort stage based on sort_by parameter.
 */
function getSortStage(sortBy?: string): Record<string, 1 | -1> {
  switch (sortBy) {
    case "funding":
      return { "enriched_data.amount_raised": -1 };
    case "network_connections":
      return { followers_count: -1 };
    case "trending":
      return { "metadata.created_at": -1 }; // Proxy for trending
    case "recent_activity":
      return { "metadata.created_at": -1 };
    case "relevance":
    default:
      return { "metadata.created_at": -1 };
  }
}

/**
 * Search profiles with comprehensive filtering.
 */
export async function searchProfiles(
  params: SearchProfilesParams
): Promise<SearchResult> {
  const db = await getPrimaryDb();
  const page = params.page || 1;
  const limit = params.limit || 50;
  const skip = (page - 1) * limit;

  const matchStage = buildMatchStage(params);
  const sortStage = getSortStage(params.sort_by);

  // Build aggregation pipeline with facet for total count
  const pipeline = [
    { $match: matchStage },
    {
      $facet: {
        results: [
          { $sort: sortStage },
          { $skip: skip },
          { $limit: limit },
          { $project: { _id: 0 } },
        ],
        totalCount: [{ $count: "count" }],
      },
    },
  ];

  const cursor = db.collection(COLLECTION).aggregate(pipeline);
  const aggregationResults = await cursor.toArray();

  if (!aggregationResults || aggregationResults.length === 0) {
    return {
      results: [],
      total_count: 0,
      page,
      limit,
      has_more: false,
    };
  }

  const facetResult = aggregationResults[0] as {
    results: RawProfile[];
    totalCount: { count: number }[];
  };

  const rawProfiles = facetResult.results || [];
  const totalCount =
    facetResult.totalCount && facetResult.totalCount.length > 0
      ? facetResult.totalCount[0].count
      : 0;

  // Transform to enriched profiles
  const profiles = rawProfiles.map(transformProfile);

  return {
    results: profiles,
    total_count: totalCount,
    page,
    limit,
    has_more: skip + profiles.length < totalCount,
  };
}

/**
 * Find a profile by user ID.
 */
export async function findProfileByUserId(
  userId: string | number
): Promise<EnrichedProfile | null> {
  const db = await getPrimaryDb();

  const doc = await db.collection<RawProfile>(COLLECTION).findOne(
    { user_id: String(userId), "metadata.complete": true },
    { projection: { _id: 0 } }
  );

  return doc ? transformProfile(doc) : null;
}

/**
 * Find a profile by screen name.
 */
export async function findProfileByScreenName(
  screenName: string
): Promise<EnrichedProfile | null> {
  const db = await getPrimaryDb();

  // Normalize screen name (remove @ if present, lowercase)
  const normalized = screenName.replace(/^@/, "").toLowerCase();

  const doc = await db.collection<RawProfile>(COLLECTION).findOne(
    {
      screen_name: { $regex: `^${normalized}$`, $options: "i" },
      "metadata.complete": true,
    },
    { projection: { _id: 0 } }
  );

  return doc ? transformProfile(doc) : null;
}

/**
 * Find profiles by multiple user IDs.
 */
export async function findProfilesByUserIds(
  userIds: (string | number)[]
): Promise<EnrichedProfile[]> {
  if (userIds.length === 0) return [];

  const db = await getPrimaryDb();
  const stringIds = userIds.map(String);

  const docs = await db
    .collection<RawProfile>(COLLECTION)
    .find(
      { user_id: { $in: stringIds }, "metadata.complete": true },
      { projection: { _id: 0 } }
    )
    .toArray();

  return docs.map(transformProfile);
}

/**
 * Find profile by LinkedIn URN.
 */
export async function findProfileByLinkedInUrn(
  linkedinUrn: string
): Promise<EnrichedProfile | null> {
  const db = await getPrimaryDb();

  const doc = await db.collection<RawProfile>(COLLECTION).findOne(
    { "enriched_data.linkedin_urn": linkedinUrn, "metadata.complete": true },
    { projection: { _id: 0 } }
  );

  return doc ? transformProfile(doc) : null;
}

/**
 * Get profiles filtered by company affiliation.
 */
export async function findProfilesByCompany(params: {
  company: string;
  current_only?: boolean;
  roles?: string[];
  sectors?: string[];
  limit?: number;
  page?: number;
}): Promise<SearchResult> {
  const { company, current_only = true, roles, sectors, limit = 50, page = 1 } = params;

  const match: Record<string, unknown> = {
    "enriched_data.work_experience": { $regex: company, $options: "i" },
    "metadata.complete": true,
  };

  if (roles && roles.length > 0) {
    match["enriched_data.job_titles"] = { $in: roles };
  }

  if (sectors && sectors.length > 0) {
    match["enriched_data.sectors"] = { $in: sectors };
  }

  // Note: current_only would require checking end_date field if available
  // For now, we search all work experience

  const db = await getPrimaryDb();
  const skip = (page - 1) * limit;

  const pipeline = [
    { $match: match },
    {
      $facet: {
        results: [
          { $sort: { "enriched_data.amount_raised": -1 } },
          { $skip: skip },
          { $limit: limit },
          { $project: { _id: 0 } },
        ],
        totalCount: [{ $count: "count" }],
      },
    },
  ];

  const cursor = db.collection(COLLECTION).aggregate(pipeline);
  const aggregationResults = await cursor.toArray();

  if (!aggregationResults || aggregationResults.length === 0) {
    return { results: [], total_count: 0, page, limit, has_more: false };
  }

  const facetResult = aggregationResults[0] as {
    results: RawProfile[];
    totalCount: { count: number }[];
  };

  const rawProfiles = facetResult.results || [];
  const totalCount =
    facetResult.totalCount?.[0]?.count || 0;

  return {
    results: rawProfiles.map(transformProfile),
    total_count: totalCount,
    page,
    limit,
    has_more: skip + rawProfiles.length < totalCount,
  };
}

/**
 * Get profiles filtered by investor.
 */
export async function findProfilesByInvestor(params: {
  investor: string;
  stages?: string[];
  sectors?: string[];
  limit?: number;
  page?: number;
}): Promise<SearchResult> {
  const { investor, stages, sectors, limit = 50, page = 1 } = params;

  const match: Record<string, unknown> = {
    "enriched_data.investors": { $regex: investor, $options: "i" },
    "metadata.complete": true,
  };

  if (stages && stages.length > 0) {
    match["enriched_data.stages"] = { $in: stages };
  }

  if (sectors && sectors.length > 0) {
    match["enriched_data.sectors"] = { $in: sectors };
  }

  const db = await getPrimaryDb();
  const skip = (page - 1) * limit;

  const pipeline = [
    { $match: match },
    {
      $facet: {
        results: [
          { $sort: { "enriched_data.amount_raised": -1 } },
          { $skip: skip },
          { $limit: limit },
          { $project: { _id: 0 } },
        ],
        totalCount: [{ $count: "count" }],
      },
    },
  ];

  const cursor = db.collection(COLLECTION).aggregate(pipeline);
  const aggregationResults = await cursor.toArray();

  if (!aggregationResults || aggregationResults.length === 0) {
    return { results: [], total_count: 0, page, limit, has_more: false };
  }

  const facetResult = aggregationResults[0] as {
    results: RawProfile[];
    totalCount: { count: number }[];
  };

  const rawProfiles = facetResult.results || [];
  const totalCount = facetResult.totalCount?.[0]?.count || 0;

  return {
    results: rawProfiles.map(transformProfile),
    total_count: totalCount,
    page,
    limit,
    has_more: skip + rawProfiles.length < totalCount,
  };
}
