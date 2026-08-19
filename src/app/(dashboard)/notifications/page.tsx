"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification as deleteNotificationAction,
} from "@/app/(dashboard)/notifications/actions";
import {
  setNotificationDetailOpen,
} from "@/lib/notification-detail-store";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Skeleton as BoneSkeleton } from "boneyard-js/react";
import { HeaderBack } from "@/components/header-back";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Calendar,
  Info,
  Clock,
  Camera,
  ArrowLeft,
} from "lucide-react";

type Notification = {
  id: string;
  type: "class_reminder" | "schedule_update" | "system";
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const typeIcons = {
  class_reminder: Clock,
  schedule_update: Calendar,
  system: Info,
};

const typeColors = {
  class_reminder: "bg-primary/10 text-primary",
  schedule_update: "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400",
  system: "bg-muted text-muted-foreground",
};

/** Friendlier category label for a notification. To-do deadline reminders
 *  reuse the `system` type, so they get a readable label instead of "system". */
function typeLabel(n: { type: Notification["type"]; title: string }): string {
  if (n.type === "system" && (n.title === "Task due today" || n.title === "Task overdue")) {
    return "task reminder";
  }
  return n.type.replace("_", " ");
}

export function NotificationsPage() {
  const router = useRouter();

  // Notifications state
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getUserNotifications()
      .then((dbNotifications) => {
        if (!active) return;
        const dbNotes = dbNotifications.map((n) => ({
          id: n.id,
          type: n.type as Notification["type"],
          title: n.title,
          body: n.body,
          read: n.read,
          createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : String(n.createdAt),
        }));
        setNotifications(
          dbNotes.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        );
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Reset the shared detail-open state when leaving this page so the layout
  // doesn't keep hiding the avatar/floating buttons after navigation.
  useEffect(() => {
    return () => setNotificationDetailOpen(false);
  }, []);

  function markAsRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    markNotificationRead(id).catch(() => {});
  }

  function openNotification(notification: Notification) {
    setOpenId(notification.id);
    setNotificationDetailOpen(true);
    if (!notification.read) markAsRead(notification.id);
  }

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    markAllNotificationsRead().catch(() => {});
  }

  function deleteNotification(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    deleteNotificationAction(id).catch(() => {});
  }

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filtered =
    filter === "unread"
      ? notifications.filter((n) => !n.read)
      : notifications;

  return (
    <div className="mx-auto max-w-3xl space-y-5 pt-8 md:pt-0">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-3">
          <HeaderBack to="/dashboard" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Notifications
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} unread — stay on top of your schedule.`
                : "You're all caught up."}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={markAllRead}
            className="shrink-0"
          >
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      {loaded && notifications.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex gap-1 rounded-xl bg-card/30 p-1 backdrop-blur-sm">
            {(["all", "unread"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`relative rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  filter === f
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f}
                {f === "unread" && unreadCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold leading-none text-primary-foreground shadow-sm">
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{filtered.length} shown</p>
        </div>
      )}

      <BoneSkeleton
        name="notifications-tab-list"
        loading={!loaded}
        fallback={
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-4 rounded-2xl border border-border/30 bg-card/30 px-4 py-4">
                <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        }
      >
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Bell className="h-7 w-7 text-primary/60" />
          </div>
          <p className="text-sm font-medium text-foreground">
            {filter === "unread" ? "No unread notifications" : "No notifications yet"}
          </p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            {filter === "unread"
              ? "Nice — you've read everything."
              : "Upload a schedule photo and you'll see its updates here."}
          </p>
          {filter !== "unread" && (
            <Button className="mt-5" onClick={() => router.push("/schedule")}>
              <Camera className="mr-1.5 h-4 w-4" />
              Upload Schedule
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((notification) => {
            const Icon = typeIcons[notification.type];
            const unread = !notification.read;
            return (
              <div
                key={notification.id}
                onClick={() => openNotification(notification)}
                className={`group flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-4 transition-[background-color,box-shadow] hover:shadow-sm sm:gap-4 ${
                  unread
                    ? "border-primary/25 bg-primary/[0.04]"
                    : "border-border/30 bg-card/30"
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${typeColors[notification.type]}`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`text-sm font-semibold ${
                        unread ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {notification.title}
                    </p>
                    <span className="shrink-0 text-[11px] text-muted-foreground/60">
                      {timeAgo(notification.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {notification.body}
                  </p>
                </div>
                {/* Actions — visible on touch, hover-revealed on desktop */}
                <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  {unread ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsRead(notification.id);
                      }}
                      aria-label="Mark as read"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  ) : (
                    <span className="hidden h-8 w-8" aria-hidden />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNotification(notification.id);
                    }}
                    aria-label="Delete notification"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </BoneSkeleton>

      {/* Gmail-style full view of a single notification */}
      {openId && (
        <NotificationDetail
          notification={notifications.find((n) => n.id === openId) ?? null}
          onBack={() => {
            setOpenId(null);
            setNotificationDetailOpen(false);
          }}
          onDelete={(id) => {
            deleteNotification(id);
            setOpenId(null);
            setNotificationDetailOpen(false);
          }}
        />
      )}
    </div>
  );
}

function NotificationDetail({
  notification,
  onBack,
  onDelete,
}: {
  notification: Notification | null;
  onBack: () => void;
  onDelete: (id: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  if (!notification) return null;
  const Icon = typeIcons[notification.type];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 animate-fade-up">
      <div className="relative z-10 flex h-full max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border/40 bg-background shadow-2xl">
        {/* Header bar */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            onClick={onBack}
            aria-label="Back to notifications"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="flex-1 truncate text-base font-semibold text-foreground">
            {notification.title}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(notification.id)}
            aria-label="Delete notification"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Message body — centered tall floating card reading pane */}
        <div className="flex-1 overflow-y-auto px-5 pb-10">
          <div className="mx-auto mt-2 max-w-2xl">
            <div className="flex items-start gap-4 rounded-2xl border border-border/30 bg-card/30 px-5 py-4">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${typeColors[notification.type]}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold leading-snug text-foreground">
                  {notification.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="capitalize">
                    {typeLabel(notification)}
                  </span>
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                  <span>{new Date(notification.createdAt).toLocaleString()}</span>
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                  <span>{timeAgo(notification.createdAt)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-border/30 bg-card/30 px-5 py-6 text-[15px] leading-relaxed text-foreground">
              {notification.body}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NotificationsPage;