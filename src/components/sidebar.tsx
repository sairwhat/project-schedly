"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { navGroups, type NavItem } from "@/config/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useThemeConfig, THEME_PRESETS } from "@/features/theme";
import { Check } from "lucide-react";
import {
  Calendar,
  ArrowUp,
  CheckSquare,
  Bell,
  BellRing,
  GraduationCap,
  Inbox,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LifeBuoy,
  Timer,
  LayoutDashboard,
  Music,
  UploadCloud,
  StickyNote,
  Info,
  User,
  Settings,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  music: Music,
  "upload-cloud": UploadCloud,
  "sticky-note": StickyNote,
  info: Info,
  user: User,
  settings: Settings,
};

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const Icon = iconMap[item.icon] || Calendar;
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

  return (
    <Link
      href={item.href}
      onClick={() => {
        if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
          onNavigate?.();
        }
      }}
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

function ThemePicker() {
  const { activeId, setTheme } = useThemeConfig();
  const [start, setStart] = useState(0);
  const VISIBLE = 3;
  const maxStart = Math.max(0, THEME_PRESETS.length - VISIBLE);

  const visible = THEME_PRESETS.slice(start, start + VISIBLE);

  return (
    <div className="px-4 pb-3">
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/30">
        Theme
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setStart((s) => Math.max(0, s - 1))}
          disabled={start === 0}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sidebar-foreground/60 transition-colors hover:bg-white/10 hover:text-sidebar-foreground disabled:opacity-25 disabled:hover:bg-transparent"
          aria-label="Previous themes"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex flex-1 items-center justify-center gap-2">
          {visible.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setTheme(preset.id)}
              className={cn(
                "relative h-7 w-7 rounded-full transition-all duration-200",
                activeId === preset.id
                  ? "ring-2 ring-sidebar-primary ring-offset-2 ring-offset-sidebar scale-110"
                  : "ring-1 ring-sidebar-border/50 hover:ring-sidebar-foreground/30 hover:scale-105"
              )}
              style={{ backgroundColor: preset.swatch }}
              title={preset.name}
              aria-label={`Theme: ${preset.name}`}
            >
              {activeId === preset.id && (
                <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white drop-shadow-sm" />
              )}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setStart((s) => Math.min(maxStart, s + 1))}
          disabled={start >= maxStart}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sidebar-foreground/60 transition-colors hover:bg-white/10 hover:text-sidebar-foreground disabled:opacity-25 disabled:hover:bg-transparent"
          aria-label="Next themes"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 768px)").matches;
  });

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

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

  const firstName = u?.firstName || "User";
  const lastName = u?.lastName || "";
  const displayName = lastName ? `${firstName} ${lastName}` : firstName;
  const initials = [u?.firstName?.[0], u?.lastName?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase() || firstName.charAt(0).toUpperCase();
  const avatarUrl = u?.image || u?.avatarUrl || null;
  const [hello] = useState(() => {
    const h = new Date().getHours();
    return greeting(h);
  });
  const pathname = usePathname();
  const isAdminPage = pathname.startsWith("/admin");

  // On mobile the primary destinations live in the Bottom Navigation,
  // so the drawer only shows secondary tools/account items.
  const visibleGroups = isDesktop
    ? navGroups
    : navGroups.filter((g) => g.title !== "Main");

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-3xl bg-sidebar/95 shadow-[0_8px_40px_rgba(0,0,0,0.12)]">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 px-5">
        <img src="/images/logo.jpg" alt="Schedly" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
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
      <div className="px-4 pb-4">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-sidebar-primary">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="h-9 w-9 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/15 text-sm font-semibold text-sidebar-primary">
                {initials}
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col text-left">
              <p className="truncate text-sm font-medium text-sidebar-foreground">{firstName}</p>
              <p className="truncate text-[11px] text-sidebar-foreground/50">{hello}</p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-sidebar-foreground/40" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="w-56 p-2">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <div className="flex items-center gap-3 rounded-xl bg-sidebar-primary/5 px-3 py-2.5">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName} className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/15 text-sm font-semibold text-sidebar-primary">
                      {initials}
                    </div>
                  )}
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="truncate text-sm font-medium leading-none">{displayName}</p>
                    <p className="truncate text-xs leading-none text-sidebar-foreground/50 mt-1">
                      {u?.email}
                    </p>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem className="cursor-pointer" onClick={() => { if (window.matchMedia("(max-width: 767px)").matches) onClose?.(); router.push("/settings"); }}>
                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
                Account settings
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {u?.isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => { if (window.matchMedia("(max-width: 767px)").matches) onClose?.(); router.push(isAdminPage ? "/dashboard" : "/admin"); }}>
                    {isAdminPage ? (
                      <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                      </svg>
                    ) : (
                      <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                      </svg>
                    )}
                    {isAdminPage ? "Dashboard" : "Admin Dashboard"}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => { if (window.matchMedia("(max-width: 767px)").matches) onClose?.(); router.push("/admin/apk"); }}>
                    <UploadCloud className="mr-2 h-4 w-4" />
                    APK Releases
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem className="cursor-pointer" onClick={() => { if (window.matchMedia("(max-width: 767px)").matches) onClose?.(); router.push("/feedback"); }}>
                <LifeBuoy className="mr-2 h-4 w-4" />
                Help &amp; Feedback
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => signOut()}>
              <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Footer */}
      <div className="px-5 py-3">
        <p className="text-[11px] text-sidebar-foreground/30">Schedly v0.1.0</p>
      </div>
    </aside>
  );
}
