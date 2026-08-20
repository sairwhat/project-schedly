"use server";

import { headers } from "next/headers";

export async function getUserNotifications() {
  const { auth } = await import("@/server/lib/auth");
  const { notificationService } = await import("@/server/services/notification.service");
  const { cleanupClassReminderList } = await import("@/server/services/class-reminder-notify");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];
  // Tidy class-reminder floods (legacy duplicates / per-title backlog).
  await cleanupClassReminderList(session.user.id);
  return notificationService.getByUser(session.user.id);
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { auth } = await import("@/server/lib/auth");
  const { notificationService } = await import("@/server/services/notification.service");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return 0;
  return notificationService.countUnread(session.user.id);
}

export async function markNotificationRead(id: string): Promise<{ success: boolean }> {
  const { auth } = await import("@/server/lib/auth");
  const { notificationService } = await import("@/server/services/notification.service");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };
  try {
    await notificationService.markAsRead(id);
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function markAllNotificationsRead(): Promise<{ success: boolean }> {
  const { auth } = await import("@/server/lib/auth");
  const { notificationService } = await import("@/server/services/notification.service");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };
  try {
    await notificationService.markAllAsRead(session.user.id);
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function deleteNotification(id: string): Promise<{ success: boolean }> {
  const { auth } = await import("@/server/lib/auth");
  const { notificationService } = await import("@/server/services/notification.service");
  const { auditLog } = await import("@/server/lib/audit");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };
  try {
    await notificationService.delete(id);
    auditLog("notification.delete", { userId: session.user.id, notificationId: id });
    return { success: true };
  } catch {
    return { success: false };
  }
}
