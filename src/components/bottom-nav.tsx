"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { mainNav } from "@/config/navigation";
import {
  LayoutDashboard,
  Calendar,
  CheckSquare,
  BellRing,
  Timer,
  GraduationCap,
  StickyNote,
  Music,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "layout-dashboard": LayoutDashboard,
  calendar: Calendar,
  "check-square": CheckSquare,
  "bell-ring": BellRing,
  timer: Timer,
  "sticky-note": StickyNote,
  "graduation-cap": GraduationCap,
  music: Music,
};

// MD3 bottom nav shows up to 5 primary destinations. Keep the most-used ones.
const PRIMARY_HREFS = [
  "/dashboard",
  "/schedule",
  "/todo",
  "/reminders",
  "/pomodoro",
];

export function BottomNav() {
  const pathname = usePathname();
  const items = mainNav.filter((i) => PRIMARY_HREFS.includes(i.href));

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 md:hidden"
      style={{ paddingBottom: "calc(1rem + var(--sab))" }}
    >
      <div className="bottom-nav flex w-full max-w-md items-stretch justify-around gap-1 rounded-full border border-border/70 bg-card/95 px-2 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.18)] backdrop-blur-md">
        {items.map((item) => {
          const Icon = iconMap[item.icon] || Calendar;
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-[48px] min-w-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-full px-2 py-1.5 transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-12 items-center justify-center rounded-full transition-all duration-200",
                  active && "bg-primary/12"
                )}
              >
                <Icon className="h-[22px] w-[22px]" />
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium leading-none tracking-tight",
                  active ? "font-semibold" : "font-normal"
                )}
              >
                {item.label.split(" ")[0]}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
