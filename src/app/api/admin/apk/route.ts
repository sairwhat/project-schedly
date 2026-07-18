import { type NextRequest, NextResponse } from "next/server";
import { put, list } from "@vercel/blob";
import { auth } from "@/server/lib/auth";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const VERSION_KEY = "releases/version.json";
const MAX_APK_SIZE = 100 * 1024 * 1024;

function parseVersionName(raw: string): { name: string; code: number } {
  const clean = raw.replace(/^v/i, "").trim();
  const parts = clean.split(".").map((p) => parseInt(p, 10) || 0);
  while (parts.length < 3) parts.push(0);
  const [major = 0, minor = 0, patch = 0] = parts;
  const code = major * 10000 + minor * 100 + patch;
  return { name: clean, code };
}

export async function POST(request: NextRequest) {
  if (!BLOB_TOKEN) {
    return NextResponse.json(
      { error: "Blob storage not configured" },
      { status: 503 }
    );
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const versionName = (formData.get("versionName") as string | null)?.trim();
    const updateMessage =
      (formData.get("updateMessage") as string | null)?.trim() ||
      `New version ${versionName ?? ""} is now available.`;

    if (!file) {
      return NextResponse.json({ error: "No APK provided" }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".apk")) {
      return NextResponse.json(
        { error: "File must be an .apk" },
        { status: 400 }
      );
    }
    if (file.size > MAX_APK_SIZE) {
      return NextResponse.json(
        { error: "APK too large (max 100MB)" },
        { status: 400 }
      );
    }
    if (!versionName) {
      return NextResponse.json(
        { error: "Version name is required" },
        { status: 400 }
      );
    }

    const { name, code } = parseVersionName(versionName);
    const apkKey = `releases/Schedly-${name}-release.apk`;

    const apk = await put(apkKey, file, {
      access: "public",
      addRandomSuffix: false,
      token: BLOB_TOKEN,
      allowOverwrite: true,
    });

    const versionInfo = {
      versionCode: code,
      versionName: name,
      apkUrl: apk.url,
      updateMessage,
    };

    await put(VERSION_KEY, JSON.stringify(versionInfo, null, 2), {
      access: "public",
      addRandomSuffix: false,
      token: BLOB_TOKEN,
      allowOverwrite: true,
      contentType: "application/json",
    });

    return NextResponse.json({
      ok: true,
      version: versionInfo,
    });
  } catch (error) {
    console.error("[ADMIN_APK_API] Error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!BLOB_TOKEN) {
    return NextResponse.json(
      { error: "Blob storage not configured" },
      { status: 503 }
    );
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id || !session.user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { blobs } = await list({ token: BLOB_TOKEN, prefix: "releases/" });
    const versionBlob = blobs.find((b) => b.pathname === VERSION_KEY);

    let current: Record<string, unknown> | null = null;
    if (versionBlob) {
      const res = await fetch(versionBlob.url, { cache: "no-store" });
      if (res.ok) current = (await res.json()) as Record<string, unknown>;
    }

    const apks = blobs
      .filter((b) => b.pathname.endsWith(".apk"))
      .map((b) => ({ name: b.pathname.split("/").pop(), url: b.url }));

    return NextResponse.json({ current, apks });
  } catch (error) {
    console.error("[ADMIN_APK_API] Error:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
