"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useProfileCache } from "@/contexts/profile-cache-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface MarkdownTextProps {
  content: string;
  className?: string;
}

export function MarkdownText({ content, className }: MarkdownTextProps) {
  const { getProfile } = useProfileCache();

  return (
    <div className={cn("prose prose-sm dark:prose-invert max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom link rendering with profile images
          a: ({ href, children }) => {
            // Check if this is a profile link (x.com or twitter.com)
            const isProfileLink =
              href?.includes("x.com/") || href?.includes("twitter.com/");

            if (isProfileLink && href) {
              const screenName = extractScreenName(href);
              const profile = screenName ? getProfile(screenName) : undefined;

              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {profile?.profileImageUrl && (
                    <Avatar className="w-4 h-4 inline-block">
                      <AvatarImage
                        src={profile.profileImageUrl}
                        alt={profile.name || screenName || ""}
                      />
                      <AvatarFallback className="text-[8px]">
                        {(profile.name || screenName || "?")[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
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
                className="text-primary hover:underline"
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
                className={cn("block bg-muted p-3 rounded text-sm font-mono overflow-x-auto", className)}
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
