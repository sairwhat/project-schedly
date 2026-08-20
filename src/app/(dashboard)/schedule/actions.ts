"use server";

import { headers } from "next/headers";
import { generateShortName } from "@/lib/abbreviations";
import type { DayOfWeek } from "@/generated/prisma/client";

export type SaveScheduleResult =
  | { success: true; scheduleId: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function saveSchedule(data: unknown): Promise<SaveScheduleResult> {
  const { auth } = await import("@/server/lib/auth");
  const { saveScheduleSchema } = await import("@/server/validators/ai.schema");
  const { scheduleService } = await import("@/server/services/schedule.service");
  const { notificationService } = await import("@/server/services/notification.service");
  const { auditLog } = await import("@/server/lib/audit");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  const parsed = saveScheduleSchema.safeParse(data);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    parsed.error.issues.forEach((issue) => {
      const key = issue.path.join(".");
      if (!fieldErrors[key]) fieldErrors[key] = [];
      fieldErrors[key].push(issue.message);
    });
    return { success: false, error: "Validation failed", fieldErrors };
  }

  try {
    const schedule = await scheduleService.create(session.user.id, parsed.data);
    auditLog("schedule.create", { userId: session.user.id, scheduleId: schedule.id, title: parsed.data.title });
    const classCount = parsed.data.classes.length;
    await notificationService.create(session.user.id, {
      type: "schedule_update",
      title: "Schedule Uploaded",
      body: `${parsed.data.title} is ready — ${classCount} class${classCount !== 1 ? "es" : ""} added.`,
    });
    return { success: true, scheduleId: schedule.id };
  } catch (err) {
    console.error("[SAVE_SCHEDULE]", err);
    return { success: false, error: "Failed to save schedule. Please try again." };
  }
}

export async function deleteSchedule(scheduleId: string): Promise<{ success: boolean; error?: string }> {
  const { auth } = await import("@/server/lib/auth");
  const { scheduleService } = await import("@/server/services/schedule.service");
  const { auditLog } = await import("@/server/lib/audit");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    const result = await scheduleService.delete(scheduleId, session.user.id);
    if (!result) return { success: false, error: "Schedule not found" };
    auditLog("schedule.delete", { userId: session.user.id, scheduleId });
    return { success: true };
  } catch (err) {
    console.error("[DELETE_SCHEDULE]", err);
    return { success: false, error: "Failed to delete schedule" };
  }
}

export async function getSchedule(scheduleId: string) {
  const { auth } = await import("@/server/lib/auth");
  const { scheduleService } = await import("@/server/services/schedule.service");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const schedule = await scheduleService.getByUser(session.user.id);
  return schedule.find((s) => s.id === scheduleId) ?? null;
}

export async function getUserSchedules() {
  const { auth } = await import("@/server/lib/auth");
  const { scheduleService } = await import("@/server/services/schedule.service");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];

  return scheduleService.getByUser(session.user.id);
}

export type ClassEditInput = {
  /** Existing class id, or a "new-*" id to create a fresh class. */
  id: string;
  subject: string;
  shortName?: string | null;
  code?: string | null;
  /** "HH:MM" wall-clock start/end — optional for edits, required for new classes. */
  startTime?: string | null;
  endTime?: string | null;
  /** Days the class occurs on — optional for edits, required for new classes. */
  days?: DayOfWeek[];
};

const VALID_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

function parseHHMM(s: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

/** Class times are stored with UTC components carrying the local wall clock
 *  (see parseTime in schedule.service). Keep the original date and only swap
 *  the wall-clock hours/minutes. */
function applyWallClock(base: Date, t: { h: number; m: number }): Date {
  const d = new Date(base);
  d.setUTCHours(t.h, t.m, 0, 0);
  return d;
}

export async function updateClasses(
  scheduleId: string,
  updates: ClassEditInput[]
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await import("@/server/lib/auth");
  const { db } = await import("@/server/db/client");
  const { scheduleService, DEFAULT_COLORS } = await import("@/server/services/schedule.service");
  const { auditLog } = await import("@/server/lib/audit");
  const { scheduleQstashReminders } = await import("@/server/services/qstash-reminder.service");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  const schedule = await db.schedule.findUnique({
    where: { id: scheduleId },
    select: { userId: true },
  });
  if (!schedule || schedule.userId !== session.user.id) {
    return { success: false, error: "Schedule not found" };
  }

  try {
    const isNew = (id: string) => id.startsWith("new-");
    let classCount = await db.class.count({ where: { scheduleId } });

    for (const u of updates) {
      const subject = u.subject?.trim();
      if (!subject) return { success: false, error: "Subject name is required" };

      const start = u.startTime != null && u.startTime !== "" ? parseHHMM(u.startTime) : null;
      const end = u.endTime != null && u.endTime !== "" ? parseHHMM(u.endTime) : null;
      if (u.startTime != null && u.startTime !== "" && !start) {
        return { success: false, error: "Invalid start time" };
      }
      if (u.endTime != null && u.endTime !== "" && !end) {
        return { success: false, error: "Invalid end time" };
      }
      if (start && end && end.h * 60 + end.m <= start.h * 60 + start.m) {
        return { success: false, error: "End time must be after start time" };
      }
      if (
        u.days !== undefined &&
        (u.days.length === 0 ||
          u.days.some((d) => !VALID_DAYS.includes(d as (typeof VALID_DAYS)[number])))
      ) {
        return { success: false, error: "Select at least one valid class day" };
      }

      if (isNew(u.id)) {
        // New subject — time and days are required.
        if (!start || !end) {
          return { success: false, error: "Start and end times are required for new subjects" };
        }
        if (!u.days || u.days.length === 0) {
          return { success: false, error: "Select at least one class day" };
        }
        const created = await db.class.create({
          data: {
            scheduleId,
            subject,
            shortName: u.shortName?.trim() || generateShortName(subject),
            code: u.code?.trim() || null,
            color: DEFAULT_COLORS[classCount % DEFAULT_COLORS.length]!,
            startTime: applyWallClock(new Date(), start),
            endTime: applyWallClock(new Date(), end),
            days: u.days as DayOfWeek[],
          },
        });
        classCount += 1;
        await db.reminder.create({ data: { classId: created.id, userId: session.user.id } });
        continue;
      }

      const row = await db.class.findUnique({
        where: { id: u.id },
        select: { scheduleId: true, startTime: true, endTime: true },
      });
      if (!row || row.scheduleId !== scheduleId) {
        return { success: false, error: "Class not found" };
      }

      await db.class.update({
        where: { id: u.id },
        data: {
          subject,
          shortName: u.shortName?.trim() || null,
          code: u.code?.trim() || null,
          ...(start ? { startTime: applyWallClock(row.startTime, start) } : {}),
          ...(end ? { endTime: applyWallClock(row.endTime, end) } : {}),
          ...(u.days !== undefined ? { days: u.days as DayOfWeek[] } : {}),
        },
      });
    }

    auditLog("schedule.edit", { userId: session.user.id, scheduleId, classCount: updates.length });

    // Times may have changed — re-arm the exact-time QStash reminders with the
    // new occurrences. Old messages for stale times are ignored at fire time
    // by the staleness guard in sendClassReminderPush.
    await scheduleQstashReminders(new Date(), session.user.id);

    return { success: true };
  } catch (err) {
    console.error("[UPDATE_CLASSES]", err);
    return { success: false, error: "Failed to save changes. Please try again." };
  }
}
