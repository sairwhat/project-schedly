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
    "fixed right-0 top-0 bottom-0 z-40 w-[304px] p-3 transition-transform duration-300 ease-out will-change-transform",
    open ? "translate-x-0" : "translate-x-full",
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

      {/* Mobile top app bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-card/95 px-4 backdrop-blur-md md:hidden">
        <img src="/images/logo.jpg" alt="Schedly" className="h-9 w-9 rounded-xl object-cover" />
        <span className="text-lg font-bold tracking-tight text-foreground">Schedly</span>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="ml-auto flex h-11 w-11 items-center justify-center rounded-xl text-foreground/70 transition-colors hover:bg-muted"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
      </header>

      {/* Legacy floating menu (kept for md+ when sidebar closed) */}
      {showButton && (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-4 top-4 z-50 hidden h-11 w-11 items-center justify-center rounded-xl bg-sidebar/90 text-sidebar-foreground shadow-[0_8px_40px_rgba(0,0,0,0.12)] transition-colors hover:bg-sidebar md:flex"
          aria-label="Show sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <main
          className={[
            "flex-1 overflow-y-auto p-4 transition-transform duration-300 ease-out sm:p-6",
            "pt-20 md:pt-4",
            "pb-24 md:pb-4",
            open ? "md:-translate-x-[304px]" : "",
          ].join(" ")}
        >
          <div className="mx-auto w-[90%] max-w-3xl md:w-full">
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
