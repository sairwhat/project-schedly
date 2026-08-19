import { headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { auditRepository } from "@/server/repositories/audit.repository";

export const AuditActions = [
  "user.login",
  "user.register",
  "user.logout",
  "user.delete",
  "user.admin_toggle",
  "schedule.create",
  "schedule.delete",
  "schedule.edit",
  "upload.create",
  "feedback.submit",
  "feedback.status_update",
  "widget.token_create",
  "widget.token_regenerate",
  "admin.action",
  "reminders.update",
  "reminders.update_all",
  "reminders.cron",
  "reminders.todos",
  "reminders.qstash",
  "todo.clear_completed",
  "push.subscribe",
  "push.unsubscribe",
  "notification.delete",
  "syllabus.task_saved",
  "syllabus.tasks_saved_bulk",
] as const;

export type AuditAction = (typeof AuditActions)[number];

/**
 * Emit an audit event. Always safe: logs to console synchronously and
 * persists to the audit_logs table fire-and-forget. Never throws, never
 * blocks the caller — failures only produce a console error.
 *
 * Identity is resolved in order of preference:
 *   1. metadata.userId
 *   2. metadata.callerId (admin actions act as the caller)
 *   3. metadata.email (looked up so login events are attributed to a user)
 */
export function auditLog(action: AuditAction, metadata?: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      type: "audit",
      action,
      timestamp: new Date().toISOString(),
      ...metadata,
    })
  );

  void persistAuditLog(action, metadata);
}

async function persistAuditLog(action: AuditAction, metadata?: Record<string, unknown>) {
  try {
    const m = metadata ?? {};
    let userId = typeof m.userId === "string" ? m.userId : undefined;
    if (!userId && typeof m.callerId === "string") userId = m.callerId;
    const email = typeof m.email === "string" ? m.email : null;

    if (!userId && email) {
      const user = await db.user.findUnique({
        where: { email },
        select: { id: true },
      });
      userId = user?.id;
    }

    const ctx = await getRequestContext();

    await auditRepository.create({
      action,
      userId: userId ?? null,
      email,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: toJsonValue(m) ?? undefined,
    });
  } catch (err) {
    console.error("[AUDIT] Failed to persist audit log:", err);
  }
}

async function getRequestContext() {
  try {
    const h = await headers();
    return {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent") ?? null,
    };
  } catch {
    return { ip: null, userAgent: null };
  }
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | null {
  try {
    const serialized = JSON.parse(
      JSON.stringify(value, (_key, v) => {
        if (typeof v === "bigint") return v.toString();
        if (v instanceof Date) return v.toISOString();
        if (typeof v === "number" && !Number.isFinite(v)) return String(v);
        return v;
      })
    );
    return serialized ?? null;
  } catch {
    return null;
  }
}