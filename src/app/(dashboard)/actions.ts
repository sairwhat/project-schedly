"use server";

import { headers } from "next/headers";

const ALLOWED_CLIENT_TYPES = ["web", "pwa-android", "pwa-ios", "apk"] as const;

export type ClientType = (typeof ALLOWED_CLIENT_TYPES)[number];

export async function reportClientType(clientType: string): Promise<{ ok: boolean }> {
  if (!ALLOWED_CLIENT_TYPES.includes(clientType as ClientType)) {
    return { ok: false };
  }

  const { auth } = await import("@/server/lib/auth");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return { ok: false };

  const { db } = await import("@/server/db/client");
  const existing = await db.user.findUnique({
    where: { id: session.user.id },
    select: { clientType: true },
  });
  if (!existing) return { ok: false };

  await db.user.update({
    where: { id: session.user.id },
    data: {
      clientType: existing.clientType === clientType ? existing.clientType : clientType,
      lastSeenAt: new Date(),
    },
  });

  return { ok: true };
}
