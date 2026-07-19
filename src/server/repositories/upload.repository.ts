import { db } from "@/server/db/client";
import type { UploadStatus, Prisma } from "@/generated/prisma/client";

export interface CreateUploadData {
  userId: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export const uploadRepository = {
  findById(id: string) {
    return db.upload.findUnique({ where: { id } });
  },

  findByUser(userId: string) {
    return db.upload.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },

  findBySchedule(scheduleId: string) {
    return db.upload.findMany({ where: { scheduleId } });
  },

  create(data: CreateUploadData) {
    return db.upload.create({ data });
  },

  updateStatus(id: string, status: UploadStatus, errorMessage?: string | null) {
    return db.upload.update({
      where: { id },
      data: { status, errorMessage: errorMessage ?? null },
    });
  },

  updateAiResult(id: string, aiResult: Record<string, unknown>, status: UploadStatus) {
    return db.upload.update({
      where: { id },
      data: { aiResult: aiResult as never, status },
    });
  },

  linkSchedule(id: string, scheduleId: string) {
    return db.upload.update({
      where: { id },
      data: { scheduleId },
    });
  },

  delete(id: string) {
    return db.upload.delete({ where: { id } });
  },

  countAll() {
    return db.upload.count();
  },
};
