"use client";

import { ChatSidebar } from "@/components/sidebar/chat-sidebar";
import { Button } from "@/components/ui/button";
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
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="hidden md:flex w-64 flex-shrink-0 border-r">
        <ChatSidebar />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="md:hidden flex items-center gap-3 border-b px-4 py-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
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
          <div className="text-sm font-medium">Signa Agent</div>
        </div>
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}
