"use client";

import { useState, useEffect } from "react";
import { ProfileData } from "./signal-card";
import { cn } from "@/lib/utils";
import {
  X,
  MapPin,
  Users,
  TrendingUp,
  ExternalLink,
  Briefcase,
  GraduationCap,
  Building2,
  DollarSign,
  Linkedin,
  Twitter,
} from "lucide-react";

interface SignalModalProps {
  profile: ProfileData;
  onClose: () => void;
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
 * SignalModal shows full profile details in a modal overlay.
 */
export function SignalModal({ profile, onClose }: SignalModalProps) {
  const [imgError, setImgError] = useState(false);
  const profileImageUrl = getProfileImageUrl(profile);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // Prevent scroll on body
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const twitterUrl = profile.screenName
    ? `https://twitter.com/${profile.screenName}`
    : profile.profileUrl;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-background p-6">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              {!imgError && profileImageUrl ? (
                <img
                  src={profileImageUrl}
                  alt={profile.name}
                  className="w-16 h-16 rounded-full object-cover bg-muted"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
                  {profile.name?.charAt(0)?.toUpperCase() || "?"}
                </div>
              )}
              {/* Trending indicator */}
              {profile.trendingScore && profile.trendingScore > 5 && (
                <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 bg-orange-500 rounded-full flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3 text-white" />
                  <span className="text-[10px] text-white font-medium">
                    {Math.round(profile.trendingScore)}x
                  </span>
                </div>
              )}
            </div>

            {/* Name and headline */}
            <div>
              <h2 className="text-xl font-bold text-foreground">
                {profile.name}
              </h2>
              {profile.screenName && (
                <p className="text-sm text-muted-foreground">
                  @{profile.screenName}
                </p>
              )}
              {profile.headline && (
                <p className="mt-1 text-sm text-foreground/80">
                  {profile.headline}
                </p>
              )}
              {profile.profileType && (
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium mt-2",
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
          </div>

          {/* Close button */}
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6 p-6">
          {/* Quick metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {profile.followedByCount !== undefined && profile.followedByCount > 0 && (
              <MetricCard
                icon={<Users className="w-4 h-4" />}
                label="Network Follows"
                value={profile.followedByCount.toString()}
              />
            )}
            {profile.amountRaised !== undefined && profile.amountRaised > 0 && (
              <MetricCard
                icon={<DollarSign className="w-4 h-4" />}
                label="Funding"
                value={formatFunding(profile.amountRaised)}
              />
            )}
            {profile.trendingScore !== undefined && profile.trendingScore > 1 && (
              <MetricCard
                icon={<TrendingUp className="w-4 h-4" />}
                label="Trending"
                value={`${profile.trendingScore.toFixed(1)}x`}
              />
            )}
            {profile.followersCount !== undefined && profile.followersCount > 0 && (
              <MetricCard
                icon={<Twitter className="w-4 h-4" />}
                label="Followers"
                value={formatNumber(profile.followersCount)}
              />
            )}
          </div>

          {/* Description/Bio */}
          {profile.description && (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                About
              </h3>
              <p className="text-foreground/90">{profile.description}</p>
            </div>
          )}

          {/* Locations */}
          {profile.locations && profile.locations.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Locations
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.locations.map((loc, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1 text-sm text-emerald-800 dark:text-emerald-300"
                  >
                    <MapPin className="w-3 h-3" />
                    {loc}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Sectors */}
          {profile.sectors && profile.sectors.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Sectors
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.sectors.map((sector, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center rounded-full bg-purple-100 dark:bg-purple-900/30 px-3 py-1 text-sm text-purple-800 dark:text-purple-300"
                  >
                    {sector}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Job Titles / Roles */}
          {profile.jobTitles && profile.jobTitles.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Roles
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.jobTitles.map((title, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 px-3 py-1 text-sm text-blue-800 dark:text-blue-300"
                  >
                    <Briefcase className="w-3 h-3" />
                    {title}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Work Experience */}
          {profile.workExperience && profile.workExperience.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Experience
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.workExperience.map((exp, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-sm text-slate-800 dark:text-slate-300"
                  >
                    <Building2 className="w-3 h-3" />
                    {exp.company}
                    {exp.title && ` - ${exp.title}`}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Investors */}
          {profile.investors && profile.investors.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Investors
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.investors.map((investor, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-3 py-1 text-sm text-amber-800 dark:text-amber-300"
                  >
                    {investor}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Universities */}
          {profile.universities && profile.universities.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Education
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.universities.map((uni, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-full bg-cyan-100 dark:bg-cyan-900/30 px-3 py-1 text-sm text-cyan-800 dark:text-cyan-300"
                  >
                    <GraduationCap className="w-3 h-3" />
                    {uni}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Stages */}
          {profile.stages && profile.stages.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Funding Stage
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.stages.map((stage, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center rounded-full bg-rose-100 dark:bg-rose-900/30 px-3 py-1 text-sm text-rose-800 dark:text-rose-300"
                  >
                    {stage}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* External links */}
          <div className="flex flex-wrap gap-3 pt-4 border-t">
            {twitterUrl && (
              <a
                href={twitterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium hover:bg-muted/80 transition-colors"
              >
                <Twitter className="w-4 h-4" />
                Twitter
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {profile.linkedinUrl && (
              <a
                href={profile.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Linkedin className="w-4 h-4" />
                LinkedIn
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {profile.crunchbaseUrl && (
              <a
                href={profile.crunchbaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-orange-500 text-white px-4 py-2 text-sm font-medium hover:bg-orange-600 transition-colors"
              >
                Crunchbase
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * MetricCard shows a single metric in a compact card.
 */
function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-3 text-center">
      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
        {icon}
      </div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

/**
 * Format large numbers with K/M/B suffix.
 */
function formatNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toString();
}
