import { type NextRequest, NextResponse } from "next/server";
import { list } from "@vercel/blob";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const VERSION_KEY = "releases/version.json";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  if (!BLOB_TOKEN) {
    return NextResponse.json(
      { error: "Version service not configured" },
      { status: 503 }
    );
  }

  try {
    const { blobs } = await list({ token: BLOB_TOKEN, prefix: VERSION_KEY });
    const versionBlob = blobs.find((b) => b.pathname === VERSION_KEY);

    if (!versionBlob) {
      return NextResponse.json(
        { hasUpdate: false },
        { status: 404 }
      );
    }

    const res = await fetch(versionBlob.url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ hasUpdate: false }, { status: 404 });
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[VERSION_API] Error:", error);
    return NextResponse.json({ hasUpdate: false }, { status: 500 });
  }
}
