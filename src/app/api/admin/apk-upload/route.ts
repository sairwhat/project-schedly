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
    const { versionName, updateMessage: rawMessage, apkUrl } = await request.json();
    const clean = String(versionName || "").replace(/^v/i, "").trim();
    const updateMessage =
      String(rawMessage || "").trim() || `New version ${clean} is now available.`;

    if (!clean) {
      return NextResponse.json({ error: "Version name is required." }, { status: 400 });
    }

    const apkKey = `releases/Schedly-${clean}-release.apk`;
    const sourceUrl =
      String(apkUrl || "").trim() ||
      `https://github.com/sairwhat/project-schedly/raw/master/apk/Schedly-${clean}-release.apk`;

    const res = await fetch(sourceUrl);
    if (!res.ok || !res.body) {
      return NextResponse.json(
        { error: `Could not fetch APK from source (${res.status}).` },
        { status: 502 }
      );
    }

    const blob = await put(apkKey, res.body as unknown as ReadableStream, {
      access: "public",
      addRandomSuffix: false,
      token: BLOB_TOKEN,
      allowOverwrite: true,
      contentType: "application/vnd.android.package-archive",
    });

    const proxyUrl = `https://app.schedly.shop/api/admin/apk-download?v=${clean}`;

    const versionInfo = {
      versionCode: computeCode(clean),
      versionName: clean,
      apkUrl: proxyUrl,
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
