"use client";

import { ChatSidebar } from "@/components/sidebar/chat-sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Menu } from "lucide-react";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen app-shell">
      <div className="h-full px-3 py-4">
        <div className="grid h-full grid-cols-[280px_minmax(0,1fr)] gap-3 min-h-0">
      {/* Sidebar */}
          <div className="hidden md:flex min-w-0 min-h-0">
            <div className="h-full w-full overflow-y-auto pr-1">
              <ChatSidebar />
            </div>
          </div>

      {/* Main content */}
          <div className="flex flex-col min-w-0 min-h-0 gap-3">
            <Card className="rounded-xl border border-border/60 bg-background/80 shadow-none">
              <CardContent className="px-4 py-2.5 flex items-center gap-3">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden">
                    <Menu className="h-4 w-4" />
                    <span className="sr-only">Open sidebar</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="left-0 top-0 h-full w-[85vw] max-w-xs translate-x-0 translate-y-0 rounded-none p-0">
                  <div className="h-full">
                    <ChatSidebar />
                  </div>
                </DialogContent>
              </Dialog>
              <div className="flex flex-col">
                <span className="text-sm font-semibold tracking-tight">Signa Agent</span>
                <span className="text-xs text-muted-foreground">
                  Network intelligence
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <ThemeToggle />
              </div>
              </CardContent>
            </Card>
            <div className="flex-1 min-h-0">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
