"use server";

import { auth } from "@/server/lib/auth";
import { headers } from "next/headers";
import { adminService } from "@/server/services/admin.service";
import { auditLog } from "@/server/lib/audit";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !(session.user as Record<string, unknown>).isAdmin) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function getAdminStats() {
  await requireAdmin();
  return adminService.getStats();
}

export async function getUsers() {
  await requireAdmin();
  return adminService.getUsers();
}

export async function toggleAdminRole(userId: string) {
  const session = await requireAdmin();
  const result = await adminService.toggleAdmin(userId, session.user.id);
  auditLog("user.admin_toggle", { targetUserId: userId, callerId: session.user.id });
  return result;
}
