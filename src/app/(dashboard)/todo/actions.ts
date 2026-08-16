"use server";

import { headers } from "next/headers";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { auditLog } from "@/server/lib/audit";

export type TodoPriority = "low" | "medium" | "high";

const PRIORITIES: TodoPriority[] = ["low", "medium", "high"];
const DUE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isPriority(value: string): value is TodoPriority {
  return (PRIORITIES as string[]).includes(value);
}

export async function getTodos() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];

  return db.todo.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
}

export type AddTodoResult =
  | { success: true; todo: { id: string } }
  | { success: false; error: string };

export async function addTodoAction(
  text: string,
  priority: string,
  dueDate?: string
): Promise<AddTodoResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  const clean = text.trim();
  if (!clean) return { success: false, error: "Task text is required" };
  if (clean.length > 500) return { success: false, error: "Task is too long (max 500 characters)" };
  if (!isPriority(priority)) return { success: false, error: "Invalid priority" };
  if (dueDate && !DUE_DATE_RE.test(dueDate)) return { success: false, error: "Invalid due date" };

  try {
    const created = await db.todo.create({
      data: {
        userId: session.user.id,
        text: clean,
        priority,
        dueDate: dueDate || undefined,
      },
    });
    return { success: true, todo: { id: created.id } };
  } catch (err) {
    console.error("[ADD_TODO]", err);
    return { success: false, error: "Failed to add task" };
  }
}

export async function toggleTodoAction(todoId: string): Promise<{ success: boolean }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };

  try {
    const todo = await db.todo.findFirst({ where: { id: todoId, userId: session.user.id } });
    if (!todo) return { success: false };
    await db.todo.update({
      where: { id: todoId },
      data: { completed: !todo.completed, completedAt: !todo.completed ? new Date() : null },
    });
    return { success: true };
  } catch (err) {
    console.error("[TOGGLE_TODO]", err);
    return { success: false };
  }
}

export type EditTodoResult = { success: true } | { success: false; error: string };

export async function editTodoAction(
  todoId: string,
  text: string,
  priority: string,
  dueDate?: string
): Promise<EditTodoResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  const clean = text.trim();
  if (!clean) return { success: false, error: "Task text is required" };
  if (clean.length > 500) return { success: false, error: "Task is too long (max 500 characters)" };
  if (!isPriority(priority)) return { success: false, error: "Invalid priority" };
  if (dueDate && !DUE_DATE_RE.test(dueDate)) return { success: false, error: "Invalid due date" };

  try {
    const existing = await db.todo.findFirst({ where: { id: todoId, userId: session.user.id } });
    if (!existing) return { success: false, error: "Task not found" };
    await db.todo.update({
      where: { id: todoId },
      data: { text: clean, priority, dueDate: dueDate || null },
    });
    return { success: true };
  } catch (err) {
    console.error("[EDIT_TODO]", err);
    return { success: false, error: "Failed to update task" };
  }
}

export async function deleteTodoAction(todoId: string): Promise<{ success: boolean }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };

  try {
    await db.todo.deleteMany({ where: { id: todoId, userId: session.user.id } });
    return { success: true };
  } catch (err) {
    console.error("[DELETE_TODO]", err);
    return { success: false };
  }
}

export async function clearCompletedAction(): Promise<{ success: boolean }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };

  try {
    const result = await db.todo.deleteMany({
      where: { userId: session.user.id, completed: true },
    });
    if (result.count > 0) {
      auditLog("todo.clear_completed", { userId: session.user.id, count: result.count });
    }
    return { success: true };
  } catch (err) {
    console.error("[CLEAR_TODOS]", err);
    return { success: false };
  }
}
