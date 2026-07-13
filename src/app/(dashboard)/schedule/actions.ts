"use server";

import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { saveScheduleSchema } from "@/server/validators/ai.schema";
import { headers } from "next/headers";

export type SaveScheduleResult =
  | { success: true; scheduleId: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function saveSchedule(data: unknown): Promise<SaveScheduleResult> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return { success: false, error: "Unauthorized" };
  }

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

  const { title, semester, academicYear, classes, uploadId } = parsed.data;

  try {
    const schedule = await db.$transaction(
      async (tx) => {
        const s = await tx.schedule.create({
          data: {
            userId: session.user.id,
            title,
            semester: semester ?? undefined,
            academicYear: academicYear ?? undefined,
          },
        });

        const defaultColors = [
          "#3b82f6", "#ef4444", "#22c55e", "#f59e0b",
          "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
          "#14b8a6", "#6366f1", "#e11d48", "#0ea5e9",
        ];

        const now = new Date();

        await Promise.all(
          classes.map((c, i) => {
            const [startH = 0, startM = 0] = c.startTime.split(":").map(Number);
            const [endH = 0, endM = 0] = c.endTime.split(":").map(Number);

            const startDate = new Date(now);
            startDate.setHours(startH, startM, 0, 0);
            const endDate = new Date(now);
            endDate.setHours(endH, endM, 0, 0);

            return tx.class.create({
              data: {
                scheduleId: s.id,
                subject: c.subject,
                code: c.code ?? undefined,
                instructor: c.instructor ?? undefined,
                room: c.room ?? undefined,
                section: c.section ?? undefined,
                color: defaultColors[i % defaultColors.length],
                startTime: startDate,
                endTime: endDate,
                days: c.days,
              },
            });
          })
        );

        if (uploadId) {
          await tx.upload.update({
            where: { id: uploadId },
            data: { scheduleId: s.id },
          });
        }

        return s;
      },
      { maxWait: 10000, timeout: 30000 }
    );

    return { success: true, scheduleId: schedule.id };
  } catch (err) {
    console.error("[SAVE_SCHEDULE]", err);
    return { success: false, error: "Failed to save schedule. Please try again." };
  }
}

export async function deleteSchedule(scheduleId: string): Promise<{ success: boolean; error?: string }> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const schedule = await db.schedule.findUnique({ where: { id: scheduleId } });

    if (!schedule || schedule.userId !== session.user.id) {
      return { success: false, error: "Schedule not found" };
    }

    await db.schedule.delete({ where: { id: scheduleId } });
    return { success: true };
  } catch (err) {
    console.error("[DELETE_SCHEDULE]", err);
    return { success: false, error: "Failed to delete schedule" };
  }
}

export async function getSchedule(scheduleId: string) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) return null;

  return db.schedule.findFirst({
    where: { id: scheduleId, userId: session.user.id },
    include: { classes: true },
  });
}

export async function getUserSchedules() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) return [];

  return db.schedule.findMany({
    where: { userId: session.user.id },
    include: { classes: true },
    orderBy: { createdAt: "desc" },
  });
}
