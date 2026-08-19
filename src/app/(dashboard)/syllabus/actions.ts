"use server";

import { headers } from "next/headers";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { syllabusService, taskOrderScore } from "@/server/services/syllabus.service";
import { auditLog } from "@/server/lib/audit";

async function requireAuth() {
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
  if (!session) throw new Error("Unauthorized");
  if (!(session.user as Record<string, unknown>).isAdmin) {
    throw new Error("Forbidden: admin only");
  }
  return session;
}

export async function getSyllabusUploads() {
  const session = await requireAuth();
  return syllabusService.getUploadsByUser(session.user.id);
}

export async function getSyllabusTasks() {
  const session = await requireAuth();
  return syllabusService.getTasksByUser(session.user.id);
}

export async function updateSyllabusTask(
  taskId: string,
  data: {
    subject?: string;
    courseCode?: string | null;
    taskName?: string;
    taskType?: string;
    importance?: string;
    dueDate?: string | null;
    dateNote?: string | null;
    description?: string | null;
    instructor?: string | null;
    reminder?: boolean;
  }
) {
  const session = await requireAuth();
  const dueDate = data.dueDate ? new Date(data.dueDate) : data.dueDate === null ? null : undefined;
  return syllabusService.updateTask(taskId, { ...data, dueDate });
}

export async function deleteSyllabusTask(taskId: string) {
  const session = await requireAuth();
  return syllabusService.deleteTask(taskId);
}

export async function saveSyllabusTaskToTodo(taskId: string) {
  const session = await requireAuth();

  const task = await db.syllabusTask.findFirst({
    where: { id: taskId, userId: session.user.id },
  });
  if (!task) throw new Error("Task not found");
  if (task.savedToTodo) throw new Error("Already saved to todo");

  const dueDateStr = task.dueDate
    ? task.dueDate.toISOString().split("T")[0]
    : undefined;

  // Build task text with date context
  let todoText = `[${task.subject}] ${task.taskName}`;
  if (!dueDateStr && task.dateNote) {
    todoText += ` (${task.dateNote})`;
  }

  // Compute the same chronological score used on the syllabus page so the
  // To-Do list shows tasks sunod-sunod (Week 1 → Final Term).
  const uploadTasks = await db.syllabusTask.findMany({
    where: { uploadId: task.uploadId, userId: session.user.id },
  });
  const orderScore = taskOrderScore(task, uploadTasks as unknown as Record<string, unknown>[]);

  const todo = await db.todo.create({
    data: {
      userId: session.user.id,
      text: todoText,
      priority: task.taskType === "exam" ? "high" : "medium",
      dueDate: dueDateStr || null,
      syllabusOrder: orderScore,
    },
  });

  await syllabusService.markTaskSaved(task.id, todo.id);
  auditLog("syllabus.task_saved", { userId: session.user.id, taskId, todoId: todo.id });

  return { success: true, todoId: todo.id };
}

export async function saveAllSyllabusTasks(uploadId: string) {
  const session = await requireAuth();

  // Only save IMPORTANT tasks (high/medium) to the To-Do list — the AI marks
  // minor items (attendance, participation, ungraded readings) as "low".
  const tasks = await db.syllabusTask.findMany({
    where: {
      uploadId,
      userId: session.user.id,
      savedToTodo: false,
      importance: { in: ["high", "medium"] },
    },
  });

  const results = [];
  for (const task of tasks) {
    const dueDateStr = task.dueDate
      ? task.dueDate.toISOString().split("T")[0]
      : undefined;

    let todoText = `[${task.subject}] ${task.taskName}`;
    if (!dueDateStr && task.dateNote) {
      todoText += ` (${task.dateNote})`;
    }

    const todo = await db.todo.create({
      data: {
        userId: session.user.id,
        text: todoText,
        priority: task.taskType === "exam" ? "high" : "medium",
        dueDate: dueDateStr || null,
        syllabusOrder: taskOrderScore(
          task,
          tasks as unknown as Record<string, unknown>[]
        ),
      },
    });

    await syllabusService.markTaskSaved(task.id, todo.id);
    results.push({ taskId: task.id, todoId: todo.id });
  }

  auditLog("syllabus.tasks_saved_bulk", {
    userId: session.user.id,
    uploadId,
    count: results.length,
  });

  return { success: true, count: results.length };
}

export async function deleteSyllabusUpload(uploadId: string) {
  const session = await requireAuth();
  const upload = await db.syllabusUpload.findFirst({
    where: { id: uploadId, userId: session.user.id },
  });
  if (!upload) throw new Error("Upload not found");
  return syllabusService.deleteUpload(uploadId);
}

export async function summarizeSyllabusAction(
  uploadId: string,
  language: "english" | "tagalog"
) {
  const session = await requireAuth();
  const upload = await db.syllabusUpload.findFirst({
    where: { id: uploadId, userId: session.user.id },
  });
  if (!upload) throw new Error("Upload not found");

  const hdrs = await headers();
  const host = hdrs.get("host");
  const origin = host ? `http${hdrs.get("x-forwarded-proto") === "https" ? "s" : ""}://${host}` : undefined;

  return syllabusService.summarizeUpload(uploadId, language, origin);
}
