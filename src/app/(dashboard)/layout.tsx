"use client";

import { useEffect, useSyncExternalStore, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Sidebar } from "@/components/sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { OfflineBanner } from "@/components/offline-banner";
import { NotificationBell } from "@/components/notification-bell";
import { useThemeConfig } from "@/features/theme";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { reportClientType, type ClientType } from "./actions";
import { getUserSchedules } from "@/app/(dashboard)/schedule/actions";
import { getUserReminders, scheduleUpcomingReminders, dispatchUserReminders } from "@/app/(dashboard)/reminders/actions";
import { programReminderAlarms } from "@/lib/notification-scheduler";
import { cachedAction } from "@/lib/server-action-cache";
import { subscribeOpen, getOpenSnapshot, setOpen } from "@/lib/sidebar-drawer";
import {
  getNotificationDetailSnapshot,
  subscribeNotificationDetail,
} from "@/lib/notification-detail-store";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { themeVars } = useThemeConfig();
  const open = useSyncExternalStore(subscribeOpen, getOpenSnapshot, () => false);
  const detailOpen = useSyncExternalStore(
    subscribeNotificationDetail,
    getNotificationDetailSnapshot,
    () => false,
  );
  const showButton = !open;
  const pathname = usePathname();
  const router = useRouter();
  const [avatarError, setAvatarError] = useState(false);

  // First-time users are pushed through the setup flow before using the app.
  const { user, isLoading } = useAuth();
  const userObj = user as { onboardingCompleted?: boolean; emailVerified?: boolean } | null;
  const needsOnboarding =
    !isLoading && user && !userObj?.onboardingCompleted;
  // Email must be verified before the user can enter the app — covers users
  // who still hold a session created before verification was enforced.
  const needsEmailVerification =
    !isLoading && user && userObj?.emailVerified === false;

  const u = user as
    | {
        firstName?: string;
        lastName?: string;
        image?: string;
        avatarUrl?: string;
      }
    | null
    | undefined;
  const firstName = u?.firstName || "User";
  const lastName = u?.lastName || "";
  const displayName = lastName ? `${firstName} ${lastName}` : firstName;
  const initials = firstName.charAt(0).toUpperCase();
  const rawAvatar = u?.image || u?.avatarUrl || null;
  // Ensure avatar URL is absolute for Capacitor/PWA origins.
  const resolvedAvatar =
    rawAvatar && !rawAvatar.startsWith("data:") && !rawAvatar.startsWith("http") && rawAvatar.startsWith("/")
      ? `${typeof window !== "undefined" ? window.location.origin : ""}${rawAvatar}`
      : rawAvatar;
  const userAvatar = avatarError ? null : resolvedAvatar;

  // Reset the broken-avatar flag when the session's avatar actually changes.
  useEffect(() => {
    const id = requestAnimationFrame(() => setAvatarError(false));
    return () => cancelAnimationFrame(id);
  }, [resolvedAvatar]);

  // Auto-download offline support: once signed in, warm the cache with the
  // main tab pages so they're instantly available (and work) offline. The
  // avatar is warmed too so the user's photo still renders without internet.
  // Runs once per session and only after the page has settled — hitting 7
  // pages at once on app open just competes with the first paint.
  useEffect(() => {
    if (!user || !("serviceWorker" in navigator)) return;
    const KEY = `schedly-precached-${(user as { id?: string }).id ?? ""}`;
    try {
      if (sessionStorage.getItem(KEY)) return;
    } catch {
      // No sessionStorage (rare) — still precache.
    }
    const timer = setTimeout(() => {
      navigator.serviceWorker.ready
        .then((reg) => {
          const avatar = (user as { image?: string; avatarUrl?: string } | null)?.image
            || (user as { image?: string; avatarUrl?: string } | null)?.avatarUrl;
          reg.active?.postMessage({
            type: "PRECACHE",
            urls: [
              "/dashboard", "/schedule", "/capture", "/notes", "/notifications", "/pomodoro", "/gwa",
              ...(avatar ? [avatar] : []),
            ],
          });
          // Re-arm pending class-reminder alarms after every app open so they
          // still fire even if the tab/SW was closed since they were set.
          reg.active?.postMessage({ type: "REARM_ALARMS" });
        })
        .catch(() => {});
    }, 3000);
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      // Best-effort.
    }
    return () => clearTimeout(timer);
  }, [user]);

  // Arm local class-reminder alarms from the service worker on every app open
  // (any dashboard page), not just the Notifications page. Local alarms fire
  // at the exact minute via Notification Triggers (installed PWA) or the SW
  // ticker while the app is open. Exact-time delivery when the app is closed
  // comes from QStash, re-scheduled here (throttled) so edits take effect.
  useEffect(() => {
    if (!user || !("serviceWorker" in navigator)) return;
    let active = true;
    // Deduped: the layout and the pages both fetch schedules/reminders, so
    // these collapse into one request instead of 2-4 per navigation.
    Promise.all([
      cachedAction("layout:schedules", () => getUserSchedules()),
      cachedAction("layout:reminders", () => getUserReminders()),
    ])
      .then(([schedules, reminders]) => {
        if (!active) return;
        if (schedules.length > 0 && reminders.length > 0) {
          programReminderAlarms(schedules as never, reminders as never).catch(() => {});
        }
      })
      .catch(() => {});
    // Refresh exact-time QStash deliveries (30s throttle, no-op until tokens
    // are configured).
    cachedAction("layout:qstash", () => scheduleUpcomingReminders(), 30_000).catch(() => {});
    return () => {
      active = false;
    };
  }, [user, pathname]);

  // Client heartbeat — QStash isn't configured in this deployment, so exact-
  // time class reminders only fire when something checks for them. Poll the
  // dispatcher every 30s while the app is open (and on every focus/visibility
  // change) so enabled reminders actually go out on time. Deduped server-side
  // via lastSentAt/lastStartSentAt, so frequent polling never double-sends.
  useEffect(() => {
    if (!user) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      cachedAction("layout:dispatch", () => dispatchUserReminders(), 30_000).catch(() => {});
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    const onVis = () => tick();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [user]);

  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding");
    else if (needsEmailVerification && user) {
      const email = encodeURIComponent((user as { email?: string }).email || "");
      router.replace(`/verify-email/pending?email=${email}`);
    }
  }, [needsOnboarding, needsEmailVerification, user, router]);

  // Record what the user is running on (web, PWA on Android/iOS, or the
  // Android APK) so the admin dashboard can show each user's device. Runs
  // once per session per type, so it doesn't spam the database.
  useEffect(() => {
    if (!user) return;
    let type: ClientType = "web";
    try {
      if (Capacitor.isNativePlatform()) {
        type = "apk";
      } else {
        const standalone =
          (window.matchMedia?.("(display-mode: standalone)")?.matches ?? false) ||
          (navigator as { standalone?: boolean }).standalone === true;
        if (standalone) {
          type =
            /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
              ? "pwa-ios"
              : "pwa-android";
        }
      }
    } catch {
      type = "web";
    }
    const KEY = `schedly-client-${(user as { id?: string }).id ?? ""}`;
    const now = Date.now();
    try {
      const cached = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as {
        type: ClientType;
        at: number;
      } | null;
      if (cached?.type === type && now - cached.at < 6 * 60 * 60 * 1000) return;
      sessionStorage.setItem(KEY, JSON.stringify({ type, at: now }));
    } catch {
      // No sessionStorage (rare) — still report.
    }
    reportClientType(type).catch(() => {});
  }, [user]);
  // The design editor is immersive on mobile: no fixed header, drawer,
  // backdrop, or bottom nav covering it — the canvas fills the screen.
  const isImmersive = pathname === "/design";

  // Account settings is a full-screen page — hide the bottom nav there.
  const isSettings = pathname === "/settings";

  // Profile page turns the top-left avatar into a back arrow.
  const isProfile = pathname === "/profile";  // Admin pages are full-screen — same treatment as settings/profile.
  const isAdmin = pathname.startsWith("/admin");

  // Notifications page is opened from the bell icon.
  const isNotifications = pathname === "/notifications";

  // Feedback page is opened from the support section.
  const isFeedback = pathname === "/feedback";

  // Close the mobile drawer on every navigation so it never stays open
  // covering a page (e.g., after coming back from the design editor).
  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) return;
    setOpen(false);
  }, [pathname]);

  // Reset the scroll position on navigation so the next page starts at the
  // top instead of resuming where the previous page left off.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  // Full-screen edge-to-edge on Android: the status bar stays visible but
  // transparent, and the app adapts its safe-area padding around it.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    StatusBar.show().catch(() => {});
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  }, []);

  // The shell always renders: while the session loads, each page shows its
  // own skeletons instead of a full-screen loading state, so a refresh feels
  // like the cards are simply refreshing in place.
  const sidebarWrap = [
    "sidebar-slide fixed right-3 top-16 z-40 w-[304px] max-w-[calc(100vw-1.5rem)] max-h-[70vh] will-change-transform md:hidden",
    open ? "translate-y-0 opacity-100" : "-translate-y-[130%] opacity-0",
  ].join(" ");

  return (
    <div
      className="relative isolate flex min-h-dvh-fallback"
      style={themeVars}
    >
      <div className={sidebarWrap} inert={!open}>
        <Sidebar onClose={() => setOpen(false)} />
      </div>

      <div
        className={`fixed inset-0 z-30 bg-black/20 transition-opacity duration-300 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        } ${isImmersive ? "hidden" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* Floating menu button — mobile only; on desktop the persistent left
          rail replaces the drawer, so there is nothing to open. */}
      {!isImmersive && showButton && !detailOpen && (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-4 top-[calc(env(safe-area-inset-top)+1rem)] z-50 flex h-11 w-11 items-center justify-center rounded-xl bg-sidebar/90 text-sidebar-foreground shadow-[0_8px_40px_rgba(0,0,0,0.12)] transition-colors hover:bg-sidebar md:hidden"
          aria-label="Show sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/* Floating avatar / back arrow — mobile only, top right on every tab.
          On desktop each page header renders its own inline avatar. */}
      {!isImmersive && showButton && !detailOpen && (
        <button
          type="button"
          onClick={() => {
            if (isSettings || isProfile || isNotifications) {
              router.push("/dashboard");
            } else if (isAdmin || isFeedback) {
              router.push("/settings?tab=support");
            } else {
              router.push("/profile");
            }
          }}
          className={cn(
            "fixed left-4 top-[calc(env(safe-area-inset-top)+1rem)] z-50 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-sidebar/90 text-sidebar-foreground shadow-[0_8px_40px_rgba(0,0,0,0.12)] transition-all duration-300 hover:bg-sidebar md:hidden"
          )}
          aria-label={
            isSettings || isProfile || isNotifications || isAdmin || isFeedback
              ? "Go back"
              : "Open profile"
          }
        >
          {isSettings || isProfile || isNotifications || isAdmin || isFeedback ? (
            <ArrowLeft className="h-6 w-6" />
          ) : userAvatar ? (
            <img
              src={userAvatar}
              alt={displayName}
              onError={() => setAvatarError(true)}
              className="h-11 w-11 rounded-full object-cover ring-2 ring-border/40"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary ring-2 ring-border/40">
              {initials}
            </div>
          )}
        </button>
      )}

      {/* Floating notification bell — mobile only; desktop pages render it
          inline in their headers. */}
      {!isImmersive && showButton && !isNotifications && !detailOpen && (
        <NotificationBell className="md:hidden" />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
          <main
            onClick={() => setOpen(false)}
            className={[
              "flex-1",
              isImmersive ? "" : "px-4 pt-[calc(env(safe-area-inset-top)+4rem)] pb-28 sm:px-6 sm:pt-[calc(env(safe-area-inset-top)+4rem)] md:px-8 md:pt-16 md:pb-12",
            ].join(" ")}
          >
          {isImmersive ? (
            <div key={pathname} className="animate-fade-up h-dvh-fallback overflow-y-auto p-0 md:p-6 md:pt-20">
              {children}
            </div>
          ) : (
            <div key={pathname} className="animate-fade-up mx-auto w-full min-w-0 max-w-6xl">{children}</div>
          )}
        </main>
        </div>

      {!isImmersive && !isProfile && !isNotifications && !isSettings && !isAdmin && <BottomNav />}
      {!isImmersive && <OfflineBanner />}
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
