import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/lib/auth";
import { uploadRepository } from "@/server/repositories/upload.repository";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const upload = await uploadRepository.findById(id);

  if (!upload) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (upload.userId !== session.user.id) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const fileData = upload.fileData;
  if (!fileData) {
    return new NextResponse("No image", { status: 404 });
  }

  const comma = fileData.indexOf(",");
  const meta = comma > -1 ? fileData.slice(0, comma) : "";
  const base64 = comma > -1 ? fileData.slice(comma + 1) : fileData;
  const mimeMatch = meta.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1]! : upload.mimeType || "image/jpeg";

  const buffer = Buffer.from(base64, "base64");

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
