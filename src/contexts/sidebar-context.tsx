"use client";

import { createContext, useContext, useCallback, useState, ReactNode } from "react";

interface SidebarContextValue {
  /**
   * Trigger a refresh of the sidebar conversations list.
   */
  refreshConversations: () => void;
  /**
   * Counter that increments on each refresh request.
   * Components can use this as a dependency to trigger re-fetches.
   */
  refreshKey: number;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshConversations = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <SidebarContext.Provider value={{ refreshConversations, refreshKey }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
