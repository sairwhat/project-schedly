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
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (upload.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    uploadId: upload.id,
    status: upload.status,
    fileUrl: upload.fileUrl,
    errorMessage: upload.errorMessage,
    classes: (upload.aiResult as Record<string, unknown> | null)?.classes ?? [],
    metadata: (upload.aiResult as Record<string, unknown> | null)?.metadata ?? {
      totalClasses: 0,
      confidence: 0,
      notes: null,
    },
  });
}
