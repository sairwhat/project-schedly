"use client";

import { useState, useEffect } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { ThemeProvider, useThemeConfig } from "@/features/theme";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { themeVars } = useThemeConfig();
  const [open, setOpen] = useState(true);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setOpen(mq.matches);
  }, []);

  useEffect(() => {
    if (open) {
      setShowButton(false);
      return;
    }
    const t = setTimeout(() => setShowButton(true), 320);
    return () => clearTimeout(t);
  }, [open]);

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

      {showButton && (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-xl bg-sidebar/90 text-sidebar-foreground shadow-[0_8px_40px_rgba(0,0,0,0.12)] transition-colors hover:bg-sidebar"
          aria-label="Show sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <main
          className={[
            "flex-1 overflow-y-auto p-4 transition-transform duration-300 ease-out sm:p-6",
            open ? "md:-translate-x-[304px]" : "",
          ].join(" ")}
        >
          <div className="mx-auto w-[90%] max-w-3xl md:w-full">
            <div className="mb-5 flex items-center gap-2.5">
              <img
                src="/images/logo.jpg"
                alt="Schedly"
                className="h-9 w-9 rounded-xl object-cover"
              />
              <span className="text-lg font-bold tracking-tight text-foreground">
                Schedly
              </span>
            </div>
            <div className="grid min-h-[calc(100vh-7rem)] w-full place-items-center">
              <div className="w-full">{children}</div>
            </div>
          </div>
        </main>
      </div>
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
