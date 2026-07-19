import { scheduleRepository } from "@/server/repositories/schedule.repository";
import { classRepository, type CreateClassData } from "@/server/repositories/class.repository";
import { uploadRepository } from "@/server/repositories/upload.repository";
import { db } from "@/server/db/client";
import type { DayOfWeek } from "@/generated/prisma/client";

const DEFAULT_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b",
  "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
  "#14b8a6", "#6366f1", "#e11d48", "#0ea5e9",
];

function parseTime(time: string, reference: Date): Date {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const d = new Date(reference);
  d.setHours(h, m, 0, 0);
  return d;
}

export interface CreateClassInput {
  subject: string;
  code?: string | null;
  instructor?: string | null;
  room?: string | null;
  section?: string | null;
  days: DayOfWeek[];
  startTime: string;
  endTime: string;
}

export interface CreateScheduleInput {
  title: string;
  semester?: string | null;
  academicYear?: string | null;
  classes: CreateClassInput[];
  uploadId?: string;
}

export const scheduleService = {
  async getById(id: string) {
    return scheduleRepository.findOwnedByUser(id, "");
  },

  async getByUser(userId: string) {
    return scheduleRepository.findByUser(userId);
  },

  async getActiveByUser(userId: string) {
    return scheduleRepository.findActiveByUser(userId);
  },

  async create(userId: string, input: CreateScheduleInput) {
    const now = new Date();

    const schedule = await db.$transaction(async (tx) => {
      const s = await tx.schedule.create({
        data: {
          userId,
          title: input.title,
          semester: input.semester ?? undefined,
          academicYear: input.academicYear ?? undefined,
        },
      });

      const classData: CreateClassData[] = input.classes.map((c, i) => ({
        scheduleId: s.id,
        subject: c.subject,
        code: c.code ?? undefined,
        instructor: c.instructor ?? undefined,
        room: c.room ?? undefined,
        section: c.section ?? undefined,
        color: DEFAULT_COLORS[i % DEFAULT_COLORS.length]!,
        startTime: parseTime(c.startTime, now),
        endTime: parseTime(c.endTime, now),
        days: c.days,
      }));

      await tx.class.createMany({ data: classData });

      if (input.uploadId) {
        await tx.upload.update({
          where: { id: input.uploadId },
          data: { scheduleId: s.id },
        });
      }

      return s;
    }, { maxWait: 10000, timeout: 30000 });

    return schedule;
  },

  async delete(id: string, userId: string) {
    const schedule = await scheduleRepository.findOwnedByUser(id, userId);
    if (!schedule) return null;
    await scheduleRepository.delete(id);
    return schedule;
  },

  async update(id: string, userId: string, data: { title?: string; semester?: string | null; academicYear?: string | null }) {
    const schedule = await scheduleRepository.findOwnedByUser(id, userId);
    if (!schedule) return null;
    return scheduleRepository.update(id, data);
  },

  async setActive(id: string, userId: string) {
    const schedule = await scheduleRepository.findOwnedByUser(id, userId);
    if (!schedule) return null;

    await db.$transaction([
      db.schedule.updateMany({ where: { userId, isActive: true }, data: { isActive: false } }),
      db.schedule.update({ where: { id }, data: { isActive: true } }),
    ]);

    return { id, isActive: true };
  },
};
