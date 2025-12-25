"use client";

import { useMemo } from "react";
import { ConversationItem } from "./conversation-item";
import {
  isToday,
  isYesterday,
  isThisWeek,
  isThisMonth,
} from "date-fns";

interface Conversation {
  id: string;
  title: string;
  preview?: string;
  updatedAt: Date;
}

interface ConversationListProps {
  conversations: Conversation[];
  activeId?: string;
  onRename: (id: string, newTitle: string) => void;
  onDelete: (id: string) => void;
}

interface ConversationGroup {
  label: string;
  conversations: Conversation[];
}

function groupConversations(conversations: Conversation[]): ConversationGroup[] {
  const groups: Record<string, Conversation[]> = {
    Today: [],
    Yesterday: [],
    "This Week": [],
    "This Month": [],
    Older: [],
  };

  for (const conv of conversations) {
    const date = new Date(conv.updatedAt);

    if (isToday(date)) {
      groups["Today"].push(conv);
    } else if (isYesterday(date)) {
      groups["Yesterday"].push(conv);
    } else if (isThisWeek(date, { weekStartsOn: 1 })) {
      groups["This Week"].push(conv);
    } else if (isThisMonth(date)) {
      groups["This Month"].push(conv);
    } else {
      groups["Older"].push(conv);
    }
  }

  // Sort conversations within each group by date (newest first)
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  // Return only non-empty groups
  return Object.entries(groups)
    .filter(([, convs]) => convs.length > 0)
    .map(([label, conversations]) => ({ label, conversations }));
}

export function ConversationList({
  conversations,
  activeId,
  onRename,
  onDelete,
}: ConversationListProps) {
  const groups = useMemo(
    () => groupConversations(conversations),
    [conversations]
  );

  if (conversations.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-sm text-muted-foreground">
        No conversations yet
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
            {group.label}
          </div>
          <div className="space-y-0.5">
            {group.conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                id={conv.id}
                title={conv.title}
                preview={conv.preview}
                isActive={conv.id === activeId}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
