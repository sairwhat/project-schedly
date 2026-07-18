import { type NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { put } from "@vercel/blob";
import { auth } from "@/server/lib/auth";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const VERSION_KEY = "releases/version.json";

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
    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      request,
      body,
      token: BLOB_TOKEN,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let versionName = "0.0.0";
        let updateMessage = "New version available.";
        if (clientPayload) {
          try {
            const parsed = JSON.parse(clientPayload) as {
              versionName?: string;
              updateMessage?: string;
            };
            versionName = parsed.versionName ?? versionName;
            updateMessage = parsed.updateMessage ?? updateMessage;
          } catch {
            // ignore malformed payload
          }
        }
        return {
          allowedContentTypes: ["application/vnd.android.package-archive"],
          maximumSizeInBytes: 100 * 1024 * 1024,
          addRandomSuffix: false,
          allowOverwrite: true,
          tokenPayload: JSON.stringify({ versionName, updateMessage }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let versionName = "0.0.0";
        let updateMessage = "New version available.";
        if (tokenPayload) {
          try {
            const parsed = JSON.parse(tokenPayload) as {
              versionName?: string;
              updateMessage?: string;
            };
            versionName = parsed.versionName ?? versionName;
            updateMessage = parsed.updateMessage ?? updateMessage;
          } catch {
            // ignore
          }
        }

        const clean = versionName.replace(/^v/i, "").trim();
        const parts = clean.split(".").map((p) => parseInt(p, 10) || 0);
        while (parts.length < 3) parts.push(0);
        const [major = 0, minor = 0, patch = 0] = parts;
        const code = major * 10000 + minor * 100 + patch;

        const versionInfo = {
          versionCode: code,
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
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("[APK_TOKEN_API] Error:", error);
    return NextResponse.json({ error: "Token request failed" }, { status: 500 });
  }
}
