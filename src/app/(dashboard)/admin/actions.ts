"use server";

import { db } from "@/server/db/client";
import { auth } from "@/server/lib/auth";
import { headers } from "next/headers";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !(session.user as Record<string, unknown>).isAdmin) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function getAdminStats() {
  await requireAdmin();

  const [userCount, scheduleCount, uploadCount, feedbackCount] = await Promise.all([
    db.user.count(),
    db.schedule.count(),
    db.upload.count(),
    db.feedback.count(),
  ]);

  return {
    users: userCount,
    schedules: scheduleCount,
    uploads: uploadCount,
    feedback: feedbackCount,
  };
}

export async function getUsers() {
  await requireAdmin();

  const users = await db.user.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      username: true,
      isAdmin: true,
      emailVerified: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return users;
}

export async function toggleAdminRole(userId: string) {
  const session = await requireAdmin();
  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, isAdmin: true } });
  if (!target) throw new Error("User not found");
  if (target.id === session.user.id) throw new Error("Cannot change your own admin status");

  const updated = await db.user.update({
    where: { id: userId },
    data: { isAdmin: !target.isAdmin },
    select: { id: true, isAdmin: true },
  });

  return updated;
}
