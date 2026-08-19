import { db } from "@/server/db/client";
import type { SyllabusUploadStatus, SyllabusTaskType, Prisma } from "@/generated/prisma/client";

export interface CreateSyllabusUploadData {
  userId: string;
  fileUrl: string;
  objectKey?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface CreateSyllabusTaskData {
  uploadId: string;
  userId: string;
  subject: string;
  courseCode?: string | null;
  taskName: string;
  taskType: SyllabusTaskType;
  importance?: string;
  dueDate?: Date | null;
  dateNote?: string | null;
  description?: string | null;
  instructor?: string | null;
  reminder?: boolean;
}

const UPLOAD_FIELDS = {
  id: true,
  userId: true,
  fileUrl: true,
  fileName: true,
  fileSize: true,
  mimeType: true,
  status: true,
  errorMessage: true,
  summary: true,
  summaryLanguage: true,
  createdAt: true,
} as const satisfies Prisma.SyllabusUploadSelect;

const TASK_FIELDS = {
  id: true,
  uploadId: true,
  userId: true,
  subject: true,
  courseCode: true,
  taskName: true,
  taskType: true,
  importance: true,
  dueDate: true,
  dateNote: true,
  description: true,
  instructor: true,
  reminder: true,
  savedToTodo: true,
  todoId: true,
  createdAt: true,
} as const satisfies Prisma.SyllabusTaskSelect;

export const syllabusRepository = {
  findUploadById(id: string) {
    return db.syllabusUpload.findUnique({ where: { id }, select: UPLOAD_FIELDS });
  },

  findUploadText(id: string) {
    return db.syllabusUpload.findUnique({
      where: { id },
      select: { extractedText: true },
    });
  },

  findUploadsByUser(userId: string) {
    return db.syllabusUpload.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { ...UPLOAD_FIELDS, tasks: { select: TASK_FIELDS, orderBy: { dueDate: "asc" } } },
    });
  },

  createUpload(data: CreateSyllabusUploadData) {
    return db.syllabusUpload.create({ data });
  },

  updateUploadStatus(id: string, status: SyllabusUploadStatus, errorMessage?: string | null) {
    return db.syllabusUpload.update({
      where: { id },
      data: { status, errorMessage: errorMessage ?? null },
    });
  },

  updateUploadText(id: string, text: string) {
    return db.syllabusUpload.update({
      where: { id },
      data: { extractedText: text },
    });
  },

  updateSummary(id: string, summary: string, language: string) {
    return db.syllabusUpload.update({
      where: { id },
      data: { summary, summaryLanguage: language },
    });
  },

  createTasks(tasks: CreateSyllabusTaskData[]) {
    return db.syllabusTask.createMany({ data: tasks });
  },

  findTasksByUpload(uploadId: string) {
    return db.syllabusTask.findMany({
      where: { uploadId },
      orderBy: { dueDate: "asc" },
      select: TASK_FIELDS,
    });
  },

  findTasksByUser(userId: string) {
    return db.syllabusTask.findMany({
      where: { userId },
      orderBy: { dueDate: "asc" },
      select: TASK_FIELDS,
    });
  },

  updateTask(id: string, data: Partial<Pick<Prisma.SyllabusTaskUpdateInput, "subject" | "courseCode" | "taskName" | "taskType" | "importance" | "dueDate" | "dateNote" | "description" | "instructor" | "reminder">>) {
    return db.syllabusTask.update({ where: { id }, data });
  },

  markTaskSaved(id: string, todoId: string) {
    return db.syllabusTask.update({
      where: { id },
      data: { savedToTodo: true, todoId },
    });
  },

  deleteTask(id: string) {
    return db.syllabusTask.delete({ where: { id } });
  },

  deleteUpload(id: string) {
    return db.syllabusUpload.delete({ where: { id } });
  },

  countUploads() {
    return db.syllabusUpload.count();
  },

  countTasks() {
    return db.syllabusTask.count();
  },

  countTasksByUser(userId: string) {
    return db.syllabusTask.count({ where: { userId } });
  },
};
