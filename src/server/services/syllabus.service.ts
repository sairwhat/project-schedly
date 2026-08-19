import { syllabusRepository } from "@/server/repositories/syllabus.repository";
import { extractSyllabusFromImage, extractSyllabusFromText, summarizeSyllabus } from "@/server/lib/ai";
import { extractPdfText } from "@/server/lib/pdf-to-image";
import { preprocessImage } from "@/server/lib/image-processing";
import type { SyllabusTaskType } from "@/generated/prisma/client";

export const syllabusService = {
  async getUploadsByUser(userId: string) {
    return syllabusRepository.findUploadsByUser(userId);
  },

  async getUploadById(id: string) {
    return syllabusRepository.findUploadById(id);
  },

  async getTasksByUpload(uploadId: string) {
    return syllabusRepository.findTasksByUpload(uploadId);
  },

  async getTasksByUser(userId: string) {
    return syllabusRepository.findTasksByUser(userId);
  },

  async createUpload(userId: string, file: { url: string; objectKey?: string; name: string; size: number; mimeType: string }) {
    return syllabusRepository.createUpload({
      userId,
      fileUrl: file.url,
      objectKey: file.objectKey,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.mimeType,
    });
  },

  async processWithAi(uploadId: string, fileBuffer: Buffer, mimeType: string) {
    try {
      await syllabusRepository.updateUploadStatus(uploadId, "processing");

      const upload = await syllabusRepository.findUploadById(uploadId);
      if (!upload) {
        throw new Error("Upload not found");
      }

      const isPdf = mimeType === "application/pdf";
      let allTasks: Record<string, unknown>[] = [];
      let lastModel = "";

      // Extraction is best-effort: any AI/provider/preprocess failure degrades
      // to a completed upload with zero tasks (the UI shows "No tasks found in
      // this syllabus.") instead of a scary "Failed" state. The user can
      // re-upload or summarize what they have — nothing ever hard-fails.
      if (isPdf) {
        try {
          const { text } = await extractPdfText(fileBuffer);
          await syllabusRepository.updateUploadText(uploadId, text);
          if (text && text.trim().length >= 50) {
            const result = await extractSyllabusFromText(text);
            lastModel = result.model;
            allTasks = Array.isArray(result.data.tasks) ? result.data.tasks : [];
          }
        } catch (err) {
          console.error("[SYLLABUS] PDF extraction failed (degrading to empty result):", err);
        }
      } else {
        try {
          let processedBuffer = fileBuffer;
          try {
            processedBuffer = await preprocessImage(fileBuffer);
          } catch (preprocessErr) {
            console.error("[SYLLABUS] Preprocess failed — using original image:", preprocessErr);
          }
          const base64 = processedBuffer.toString("base64");
          const result = await extractSyllabusFromImage("", {
            base64,
            contentType: "image/jpeg",
          });
          lastModel = result.model;
          allTasks = Array.isArray(result.data.tasks) ? result.data.tasks : [];
        } catch (err) {
          console.error("[SYLLABUS] Vision extraction failed (degrading to empty result):", err);
        }
      }

      const seen = new Set<string>();
      const uniqueTasks = allTasks.filter((t) => {
        const key = `${(t.subject as string)?.toLowerCase()}|${(t.taskName as string)?.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      uniqueTasks.sort((a, b) => {
        const sa = taskOrderScore(a, uniqueTasks);
        const sb = taskOrderScore(b, uniqueTasks);
        if (sa !== sb) return sa - sb;
        return String(a.taskName ?? "").localeCompare(String(b.taskName ?? ""));
      });

      if (uniqueTasks.length > 0) {
        await syllabusRepository.createTasks(
          uniqueTasks.map((t: Record<string, unknown>) => ({
            uploadId,
            userId: upload.userId,
            subject: (t.subject as string) || "Unknown Subject",
            courseCode: (t.courseCode as string) || null,
            taskName: (t.taskName as string) || "Untitled Task",
            taskType: ((t.taskType as string) || "other") as SyllabusTaskType,
            importance: ["high", "medium", "low"].includes(t.importance as string)
              ? (t.importance as string)
              : "medium",
            dueDate: t.dueDate ? new Date(t.dueDate as string) : null,
            dateNote: (t.dateNote as string) || null,
            description: (t.description as string) || null,
            instructor: (t.instructor as string) || null,
            reminder: true,
          }))
        );
      }

      await syllabusRepository.updateUploadStatus(uploadId, "completed");
      return { success: true as const, data: { tasks: uniqueTasks }, model: lastModel };
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI processing failed";
      await syllabusRepository.updateUploadStatus(uploadId, "failed", message);
      return { success: false as const, error: message };
    }
  },

  async updateTask(id: string, data: { subject?: string; courseCode?: string | null; taskName?: string; taskType?: string; importance?: string; dueDate?: Date | null; dateNote?: string | null; description?: string | null; instructor?: string | null; reminder?: boolean }) {
    return syllabusRepository.updateTask(id, data as Record<string, unknown>);
  },

  async markTaskSaved(id: string, todoId: string) {
    return syllabusRepository.markTaskSaved(id, todoId);
  },

  async deleteTask(id: string) {
    return syllabusRepository.deleteTask(id);
  },

  async deleteUpload(id: string) {
    return syllabusRepository.deleteUpload(id);
  },

  async summarizeUpload(uploadId: string, language: "english" | "tagalog", origin?: string) {
    const upload = await syllabusRepository.findUploadById(uploadId);
    if (!upload) throw new Error("Upload not found");

    // If extraction is still running, wait for it (up to ~45s) instead of
    // telling the user to try again later — summaries should never bounce.
    if (upload.status === "processing") {
      for (let i = 0; i < 45; i++) {
        await sleep(1000);
        const fresh = await syllabusRepository.findUploadById(uploadId);
        if (!fresh) throw new Error("Upload not found");
        if (fresh.status === "completed" || fresh.status === "failed") break;
      }
    }

    const tasks = await syllabusRepository.findTasksByUpload(uploadId);

    // Persist the summary so it survives page reloads — the UI can hide/show
    // it freely without ever calling the AI again.
    const persist = async (summary: string, model: string) => {
      try {
        await syllabusRepository.updateSummary(uploadId, summary, language);
      } catch (err) {
        console.error("[SYLLABUS] Failed to persist summary:", err);
      }
      return { summary, model };
    };

    // AI summary with a deterministic fallback: if the AI is unavailable or
    // the file has no readable text, we still return a friendly summary built
    // from the extracted tasks. Summarizing NEVER fails.
    try {
      if (upload.mimeType === "application/pdf") {
        const uploadWithText = await syllabusRepository.findUploadText(uploadId);
        let text = uploadWithText?.extractedText ?? "";
        if (!text || text.trim().length < 50) {
          // Legacy upload — no stored text. Fetch the PDF and extract now.
          const pdfUrl = upload.fileUrl.startsWith("http")
            ? upload.fileUrl
            : `${origin ?? ""}${upload.fileUrl}`;
          const res = await fetch(pdfUrl);
          if (res.ok) {
            const pdfBuffer = Buffer.from(await res.arrayBuffer());
            const extracted = await extractPdfText(pdfBuffer);
            text = extracted.text;
          }
        }
        if (!text || text.trim().length < 50) {
          return persist(buildFallbackSummary(tasks, language), "fallback");
        }
        const result = await summarizeSyllabus({ type: "text", text }, language);
        return persist(result.summary, result.model);
      }

      const imageUrl = upload.fileUrl.startsWith("http")
        ? upload.fileUrl
        : `${origin ?? ""}${upload.fileUrl}`;
      const result = await summarizeSyllabus({ type: "image", imageUrl }, language);
      return persist(result.summary, result.model);
    } catch (err) {
      console.error("[SYLLABUS] AI summary failed — using deterministic fallback:", err);
      return persist(buildFallbackSummary(tasks, language), "fallback");
    }
  },

  async getStats() {
    const [totalUploads, totalTasks] = await Promise.all([
      syllabusRepository.countUploads(),
      syllabusRepository.countTasks(),
    ]);
    return { totalUploads, totalTasks };
  },
};

/**
 * Sort tasks chronologically so the review list reads top-to-bottom:
 *  1. Tasks with a "Week N" date note (Week 1 → Week 17)
 *  2. Term-grading items right after their exam week (Midterm Term → after
 *     the Midterm Exam week, Final Term → after the Final Exam week)
 *  3. Tasks with an actual due date
 *  4. Tasks with an explicit term note (Prelim → Midterm → Final)
 *  5. Everything else (alphabetical)
 */
function termAnchorWeek(tasks: Record<string, unknown>[], term: string): number | null {
  const exam = tasks.find((t) =>
    String(t.taskName ?? "").toLowerCase().includes(`${term} exam`)
  );
  const m = String((exam?.dateNote as string) ?? "")
    .toLowerCase()
    .match(/week\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

export function taskOrderScore(t: Record<string, unknown>, allTasks: Record<string, unknown>[]): number {
  const note = ((t.dateNote as string) ?? "").toLowerCase();
  const weekMatch = note.match(/week\s*(\d+)/);
  if (weekMatch) return 100 + Number(weekMatch[1]);

  if (note.includes("midterm term")) {
    return 100 + (termAnchorWeek(allTasks, "midterm") ?? 8) + 0.5;
  }
  if (note.includes("final term")) {
    return 100 + (termAnchorWeek(allTasks, "final") ?? 20) + 0.5;
  }

  if (t.dueDate) return 300 + new Date(t.dueDate as string).getTime() / 86_400_000;

  if (note.includes("prelim") || note.includes("preliminary")) return 400;
  if (note.includes("midterm")) return 500;
  if (note.includes("final")) return 600;

  return 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Deterministic, offline summary fallback — mirrors the AI summary format
 * (plain-text sections, no markdown) so summarizing can NEVER fail even when
 * every AI provider is down or the file has no readable text.
 */
function buildFallbackSummary(
  tasks: Array<{
    subject?: string;
    taskName?: string;
    taskType?: string;
    importance?: string;
    dueDate?: Date | null;
    dateNote?: string | null;
  }>,
  language: "english" | "tagalog",
): string {
  const subjects = [...new Set(tasks.map((t) => t.subject).filter(Boolean))].slice(0, 6);
  const subjectList = subjects.join(", ") || "the course";
  const highTasks = tasks.filter((t) => t.importance === "high");
  const mediumTasks = tasks.filter((t) => t.importance === "medium");
  const reqs = [
    ...highTasks.slice(0, 5).map((t) => t.taskName),
    ...mediumTasks.slice(0, 5).map((t) => t.taskName),
  ].filter(Boolean).slice(0, 10);
  const reqText = reqs.length ? reqs.join(", ") : "None listed in the uploaded file.";

  if (language === "tagalog") {
    return `About the Course
Ang syllabus na ito ay para sa ${subjectList}. Ang mga pangunahing requirements ay nakalistang sa ibaba — tingnan ang buong list para sa mga detalye.

Requirements
${reqText}.

Grading Scheme
Hindi malinaw na nakasaad ang grading breakdown sa file na in-upload mo.

Tips para maging Successful
Tandaan ang mga deadlines sa itaas, i-save ang important tasks sa To-Do list, at mag-aral nang paunti-unti para hindi ka ma-stuck sa huling araw.`;
  }

  return `About the Course
This syllabus covers ${subjectList}. The key requirements are listed below — check the full list for details.

Requirements
${reqText}.

Grading Scheme
The grading breakdown was not clearly stated in the uploaded file.

Tips para maging Successful
Keep track of the deadlines above, save important tasks to your To-Do list, and study a little each week so you never end up cramming.`;
}
