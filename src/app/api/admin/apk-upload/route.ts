import { type NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/server/lib/auth";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const VERSION_KEY = "releases/version.json";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const runtime = "nodejs";

function computeCode(versionName: string): number {
  const clean = versionName.replace(/^v/i, "").trim();
  const parts = clean.split(".").map((p) => parseInt(p, 10) || 0);
  while (parts.length < 3) parts.push(0);
  const [major = 0, minor = 0, patch = 0] = parts;
  return major * 10000 + minor * 100 + patch;
}

export async function POST(request: NextRequest) {
  if (!BLOB_TOKEN) {
    return NextResponse.json({ error: "Blob storage not configured" }, { status: 503 });
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const versionName = String(request.headers.get("x-version-name") || "").trim();
    const updateMessage =
      String(request.headers.get("x-update-message") || "").trim() ||
      `New version ${versionName} is now available.`;

    const body = request.body;
    if (!body || !versionName) {
      return NextResponse.json(
        { error: "Version name and APK file are required." },
        { status: 400 }
      );
    }

    const clean = versionName.replace(/^v/i, "").trim();
    const apkKey = `releases/Schedly-${clean}-release.apk`;

    const blob = await put(apkKey, body as unknown as ReadableStream, {
      access: "public",
      addRandomSuffix: false,
      token: BLOB_TOKEN,
      allowOverwrite: true,
      contentType: "application/vnd.android.package-archive",
    });

    const versionInfo = {
      versionCode: computeCode(clean),
      versionName: clean,
      apkUrl: blob.url,
      updateMessage,
    };

    await put(VERSION_KEY, JSON.stringify(versionInfo, null, 2), {
      access: "public",
      addRandomSuffix: false,
      token: BLOB_TOKEN,
      allowOverwrite: true,
      contentType: "application/json",
    });

    return NextResponse.json({ ok: true, versionInfo, url: blob.url });
  } catch (error) {
    console.error("[APK_UPLOAD_API] Error:", error);
    const msg = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
