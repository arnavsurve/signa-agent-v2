"use client";

import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useProfileCache } from "@/contexts/profile-cache-context";
import { cn } from "@/lib/utils";

interface MarkdownTextProps {
  content: string;
  className?: string;
}

export function MarkdownText({ content, className }: MarkdownTextProps) {
  const { getProfile, getProfileByUrl } = useProfileCache();

  return (
    <div
      className={cn(
        "prose prose-base dark:prose-invert max-w-none leading-relaxed prose-p:leading-relaxed prose-li:leading-relaxed prose-ul:space-y-2 prose-li:marker:text-muted-foreground",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom link rendering with profile images
          a: ({ href, children }) => {
            // Check if this is a profile link (x.com, twitter.com, or linkedin.com)
            const isTwitterLink =
              href?.includes("x.com/") || href?.includes("twitter.com/");
            const isLinkedInLink = href?.includes("linkedin.com/");
            const isProfileLink = isTwitterLink || isLinkedInLink;
            const profileByUrl = href ? getProfileByUrl(href) : undefined;

            if (profileByUrl && href) {
              const profileImageUrl = getProfileImageUrl(profileByUrl);
              const label = getProfileLabel(profileByUrl, children);

              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:underline"
                  style={{ verticalAlign: "baseline" }}
                >
                  {profileImageUrl && (
                    <img
                      src={profileImageUrl}
                      alt={label}
                      className="inline-block h-6 w-6 rounded-full object-cover"
                      loading="lazy"
                      style={{ verticalAlign: "bottom", marginRight: "0.375rem" }}
                    />
                  )}
                  {children}
                </a>
              );
            }

            if (isProfileLink && href) {
              const screenName = extractScreenName(href);
              const profile = screenName ? getProfile(screenName) : undefined;
              const label = getProfileLabel(
                profile,
                children,
                screenName || undefined,
              );

              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:underline"
                  style={{ verticalAlign: "baseline" }}
                >
                  {profile?.profileImageUrl && (
                    <img
                      src={profile.profileImageUrl}
                      alt={label}
                      className="inline-block h-4 w-4 rounded-full object-cover"
                      loading="lazy"
                      style={{ verticalAlign: "bottom", marginRight: "0.25rem" }}
                    />
                  )}
                  {children}
                </a>
              );
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:underline"
              >
                {children}
              </a>
            );
          },

          // Table styling
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border-collapse border border-border">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border px-3 py-2 bg-muted text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-3 py-2">{children}</td>
          ),

          // Code blocks
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code
                  className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className={cn(
                  "block bg-muted p-3 rounded text-sm font-mono overflow-x-auto",
                  className,
                )}
                {...props}
              >
                {children}
              </code>
            );
          },

          // Lists
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1">{children}</ol>
          ),

          // Headings
          h1: ({ children }) => (
            <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold mt-3 mb-2">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-bold mt-2 mb-1">{children}</h3>
          ),

          // Paragraphs
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,

          // Strong/Bold
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Extract screen name from a Twitter/X URL.
 */
function extractScreenName(url: string): string | null {
  const match = url.match(/(?:x\.com|twitter\.com)\/([^/?]+)/);
  return match ? match[1] : null;
}

function getProfileImageUrl(
  profile: { profileImageUrl?: string } | undefined,
): string | undefined {
  return profile?.profileImageUrl;
}

function getProfileLabel(
  profile: { name?: string; screenName?: string } | undefined,
  children: ReactNode,
  fallback?: string,
): string {
  const childText = Array.isArray(children)
    ? children.filter((child) => typeof child === "string").join("")
    : typeof children === "string"
      ? children
      : "";

  if (profile?.name) return profile.name;
  if (profile?.screenName) return profile.screenName;
  if (childText) return childText;
  if (fallback) return fallback;
  return "?";
}
