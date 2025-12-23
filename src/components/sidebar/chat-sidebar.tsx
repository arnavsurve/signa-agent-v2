"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Plus, LogOut, User, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversationList } from "./conversation-list";
import { useAuth } from "@/contexts/auth-context";

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
  }, [authLoading, fetchConversations, isAuthenticated]);

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
    <div className="flex flex-col h-full w-full min-w-0 bg-muted/30 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b">
        <Button
          onClick={handleNewChat}
          className="w-full justify-start gap-2"
          variant="outline"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
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

      {/* User section */}
      <div className="p-4 border-t">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-4 w-4 text-primary" />
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
      </div>
    </div>
  );
}
