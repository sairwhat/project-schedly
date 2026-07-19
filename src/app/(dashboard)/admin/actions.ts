"use server";

import { auth } from "@/server/lib/auth";
import { headers } from "next/headers";
import { adminService } from "@/server/services/admin.service";

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
  return adminService.toggleAdmin(userId, session.user.id);
}
