"use server";

import { headers } from "next/headers";

async function requireAdmin() {
  const { auth } = await import("@/server/lib/auth");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !(session.user as Record<string, unknown>).isAdmin) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function getAdminStats() {
  await requireAdmin();
  const { adminService } = await import("@/server/services/admin.service");
  return adminService.getStats();
}

async function verifyPassword(userId: string, password: string): Promise<boolean> {
  const { db } = await import("@/server/db/client");
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
  const { getLimitsStats } = await import("@/server/services/limits.service");
  return getLimitsStats();
}

export async function getSyllabusStats() {
  await requireAdmin();
  const { syllabusService } = await import("@/server/services/syllabus.service");
  return syllabusService.getStats();
}

export async function getUsers() {
  await requireAdmin();
  const { adminService } = await import("@/server/services/admin.service");
  return adminService.getUsers();
}

export async function toggleAdminRole(userId: string, password: string) {
  const session = await requireAdmin();
  const valid = await verifyPassword(session.user.id, password);
  if (!valid) throw new Error("Invalid password. Re-authentication required.");
  const { adminService } = await import("@/server/services/admin.service");
  const result = await adminService.toggleAdmin(userId, session.user.id);
  const { auditLog } = await import("@/server/lib/audit");
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

  const { adminService } = await import("@/server/services/admin.service");
  const result = await adminService.broadcastNotification({
    title,
    message,
    targetUserId: opts.targetUserId || undefined,
  });

  const { auditLog } = await import("@/server/lib/audit");
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
  const PAGE_SIZE = 50;
  const { auditRepository } = await import("@/server/repositories/audit.repository");
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
  const { auditRepository } = await import("@/server/repositories/audit.repository");
  return auditRepository.distinctActions();
}

export async function getAdminFeedback(opts: {
  status?: string;
  type?: string;
  cursor?: string;
}) {
  await requireAdmin();
  const PAGE_SIZE = 50;
  const { feedbackRepository } = await import("@/server/repositories/feedback.repository");
  const limit = PAGE_SIZE;
  const feedback = await feedbackRepository.findAll({
    status: opts.status || undefined,
    type: (opts.type as never) || undefined,
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
  const { feedbackRepository } = await import("@/server/repositories/feedback.repository");
  const { auditLog } = await import("@/server/lib/audit");
  const feedback = await feedbackRepository.updateStatus(id, status);
  auditLog("feedback.status_update", {
    callerId: session.user.id,
    feedbackId: id,
    status,
  });
  return { id: feedback.id, status: feedback.status };
}
