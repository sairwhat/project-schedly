import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/lib/auth";
import { syllabusService } from "@/server/services/syllabus.service";
import { syllabusRepository } from "@/server/repositories/syllabus.repository";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const upload = await syllabusService.getUploadById(id);

  if (!upload || upload.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Auto-fail stale processing uploads (10 min timeout)
  if (upload.status === "processing") {
    const age = Date.now() - new Date(upload.createdAt).getTime();
    if (age > 10 * 60 * 1000) {
      await syllabusRepository.updateUploadStatus(upload.id, "failed", "Processing timed out");
      return NextResponse.json({
        uploadId: upload.id,
        status: "failed",
        errorMessage: "Processing timed out",
        tasks: [],
      });
    }
  }

  const tasks = upload.status === "completed"
    ? await syllabusService.getTasksByUpload(id)
    : [];

  return NextResponse.json({
    uploadId: upload.id,
    status: upload.status,
    fileUrl: upload.fileUrl,
    fileName: upload.fileName,
    errorMessage: upload.errorMessage,
    tasks,
    createdAt: upload.createdAt,
  });
}
