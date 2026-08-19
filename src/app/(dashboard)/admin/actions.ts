"use server";

import { auth } from "@/server/lib/auth";
import { headers } from "next/headers";
import { adminService } from "@/server/services/admin.service";
import { auditLog } from "@/server/lib/audit";
import { db } from "@/server/db/client";
import { getLimitsStats } from "@/server/services/limits.service";
import { auditRepository } from "@/server/repositories/audit.repository";
import { feedbackRepository } from "@/server/repositories/feedback.repository";
import type { FeedbackType } from "@/generated/prisma/client";
import { syllabusService } from "@/server/services/syllabus.service";

const PAGE_SIZE = 50;

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !(session.user as Record<string, unknown>).isAdmin) {
    throw new Error("Unauthorized");
  }
  return session;
}

async function verifyPassword(userId: string, password: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return false;
  const bcrypt = await import("bcryptjs");
  const accounts = await db.account.findFirst({
    where: { userId, providerId: "email" },
    select: { password: true },
  });
  if (!accounts?.password) return false;
  return bcrypt.compare(password, accounts.password);
}

export async function debugSessionAction() {
  try {
    const h = await headers();
    const cookieHeader = h.get("cookie") || "";
    let session = null;
    let error: string | null = null;
    let stack: string | null = null;
    try {
      session = await auth.api.getSession({ headers: h });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      stack = e instanceof Error ? e.stack ?? null : null;
    }
    return {
      ok: true,
      hasCookieHeader: cookieHeader.length > 0,
      cookieNames: cookieHeader.split(";").map((p) => p.trim().split("=")[0]),
      hasSession: !!session,
      sessionUserId: session?.user?.id ?? null,
      sessionIsAdmin: (session?.user as Record<string, unknown> | undefined)?.isAdmin ?? null,
      error: error ?? null,
      stack: stack ?? null,
    };
  } catch (e) {
    return {
      ok: false,
      outerError: e instanceof Error ? e.message : String(e),
      outerStack: e instanceof Error ? e.stack : undefined,
    };
  }
}

export async function getAdminStats() {
  await requireAdmin();
  return adminService.getStats();
}

export async function getLimitsStatsAction() {
  await requireAdmin();
  return getLimitsStats();
}

export async function getSyllabusStats() {
  await requireAdmin();
  return syllabusService.getStats();
}

export async function getUsers() {
  await requireAdmin();
  return adminService.getUsers();
}

export async function toggleAdminRole(userId: string, password: string) {
  const session = await requireAdmin();
  const valid = await verifyPassword(session.user.id, password);
  if (!valid) throw new Error("Invalid password. Re-authentication required.");
  const result = await adminService.toggleAdmin(userId, session.user.id);
  auditLog("user.admin_toggle", { targetUserId: userId, callerId: session.user.id });
  return result;
}

export async function sendBroadcastNotification(opts: {
  title?: string;
  message: string;
  targetUserId?: string;
}) {
  const session = await requireAdmin();
  const title = (opts.title || "Schedly").slice(0, 100);
  const message = opts.message.trim().slice(0, 500);
  if (!message) throw new Error("Message is required.");

  const result = await adminService.broadcastNotification({
    title,
    message,
    targetUserId: opts.targetUserId || undefined,
  });

  auditLog("admin.action", {
    action: "notification.broadcast",
    callerId: session.user.id,
    targetUserId: opts.targetUserId || null,
    title,
    sentTo: result.users,
    sentFcm: result.fcmSent,
    sentLegacy: result.legacySent,
  });

  return result;
}

export async function getAuditLogs(opts: {
  action?: string;
  cursor?: string;
}) {
  await requireAdmin();
  const limit = PAGE_SIZE;
  const logs = await auditRepository.findMany({
    action: opts.action || undefined,
    limit,
    cursor: opts.cursor,
  });
  const nextCursor = logs.length === limit ? (logs.at(-1)?.id ?? null) : null;
  return { logs, nextCursor };
}

export async function getAuditActions() {
  await requireAdmin();
  return auditRepository.distinctActions();
}

export async function getAdminFeedback(opts: {
  status?: string;
  type?: string;
  cursor?: string;
}) {
  await requireAdmin();
  const limit = PAGE_SIZE;
  const feedback = await feedbackRepository.findAll({
    status: opts.status || undefined,
    type: (opts.type as FeedbackType | undefined) || undefined,
    limit,
    cursor: opts.cursor,
  });
  const nextCursor = feedback.length === limit ? (feedback.at(-1)?.id ?? null) : null;
  return { feedback, nextCursor };
}

export async function updateFeedbackStatus(id: string, status: string) {
  const session = await requireAdmin();
  if (status !== "open" && status !== "resolved") {
    throw new Error("Invalid status.");
  }
  const feedback = await feedbackRepository.updateStatus(id, status);
  auditLog("feedback.status_update", {
    callerId: session.user.id,
    feedbackId: id,
    status,
  });
  return { id: feedback.id, status: feedback.status };
}
