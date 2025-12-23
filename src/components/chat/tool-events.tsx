"use client";

import React, { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Check,
  X,
  Search,
  User,
  Users,
  Building2,
  TrendingUp,
  Network,
  Rss,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type ProfileData } from "./signal-card";

interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  state: "partial-call" | "call" | "result";
  result?: unknown;
}

interface ToolEventsProps {
  invocations: ToolInvocation[];
  isLoading: boolean;
}

const TOOL_ICONS: Record<string, React.ReactElement> = {
  find_people: <Search className="w-3 h-3" />,
  get_person_details: <User className="w-3 h-3" />,
  find_by_company: <Building2 className="w-3 h-3" />,
  find_by_investor: <TrendingUp className="w-3 h-3" />,
  get_relationship_network: <Network className="w-3 h-3" />,
  analyze_network: <BarChart3 className="w-3 h-3" />,
  get_my_feeds: <Rss className="w-3 h-3" />,
  get_feed_signals: <Rss className="w-3 h-3" />,
  get_aggregated_feed_signals: <Rss className="w-3 h-3" />,
  get_my_groups: <Users className="w-3 h-3" />,
  get_group_members: <Users className="w-3 h-3" />,
};

const DEFAULT_TOOL_ICON = <Search className="w-3 h-3" />;
const TOOL_SURFACE = "bg-muted/50";
const TOOL_SURFACE_SOFT = "bg-muted/30";
const TOOL_BORDER = "border-border";
const TOOL_TEXT = "text-foreground";
const TOOL_MUTED = "text-muted-foreground";

