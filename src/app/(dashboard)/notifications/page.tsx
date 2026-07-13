"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Calendar,
  Info,
  Clock,
} from "lucide-react";

type Notification = {
  id: string;
  type: "class_reminder" | "schedule_update" | "system";
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

const DEMO_NOTIFICATIONS: Notification[] = [
  {
    id: "1",
    type: "class_reminder",
    title: "Class Starting Soon",
    body: "Math 101 starts in 15 minutes — Room 301",
    read: false,
    createdAt: new Date(Date.now() - 300000).toISOString(),
  },
  {
    id: "2",
    type: "schedule_update",
    title: "Schedule Updated",
    body: "Your Science 201 class has been moved to Room 502",
    read: false,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "3",
    type: "system",
    title: "Welcome to Schedly!",
    body: "Upload your first schedule to get started with AI-powered timetable management.",
    read: true,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "4",
    type: "class_reminder",
    title: "Assignment Reminder",
    body: "English 102 essay is due tomorrow — don't forget!",
    read: true,
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
];

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

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>(DEMO_NOTIFICATIONS);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  function markAsRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function deleteNotification(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filtered =
    filter === "unread"
      ? notifications.filter((n) => !n.read)
      : notifications;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {unreadCount > 0 ? `You have ${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}` : "You're all caught up!"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-1 rounded-lg bg-card/30 p-1 w-fit backdrop-blur-sm">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all ${
              filter === f
                 ? "bg-card/30 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
            {f === "unread" && unreadCount > 0 && (
              <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Notifications */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/30 py-16">
          <Bell className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {filter === "unread"
              ? "No unread notifications."
              : "No notifications yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((notification) => {
            const Icon = typeIcons[notification.type];
            return (
              <div
                key={notification.id}
                className={`group flex items-start gap-4 rounded-xl bg-card/30 px-4 py-3.5 transition-all hover:shadow-sm border border-border/30 ${
                  !notification.read ? "border-l-2 border-l-primary" : ""
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${typeColors[notification.type]}`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`text-sm font-medium ${
                        notification.read ? "text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      {notification.title}
                    </p>
                    {!notification.read && (
                      <div className="h-2 w-2 shrink-0 rounded-full bg-primary mt-1.5" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {notification.body}
                  </p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">
                    {timeAgo(notification.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!notification.read && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => markAsRead(notification.id)}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteNotification(notification.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
