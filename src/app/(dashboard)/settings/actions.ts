"use server";

import { put } from "@vercel/blob";
import { auth } from "@/server/lib/auth";
import { headers } from "next/headers";

export async function uploadAvatar(formData: FormData): Promise<{ url: string } | { error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return { error: "No file provided" };
  }

  if (file.size > 4 * 1024 * 1024) {
    return { error: "File must be under 4MB" };
  }

  if (!file.type.startsWith("image/")) {
    return { error: "File must be an image" };
  }

  const ext = file.name.split(".").pop() || "jpg";
  const filename = `avatars/${session.user.id}-${Date.now()}.${ext}`;

  const blob = await put(filename, file, {
    access: "public",
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  const h = await headers();

  await auth.api.updateUser({
    headers: h,
    body: { avatarUrl: blob.url },
  });

  return { url: blob.url };
}
