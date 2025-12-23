"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { MapPin, Users, TrendingUp, ExternalLink, Briefcase } from "lucide-react";
import { SignalModal } from "./signal-modal";

/**
 * Profile data structure from tool results.
 */
export interface ProfileData {
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
  workExperience?: Array<{ company: string; title: string }>;
  universities?: string[];
  investors?: string[];
  amountRaised?: number;
  stages?: string[];
  isTechnical?: boolean;
  linkedinUrl?: string;
  crunchbaseUrl?: string;
  profileUrl?: string;
  trendingScore?: number;
  followedByCount?: number;
  stealthStatus?: "in" | "out" | null;
  recentBioChange?: boolean;
  totalSignals?: number;
  recentSignals?: number;
}

interface SignalCardProps {
  profile: ProfileData;
  className?: string;
  compact?: boolean;
}

/**
 * Construct profile image URL from S3 if not provided.
 */
function getProfileImageUrl(profile: ProfileData): string | undefined {
  return profile.profileImageUrl;
}

/**
 * Format funding amount for display.
 */
function formatFunding(amount?: number): string {
  if (!amount) return "";
  if (amount >= 1_000_000_000) {
    return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  }
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(0)}K`;
  }
  return `$${amount}`;
}

/**
 * SignalCard displays a profile in a compact card format.
 * Click to expand into modal for full details.
 */
export function SignalCard({ profile, className, compact = false }: SignalCardProps) {
  const [showModal, setShowModal] = useState(false);
  const [imgError, setImgError] = useState(false);
  const profileImageUrl = getProfileImageUrl(profile);

  const primaryLocation = profile.locations?.[0] || profile.location || "";
  const primarySector = profile.sectors?.[0] || "";
  const primaryRole = profile.jobTitles?.[0] || profile.headline || "";

  return (
    <>
      <div
        className={cn(
          "cursor-pointer rounded-lg border bg-card p-3 shadow-sm transition-all hover:shadow-md hover:border-primary/50",
          compact ? "flex items-center gap-3" : "space-y-2",
          className
        )}
        onClick={() => setShowModal(true)}
      >
        {/* Profile image and basic info */}
        <div className={cn("flex items-start gap-3", compact && "flex-1 min-w-0")}>
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {!imgError && profileImageUrl ? (
              <img
                src={profileImageUrl}
                alt={profile.name}
                className="w-10 h-10 rounded-full object-cover bg-muted"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                {profile.name?.charAt(0)?.toUpperCase() || "?"}
              </div>
            )}
            {/* Trending indicator */}
            {profile.trendingScore && profile.trendingScore > 5 && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center">
                <TrendingUp className="w-2.5 h-2.5 text-white" />
              </div>
            )}
          </div>

          {/* Name and headline */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-foreground truncate">
                {profile.name}
              </h4>
              {profile.profileType && (
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                    profile.profileType === "Founder"
                      ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                      : profile.profileType === "Investor"
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                        : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                  )}
                >
                  {profile.profileType}
                </span>
              )}
            </div>
            {primaryRole && (
              <p className="text-sm text-muted-foreground truncate">
                {primaryRole}
              </p>
            )}
          </div>
        </div>

        {/* Compact: show key metrics inline */}
        {compact && (
          <div className="flex items-center gap-3 flex-shrink-0 text-xs text-muted-foreground">
            {primaryLocation && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {primaryLocation}
              </span>
            )}
            {profile.followedByCount && profile.followedByCount > 0 && (
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {profile.followedByCount}
              </span>
            )}
          </div>
        )}

        {/* Full card: show more details */}
        {!compact && (
          <>
            {/* Location and metrics */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {primaryLocation && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {primaryLocation}
                </span>
              )}
              {profile.followedByCount && profile.followedByCount > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {profile.followedByCount} network
                </span>
              )}
              {profile.amountRaised && (
                <span className="flex items-center gap-1">
                  <Briefcase className="w-3 h-3" />
                  {formatFunding(profile.amountRaised)}
                </span>
              )}
            </div>

            {/* Sectors/Tags */}
            {profile.sectors && profile.sectors.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {profile.sectors.slice(0, 3).map((sector, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {sector}
                  </span>
                ))}
                {profile.sectors.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{profile.sectors.length - 3}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <SignalModal profile={profile} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}

/**
 * SignalCardGrid displays a grid of profile cards.
 */
interface SignalCardGridProps {
  profiles: ProfileData[];
  compact?: boolean;
  maxItems?: number;
  className?: string;
}

export function SignalCardGrid({
  profiles,
  compact = false,
  maxItems = 10,
  className,
}: SignalCardGridProps) {
  const displayProfiles = profiles.slice(0, maxItems);
  const hasMore = profiles.length > maxItems;

  return (
    <div className={className}>
      <div
        className={cn(
          "grid gap-2",
          compact
            ? "grid-cols-1"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        )}
      >
        {displayProfiles.map((profile, idx) => (
          <SignalCard key={profile.userId || idx} profile={profile} compact={compact} />
        ))}
      </div>
      {hasMore && (
        <p className="text-sm text-muted-foreground text-center mt-2">
          +{profiles.length - maxItems} more results
        </p>
      )}
    </div>
  );
}
