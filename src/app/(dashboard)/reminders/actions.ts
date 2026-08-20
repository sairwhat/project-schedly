"use server";

import { headers } from "next/headers";

export async function getUserReminders() {
  const { auth } = await import("@/server/lib/auth");
  const { reminderService } = await import("@/server/services/reminder.service");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];
  return reminderService.getByUser(session.user.id);
}

/** Re-schedule exact-time QStash reminders for the signed-in user. Called
 *  after reminder edits and from the app shell (throttled client-side). */
export async function scheduleUpcomingReminders() {
  const { auth } = await import("@/server/lib/auth");
  const { scheduleQstashReminders } = await import("@/server/services/qstash-reminder.service");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false };
  try {
    const result = await scheduleQstashReminders(new Date(), session.user.id);
    return { ok: true, ...result };
  } catch (err) {
    console.error("[SCHEDULE_UPCOMING]", err);
    return { ok: false };
  }
}

/** Client heartbeat — dispatches due reminders for the signed-in user NOW.
 *  QStash isn't configured in this deployment, so exact-time reminders only
 *  fire when something checks for them: this runs while the app is open (the
 *  daily cron remains the safety net for when it's closed). Delivery is
 *  deduped via lastSentAt/lastStartSentAt, so polling every minute is safe. */
export async function dispatchUserReminders() {
  const { auth } = await import("@/server/lib/auth");
  const { dispatchDueReminders } = await import("@/server/services/reminder-dispatcher.service");
  const { dispatchTodoDeadlines } = await import("@/server/services/todo-deadline-reminder.service");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false };
  try {
    const result = await dispatchDueReminders(new Date(), session.user.id);
    const todos = await dispatchTodoDeadlines(new Date(), session.user.id);
    return { ok: true, ...result, todos };
  } catch (err) {
    console.error("[DISPATCH_USER]", err);
    return { ok: false };
  }
}

export type UpdateReminderResult =
  | { success: true }
  | { success: false; error: string };

export type UpdateAllReminderMinutesResult =
  | { success: true; count: number }
  | { success: false; error: string };

/** Set the advance time (minutes before class) on every reminder the signed-in
 *  user has. Used by the post-save "Remind Me Before Class" setup screen. */
export async function updateAllReminderMinutes(minutes: number): Promise<UpdateAllReminderMinutesResult> {
  const { auth } = await import("@/server/lib/auth");
  const { reminderService } = await import("@/server/services/reminder.service");
  const { auditLog } = await import("@/server/lib/audit");
  const { scheduleQstashReminders } = await import("@/server/services/qstash-reminder.service");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  if (minutes < 0 || minutes > 1440 || !Number.isInteger(minutes)) {
    return { success: false, error: "Invalid minutes" };
  }

  try {
    const reminders = await reminderService.getByUser(session.user.id);
    await Promise.all(
      reminders.map((r) => reminderService.update(r.id, { minutesBefore: minutes }))
    );
    auditLog("reminders.update_all", { minutesBefore: minutes, count: reminders.length });
    // Re-schedule exact-time pushes so edits take effect for the next occurrence.
    await scheduleQstashReminders(new Date(), session.user.id).catch(() => {});
    return { success: true, count: reminders.length };
  } catch (err) {
    console.error("[UPDATE_ALL_REMINDERS]", err);
    return { success: false, error: "Failed to update reminders" };
  }
}

export async function updateReminder(
  reminderId: string,
  data: { minutesBefore?: number; isActive?: boolean }
): Promise<UpdateReminderResult> {
  const { auth } = await import("@/server/lib/auth");
  const { reminderService } = await import("@/server/services/reminder.service");
  const { auditLog } = await import("@/server/lib/audit");
  const { scheduleQstashReminders } = await import("@/server/services/qstash-reminder.service");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  const minutes = data.minutesBefore;
  if (minutes != null && (minutes < 0 || minutes > 1440 || !Number.isInteger(minutes))) {
    return { success: false, error: "Invalid minutes" };
  }

  const reminder = await reminderService.getById(reminderId);
  if (!reminder || reminder.userId !== session.user.id) {
    return { success: false, error: "Reminder not found" };
  }

  try {
    await reminderService.update(reminderId, {
      minutesBefore: minutes ?? undefined,
      isActive: data.isActive ?? undefined,
    });
    auditLog("reminders.update", { reminderId, minutesBefore: minutes, isActive: data.isActive });
    // Re-schedule exact-time pushes so edits take effect for the next occurrence.
    await scheduleQstashReminders(new Date(), session.user.id).catch(() => {});
    return { success: true };
  } catch (err) {
    console.error("[UPDATE_REMINDER]", err);
    return { success: false, error: "Failed to update reminder" };
  }
}