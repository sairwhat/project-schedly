"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { primaryNav } from "@/config/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";
import {
  LayoutDashboard,
  Calendar,
  CheckSquare,
  BellRing,
  Timer,
  Newspaper,
  BookOpen,
  Camera,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "layout-dashboard": LayoutDashboard,
  calendar: Calendar,
  "check-square": CheckSquare,
  "bell-ring": BellRing,
  timer: Timer,
  newspaper: Newspaper,
  "book-open": BookOpen,
};

/** The center "camera" button always opens its own dedicated capture card. */
const ADD_PAGE = "/capture";

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = Boolean((user as Record<string, unknown> | null)?.isAdmin);
  const items = primaryNav.filter((item) => !item.adminOnly || isAdmin);

  const handleQuickAdd = () => {
    if (pathname === ADD_PAGE) {
      // Already on the capture card — tell it to start a fresh capture.
      window.dispatchEvent(new CustomEvent("schedly:quickadd"));
    } else {
      router.push(ADD_PAGE);
    }
  };

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 md:hidden"
    >
<div
        className="bottom-nav flex items-end justify-center gap-2 rounded-[1.75rem] border border-border/60 bg-card/90 px-3 shadow-[0_12px_40px_rgba(0,0,0,0.22)] ring-1 ring-black/[0.03] backdrop-blur-xl"
        style={{ paddingBottom: "calc(0.75rem + var(--sab))", marginBottom: "calc(1.25rem + var(--sab))" }}
      >
        {items.slice(0, 2).map((item) => {
          const Icon = iconMap[item.icon] || Calendar;
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
              className={cn(
                "relative flex h-11 w-11 items-center justify-center rounded-full transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-7 w-7 translate-y-1.5" strokeWidth={active ? 2 : 1.75} />
            </Link>
          );
        })}

        <button
          type="button"
          onClick={handleQuickAdd}
          aria-label="Quick add"
          title="Quick add"
          className="relative -mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-card bg-primary text-primary-foreground shadow-[0_6px_20px_rgba(0,0,0,0.28)] transition-transform active:scale-95"
        >
          <Camera className="h-6 w-6 -translate-y-0.5" strokeWidth={2.5} />
        </button>

        {items.slice(2).map((item) => {
          const Icon = iconMap[item.icon] || Calendar;
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
              className={cn(
                "relative flex h-11 w-11 items-center justify-center rounded-full transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-7 w-7 translate-y-1.5" strokeWidth={active ? 2 : 1.75} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}