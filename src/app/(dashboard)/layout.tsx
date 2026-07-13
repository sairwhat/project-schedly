"use client";

import { useState, useEffect } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
    open ? "translate-y-0" : "-translate-y-full",
  ].join(" ");

  return (
    <div className="relative flex h-screen overflow-hidden bg-transparent">
      <div className={sidebarWrap}>
        <Sidebar onClose={() => setOpen(false)} />
      </div>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px] md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {showButton && (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-xl bg-sidebar/60 text-sidebar-foreground shadow-[0_8px_40px_rgba(0,0,0,0.12)] backdrop-blur-2xl transition-colors hover:bg-sidebar/80"
          aria-label="Show sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <main
          className={[
            "flex-1 overflow-y-auto p-4 transition-[padding] duration-300 ease-out sm:p-6",
            open ? "md:pr-[304px]" : "md:pr-0",
          ].join(" ")}
        >
          <div className="grid min-h-full w-full place-items-center">
            <div className="mx-auto w-[50%] max-w-3xl md:w-full">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