export function ToolEvents({ invocations, isLoading }: ToolEventsProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (invocations.length === 0) return null;

  const completedCount = invocations.filter((i) => i.state === "result").length;
  const pendingCount = invocations.length - completedCount;

  // Check for errors safely
  const hasError = invocations.some((i) => {
    if (i.state !== "result" || !i.result) return false;
    const res = i.result as Record<string, unknown>;
    return Boolean(res.error);
  });

  // Get total results count
  const totalResults = invocations.reduce((sum, inv) => {
    if (inv.state !== "result" || !inv.result) return sum;
    const res = inv.result as Record<string, unknown>;
    const count = (res.total_count as number) ?? (res.count as number) ?? 0;
    return sum + count;
  }, 0);

  return (
    <div className="rounded-lg border text-sm overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
          "bg-muted/70 hover:bg-muted"
        )}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}

        <span className="font-medium">Research</span>

        <div className="flex items-center gap-2 ml-auto">
          {pendingCount > 0 && isLoading && (
            <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              {pendingCount} running
            </span>
          )}
          {completedCount > 0 && (
            <span
              className={cn(
                "flex items-center gap-1",
                hasError
                  ? "text-destructive"
                  : "text-emerald-600 dark:text-emerald-400"
              )}
            >
              {hasError ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}
              {completedCount} done
            </span>
          )}
          {totalResults > 0 && (
            <span className="text-foreground/70">({totalResults} results)</span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t">
          {invocations.map((invocation) => (
            <ToolInvocationItem key={invocation.toolCallId} invocation={invocation} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolInvocationItem({ invocation }: { invocation: ToolInvocation }) {
  const [showDetails, setShowDetails] = useState(false);
  const [showProfiles, setShowProfiles] = useState(true);

  const isComplete = invocation.state === "result";
  const result = invocation.result as Record<string, unknown> | undefined;
  const hasError = result?.error ? true : false;

  const toolIcon = TOOL_ICONS[invocation.toolName] ?? DEFAULT_TOOL_ICON;

  const toolDisplayName = invocation.toolName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // Extract profiles from result
  const profiles = extractProfiles(result);
  const resultCount =
    (result?.total_count as number) ??
    (result?.count as number) ??
    profiles.length;

  return (
    <div className={cn("border-b last:border-b-0", TOOL_BORDER)}>
      {/* Tool header */}
      <div className={cn("flex items-center gap-2 px-3 py-2", TOOL_SURFACE)}>
        <div className={TOOL_MUTED}>{toolIcon}</div>

        <span className={cn("font-medium text-xs", TOOL_TEXT)}>
          {toolDisplayName}
        </span>

        <span className={cn("text-xs truncate flex-1", TOOL_MUTED)}>
          {formatArgsSummary(invocation.args)}
        </span>

        <div className="flex items-center gap-2 ml-auto">
          {isComplete ? (
            hasError ? (
              <span className="flex items-center gap-1 text-destructive text-xs">
                <X className="w-3 h-3" />
                Error
              </span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs">
                <Check className="w-3 h-3" />
                {resultCount > 0 ? `${resultCount} results` : ""}
              </span>
            )
          ) : (
            <Loader2 className={cn("w-3 h-3 animate-spin", TOOL_MUTED)} />
          )}

          <button
            onClick={() => setShowDetails(!showDetails)}
            className={cn("text-xs hover:text-foreground", TOOL_MUTED)}
          >
            {showDetails ? "Hide" : "Details"}
          </button>
        </div>
      </div>

      {/* Details section */}
      {showDetails && (
        <div className={cn("px-3 py-2 text-[11px] space-y-2", TOOL_SURFACE_SOFT, TOOL_TEXT)}>
          <div>
            <div className={cn("font-medium mb-1", TOOL_MUTED)}>Parameters:</div>
            <pre className="font-mono text-[11px] leading-relaxed bg-muted/60 text-foreground p-2 rounded overflow-x-auto border border-border/60">
              {JSON.stringify(invocation.args, null, 2)}
            </pre>
          </div>
          {isComplete && result && !hasError && (
            <div>
              <div className={cn("font-medium mb-1", TOOL_MUTED)}>Raw Result:</div>
              <pre className="font-mono text-[11px] leading-relaxed bg-muted/60 text-foreground p-2 rounded overflow-x-auto max-h-48 border border-border/60">
                {formatResultPreview(result)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Profiles grid */}
      {isComplete && profiles.length > 0 && (
        <div className={cn("px-3 py-2 border-t bg-background", TOOL_BORDER)}>
          <button
            onClick={() => setShowProfiles(!showProfiles)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
          >
            {showProfiles ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            {profiles.length} profiles
          </button>
          {showProfiles && (
            <ProfileLinkList profiles={profiles} maxItems={8} />
          )}
        </div>
      )}

      {/* Error message */}
      {isComplete && hasError && (
        <div className="px-3 py-2 bg-destructive/10 border-t border-destructive/20">
          <p className="text-xs text-destructive">
            {String(result?.message ?? "An error occurred")}
          </p>
        </div>
      )}
    </div>
  );
}

// Format result for preview
function formatResultPreview(result: Record<string, unknown>): string {
  const str = JSON.stringify(result, null, 2);
  if (str.length > 2000) {
    return str.slice(0, 2000) + "\n... (truncated)";
  }
  return str;
}

// Extract profiles from tool result
function extractProfiles(result?: Record<string, unknown>): ProfileData[] {
  if (!result) return [];

  const profiles = (result.results ?? result.profiles) as unknown[] | undefined;
  if (!Array.isArray(profiles)) return [];

  return profiles
    .filter((p): p is Record<string, unknown> => p !== null && typeof p === "object")
    .map((p): ProfileData => ({
      userId: Number(p.userId ?? p.user_id ?? 0),
      screenName: String(p.screenName ?? p.screen_name ?? ""),
      name: String(p.name ?? ""),
      description: p.description ? String(p.description) : undefined,
      profileImageUrl: (p.profileImageUrl ?? p.profile_image_url) ? String(p.profileImageUrl ?? p.profile_image_url) : undefined,
      followersCount: (p.followersCount ?? p.followers_count) ? Number(p.followersCount ?? p.followers_count) : undefined,
      location: p.location ? String(p.location) : undefined,
      profileType: (p.profileType ?? p.profile_type) ? String(p.profileType ?? p.profile_type) : undefined,
      headline: p.headline ? String(p.headline) : undefined,
      sectors: Array.isArray(p.sectors) ? p.sectors.map(String) : undefined,
      locations: Array.isArray(p.locations) ? p.locations.map(String) : undefined,
      jobTitles: Array.isArray(p.jobTitles) ? p.jobTitles.map(String) : Array.isArray(p.job_titles) ? (p.job_titles as unknown[]).map(String) : undefined,
      workExperience: Array.isArray(p.workExperience)
        ? (p.workExperience as Array<{ company: string; title: string }>)
        : Array.isArray(p.work_experience)
          ? (p.work_experience as Array<{ company: string; title: string }>)
          : undefined,
      universities: Array.isArray(p.universities) ? p.universities.map(String) : undefined,
      investors: Array.isArray(p.investors) ? p.investors.map(String) : undefined,
      amountRaised: (p.amountRaised ?? p.amount_raised) ? Number(p.amountRaised ?? p.amount_raised) : undefined,
      stages: Array.isArray(p.stages) ? p.stages.map(String) : undefined,
      isTechnical: typeof (p.isTechnical ?? p.is_technical) === "boolean" ? Boolean(p.isTechnical ?? p.is_technical) : undefined,
      linkedinUrl: (p.linkedinUrl ?? p.linkedin_url) ? String(p.linkedinUrl ?? p.linkedin_url) : undefined,
      crunchbaseUrl: (p.crunchbaseUrl ?? p.crunchbase_url) ? String(p.crunchbaseUrl ?? p.crunchbase_url) : undefined,
      profileUrl: (p.profileUrl ?? p.profile_url) ? String(p.profileUrl ?? p.profile_url) : undefined,
      trendingScore: (p.trendingScore ?? p.trending_score) ? Number(p.trendingScore ?? p.trending_score) : undefined,
      followedByCount: (p.followedByCount ?? p.followed_by_count) ? Number(p.followedByCount ?? p.followed_by_count) : undefined,
      stealthStatus: (p.stealthStatus ?? p.stealth_status) as "in" | "out" | null | undefined,
      recentBioChange: typeof (p.recentBioChange ?? p.recent_bio_change) === "boolean" ? Boolean(p.recentBioChange ?? p.recent_bio_change) : undefined,
      totalSignals: (p.totalSignals ?? p.total_signals) ? Number(p.totalSignals ?? p.total_signals) : undefined,
      recentSignals: (p.recentSignals ?? p.recent_signals) ? Number(p.recentSignals ?? p.recent_signals) : undefined,
    }));
}

// Format args into a brief summary string
function formatArgsSummary(args?: Record<string, unknown> | null): string {
  if (!args || typeof args !== "object") {
    return "";
  }

  const parts: string[] = [];

  if (args.query) parts.push(`"${String(args.query)}"`);
  if (args.company) parts.push(`company: ${String(args.company)}`);
  if (args.investor) parts.push(`investor: ${String(args.investor)}`);
  if (args.person) parts.push(`person: ${String(args.person)}`);
  if (args.relationship) parts.push(String(args.relationship));
  if (args.analysis_type) parts.push(String(args.analysis_type));
  if (Array.isArray(args.sectors)) {
    parts.push(`sectors: ${args.sectors.join(", ")}`);
  }
  if (Array.isArray(args.locations)) {
    parts.push(`in: ${args.locations.join(", ")}`);
  }
  if (Array.isArray(args.stages)) {
    parts.push(`stages: ${args.stages.join(", ")}`);
  }

  return parts.join(" | ");
}

function ProfileLinkList({
  profiles,
  maxItems = 8,
}: {
  profiles: ProfileData[];
  maxItems?: number;
}) {
  const visibleProfiles = profiles.slice(0, maxItems);

  return (
    <div className="space-y-2 text-xs font-mono text-foreground">
      {visibleProfiles.map((profile) => {
        const label = getProfileLabel(profile);
        const profileUrl = profile.profileUrl;

        return (
          <div key={`${profile.userId}-${profile.screenName}`} className="flex items-center gap-2">
            {profile.profileImageUrl ? (
              <img
                src={profile.profileImageUrl}
                alt={label}
                className="h-5 w-5 rounded-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                {(label || "?")[0].toUpperCase()}
              </div>
            )}
            {profileUrl ? (
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:underline"
              >
                {label}
              </a>
            ) : (
              <span className="text-foreground">{label}</span>
            )}
          </div>
        );
      })}
      {profiles.length > maxItems && (
        <div className="text-muted-foreground">
          +{profiles.length - maxItems} more results
        </div>
      )}
    </div>
  );
}

function getProfileLabel(profile: ProfileData): string {
  if (profile.name) return profile.name;
  if (profile.screenName) return profile.screenName;
  return "Unknown";
}
