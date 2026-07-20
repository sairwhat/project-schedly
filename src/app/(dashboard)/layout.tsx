"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { ThemeProvider, useThemeConfig } from "@/features/theme";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { themeVars } = useThemeConfig();
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 768px)").matches;
  });
  const showButton = !open;

  const sidebarWrap = [
    "fixed right-3 top-3 z-40 w-[300px] max-w-[calc(100vw-1.5rem)] will-change-transform",
    "max-h-[70vh] md:max-h-[calc(100vh-1.5rem)]",
    open ? "sidebar-drop-in" : "sidebar-drop-out pointer-events-none",
  ].join(" ");

  return (
    <div className="relative flex h-screen overflow-hidden bg-transparent" style={themeVars}>
      <div className={sidebarWrap}>
        <Sidebar onClose={() => setOpen(false)} />
      </div>

      <div
        className={`fixed inset-0 z-30 bg-black/20 transition-opacity duration-300 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* Logo top-left (mobile, when sidebar closed) — slightly lowered from very top */}
      {showButton && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="fixed left-4 top-12 z-50 flex h-11 w-11 items-center justify-center rounded-xl bg-card/90 shadow-[0_8px_40px_rgba(0,0,0,0.1)] md:hidden"
          aria-label="Refresh page"
        >
          <img src="/images/logo.jpg" alt="Schedly" className="h-9 w-9 rounded-xl object-cover" />
        </button>
      )}

      {/* Floating menu button — opens the sidebar drawer (top-right, slightly lowered) */}
      {showButton && (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-4 top-12 z-50 flex h-11 w-11 items-center justify-center rounded-xl bg-sidebar/90 text-sidebar-foreground shadow-[0_8px_40px_rgba(0,0,0,0.12)] transition-colors hover:bg-sidebar md:flex"
          aria-label="Show sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <main
          className={[
            "flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-x-none p-4 ease-out sm:p-6",
            "pb-28 md:pb-4",
            open ? "md:-translate-x-[304px]" : "",
          ].join(" ")}
        >
          <div className="mx-auto w-full max-w-3xl md:w-full">
            <div className="hidden md:mb-5 md:mt-2 md:flex md:items-center">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex items-center"
                aria-label="Refresh page"
              >
                <img
                  src="/images/logo.jpg"
                  alt="Schedly"
                  className="h-9 w-9 rounded-xl object-cover"
                />
              </button>
            </div>
            <div className="grid min-h-[calc(100vh-9rem)] w-full place-items-center md:min-h-[calc(100vh-7rem)]">
              <div className="w-full">{children}</div>
            </div>
          </div>
        </main>
      </div>

      <BottomNav />
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <DashboardShell>{children}</DashboardShell>
    </ThemeProvider>
  );
}
