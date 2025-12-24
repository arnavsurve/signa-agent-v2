"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Plus, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { ConversationList } from "./conversation-list";
import { useAuth } from "@/contexts/auth-context";
import { useSidebar } from "@/contexts/sidebar-context";

interface Conversation {
  id: string;
  title: string;
  preview?: string;
  updatedAt: Date;
}

export function ChatSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    user,
    logout,
    getAccessToken,
    isLoading: authLoading,
    isAuthenticated,
  } = useAuth();
  const { refreshKey } = useSidebar();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Extract active conversation ID from pathname
  const activeId = pathname.startsWith("/chat/")
    ? pathname.replace("/chat/", "")
    : undefined;

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const token = getAccessToken();
      if (!token) {
        setConversations([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const response = await fetch("/api/conversations", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        const items = Array.isArray(data.conversations) ? data.conversations : [];
        setConversations(
          items.map((c: Record<string, unknown>) => ({
            id: (c._id as string) || (c.id as string),
            title: (c.title as string) || "New conversation",
            preview:
              (c.first_message_preview as string) ||
              (c.preview as string) ||
              undefined,
            updatedAt: new Date(
              (c.updated_at as string) ||
                (c.updatedAt as string) ||
                Date.now()
            ),
          }))
        );
      }
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setConversations([]);
      setIsLoading(false);
      return;
    }
    fetchConversations();
  }, [authLoading, fetchConversations, isAuthenticated, refreshKey]);

  // Create new conversation
  const handleNewChat = async () => {
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "New conversation" }),
      });
      if (response.ok) {
        const data = await response.json();
        const conversationId = data.conversation?.id || data.id;
        router.push(`/chat/${conversationId}`);
        fetchConversations();
      }
    } catch (error) {
      console.error("Failed to create conversation:", error);
    }
  };

  // Rename conversation
  const handleRename = async (id: string, newTitle: string) => {
    try {
      const response = await fetch(`/api/conversations/${id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: newTitle }),
      });
      if (response.ok) {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
        );
      }
    } catch (error) {
      console.error("Failed to rename conversation:", error);
    }
  };

  // Delete conversation
  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
      });
      if (response.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeId === id) {
          router.push("/chat");
        }
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <Card className="flex flex-col h-full w-full min-w-0 overflow-hidden rounded-xl border border-border/60 bg-background/80 shadow-none p-6 space-y-6">
      {/* Header */}
      <CardHeader className="p-0 border-b border-border/60">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold tracking-tight">Signa</div>
        </div>
        <Button
          onClick={handleNewChat}
          className="w-full justify-start gap-2 mt-4"
          variant="secondary"
        >
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </CardHeader>

      {/* Conversation List */}
      <CardContent className="flex-1 p-0">
        <div className="rounded-lg border border-border/60 bg-background h-full overflow-y-auto overflow-x-hidden px-2 py-3">
          {isLoading ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : (
            <ConversationList
              conversations={conversations}
              activeId={activeId}
              onRename={handleRename}
              onDelete={handleDelete}
            />
          )}
        </div>
      </CardContent>

      {/* User section */}
      <CardFooter className="p-0 border-t border-border/60">
        <div className="rounded-lg border border-border/60 bg-background px-3 py-2 flex items-center gap-3">
          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-foreground/5 flex items-center justify-center">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {user?.email || "User"}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="h-8 w-8"
          >
            <LogOut className="h-4 w-4" />
            <span className="sr-only">Logout</span>
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
