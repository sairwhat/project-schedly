"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navGroups, primaryNav, type NavGroup, type NavItem } from "@/config/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ThemePicker } from "@/components/theme-picker";
import {
  Calendar,
  ArrowUp,
  CheckSquare,
  Bell,
  BellRing,
  GraduationCap,
  Inbox,
  ChevronRight,
  LifeBuoy,
  Timer,
  LayoutDashboard,
  UploadCloud,
  StickyNote,
  Layers,
  Info,
  User,
  Settings,
  LogOut,
  BookOpen,
  Newspaper,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  calendar: Calendar,
  upload: ArrowUp,
  "check-square": CheckSquare,
  bell: Bell,
  "bell-ring": BellRing,
  "graduation-cap": GraduationCap,
  inbox: Inbox,
  "life-buoy": LifeBuoy,
  timer: Timer,
  "layout-dashboard": LayoutDashboard,
  "upload-cloud": UploadCloud,
  "sticky-note": StickyNote,
  layers: Layers,
  info: Info,
  user: User,
  settings: Settings,
  "book-open": BookOpen,
  newspaper: Newspaper,
};

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const Icon = iconMap[item.icon] || Calendar;
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

  return (
    <Link
      href={item.href}
      prefetch
      onClick={() => onNavigate?.()}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200",
        isActive
          ? "bg-sidebar-primary/15 text-sidebar-primary"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      )}
    >
      {isActive && (
        <div className="absolute right-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-l-full bg-sidebar-primary" />
      )}
      <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive && "text-sidebar-primary")} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge && item.badge > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sidebar-primary px-1.5 text-[10px] font-bold text-sidebar-primary-foreground">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-sidebar-foreground/30 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-sidebar-foreground/60" />
    </Link>
  );
}

// matchMedia must not be read during render — the server has no window, so
// SSR and hydration would disagree. useSyncExternalStore resolves it after
// hydration with the server snapshot ("desktop") used for the initial render.
function subscribeDesktop(listener: () => void) {
  const mq = window.matchMedia("(min-width: 768px)");
  mq.addEventListener("change", listener);
  return () => mq.removeEventListener("change", listener);
}

function getDesktopSnapshot(): boolean {
  return window.matchMedia("(min-width: 768px)").matches;
}

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { user, signOut } = useAuth();

  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, () => true);

  const u = user as
    | {
        firstName?: string;
        lastName?: string;
        email?: string;
        image?: string;
        avatarUrl?: string;
        isAdmin?: boolean;
      }
    | null
    | undefined;

  const pathname = usePathname();
  const isSettings = pathname === "/settings";

  // On desktop the drawer is the only navigation, so the primary destinations
  // (Dashboard, Calendar, To-Do, Pomodoro) are added back. On mobile they live
  // in the Bottom Nav, so the drawer shows only the Tools group.
  const mainGroup: NavGroup = { title: "Main", items: primaryNav };
  const visibleGroups = isDesktop ? [mainGroup, ...navGroups] : navGroups;

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-3xl bg-sidebar/95 shadow-[0_8px_40px_rgba(0,0,0,0.12)]">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 px-5">
        <img src="/images/logo.jpg" alt="" aria-hidden className="h-9 w-9 shrink-0 rounded-xl object-cover" />
        <span className="text-lg font-bold tracking-tight text-sidebar-foreground">
          Schedly
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/50 transition-colors hover:bg-white/10 hover:text-sidebar-foreground"
            aria-label="Hide sidebar"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {visibleGroups.map((group) => (
          <div key={group.title} className="mb-4">
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/30">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.items
                .filter((item) => !item.adminOnly || u?.isAdmin)
                .map((item) => (
                  <NavItemLink key={item.href} item={item} onNavigate={onClose} />
                ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Theme Picker */}
      <ThemePicker />

      {/* User */}
      <div className="px-4 pb-4 space-y-1.5">
        <Link
          href="/settings"
          prefetch
          onClick={() => onClose?.()}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 transition-colors hover:bg-white/10",
            isSettings && "bg-white/10 text-sidebar-primary"
          )}
        >
          <Settings className="h-[18px] w-[18px] shrink-0 text-sidebar-foreground/70" />
          <span className="flex-1 truncate text-left text-sm font-medium text-sidebar-foreground">
            Settings
          </span>
        </Link>
        <button
          type="button"
          onClick={() => signOut()}
          className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 text-left transition-colors hover:bg-white/10"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0 text-sidebar-foreground/70" />
          <span className="flex-1 truncate text-left text-sm font-medium text-sidebar-foreground">
            Sign out
          </span>
        </button>
      </div>

      {/* Footer */}
      <div className="px-5 py-3">
        <p className="text-[11px] text-sidebar-foreground/30">Schedly v0.1.0</p>
      </div>
    </aside>
  );
}
