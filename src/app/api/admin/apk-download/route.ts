import { type NextRequest, NextResponse } from "next/server";
import { list } from "@vercel/blob";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const VERSION_KEY = "releases/version.json";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!BLOB_TOKEN) {
    return NextResponse.json({ error: "Blob not configured" }, { status: 503 });
  }

  const version = request.nextUrl.searchParams.get("v") || "";

  try {
    const apkPath = `releases/Schedly-${version.replace(/^v/i, "").trim()}-release.apk`;
    const { blobs } = await list({ token: BLOB_TOKEN, prefix: apkPath });
    const blob = blobs.find((b) => b.pathname === apkPath);

    if (!blob) {
      return NextResponse.json({ error: "Blob not found" }, { status: 404 });
    }

    const upstream = await fetch(blob.url, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "Blob not found" }, { status: 404 });
    }

    return new NextResponse(upstream.body as unknown as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": `attachment; filename="Schedly-${version}-release.apk"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[APK_DOWNLOAD_API] Error:", error);
    return NextResponse.json({ error: "Blob not found" }, { status: 404 });
  }
}
