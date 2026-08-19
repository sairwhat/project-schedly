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

export async function testCookieEcho() {
  let h: Awaited<ReturnType<typeof headers>> | null = null;
  let cookieHeader = "";
  try {
    h = await headers();
    cookieHeader = h.get("cookie") || "";
  } catch (e) {
    return { ok: false, error: "headers threw: " + (e instanceof Error ? e.message : String(e)) };
  }
  return { ok: true, cookieLen: cookieHeader.length, cookieNames: cookieHeader.split(";").map(p => p.trim().split("=")[0]) };
}

export async function getAdminStats() {
  const empty = { users: 0, schedules: 0, uploads: 0, feedback: 0 };
  let h: Awaited<ReturnType<typeof headers>> | null = null;
  let cookieHeader = "";
  let getSessionResult: unknown = null;
  let getSessionError: string | null = null;
  let getSessionStack: string | null = null;
  try {
    h = await headers();
    cookieHeader = h.get("cookie") || "";
  } catch (e) {
    return { ...empty, _debug: btoa(JSON.stringify({ step: "headers-threw", error: e instanceof Error ? e.message : String(e) })) };
  }
  try {
    getSessionResult = await auth.api.getSession({ 
      headers: h,
      query: { disableCookieCache: true },
    });
  } catch (e) {
    getSessionError = e instanceof Error ? e.message : String(e);
    getSessionStack = e instanceof Error ? e.stack ?? null : null;
  }
  const session = getSessionResult as { user?: Record<string, unknown> } | null;
  const sessionIsAdmin = session?.user?.isAdmin ?? null;
  const sessionUserId = session?.user?.id ?? null;
  if (!session || sessionIsAdmin !== true) {
    return {
      ...empty,
      _debug: btoa(JSON.stringify({
        step: "getSession-null-or-not-admin",
        hasCookie: cookieHeader.length > 0,
        cookieLen: cookieHeader.length,
        cookieNames: cookieHeader.split(";").map(p => p.trim().split("=")[0]),
        getSessionResult: session ? { userId: sessionUserId, isAdmin: sessionIsAdmin } : null,
        getSessionError,
        getSessionStack: getSessionStack?.split("\n").slice(0, 3).join("\n"),
      })),
    };
  }
  try {
    const stats = await adminService.getStats();
    return { ...stats, _debug: null };
  } catch (e) {
    return {
      ...empty,
      _debug: btoa(JSON.stringify({
        step: "getStats-threw",
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? (e.stack ?? "").split("\n").slice(0, 3).join("\n") : null,
      })),
    };
  }
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
