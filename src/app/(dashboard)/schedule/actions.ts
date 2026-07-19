"use server";

import { auth } from "@/server/lib/auth";
import { headers } from "next/headers";
import { scheduleService } from "@/server/services/schedule.service";
import { saveScheduleSchema } from "@/server/validators/ai.schema";
import { auditLog } from "@/server/lib/audit";

export type SaveScheduleResult =
  | { success: true; scheduleId: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function saveSchedule(data: unknown): Promise<SaveScheduleResult> {
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
    return { success: true, scheduleId: schedule.id };
  } catch (err) {
    console.error("[SAVE_SCHEDULE]", err);
    return { success: false, error: "Failed to save schedule. Please try again." };
  }
}

export async function deleteSchedule(scheduleId: string): Promise<{ success: boolean; error?: string }> {
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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const schedule = await scheduleService.getByUser(session.user.id);
  return schedule.find((s) => s.id === scheduleId) ?? null;
}

export async function getUserSchedules() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];

  return scheduleService.getByUser(session.user.id);
}
