"use server";

import { auth } from "@/server/lib/auth";
import { headers } from "next/headers";
import { adminService } from "@/server/services/admin.service";
import { auditLog } from "@/server/lib/audit";
import { db } from "@/server/db/client";

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

export async function getAdminStats() {
  await requireAdmin();
  return adminService.getStats();
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
