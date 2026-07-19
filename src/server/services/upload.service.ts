import { uploadRepository } from "@/server/repositories/upload.repository";
import { extractScheduleFromImage } from "@/server/lib/ai";
import { extractionResultSchema } from "@/server/validators/ai.schema";

export const uploadService = {
  async getByUser(userId: string) {
    return uploadRepository.findByUser(userId);
  },

  async create(userId: string, file: { url: string; name: string; size: number; mimeType: string }) {
    return uploadRepository.create({
      userId,
      fileUrl: file.url,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.mimeType,
    });
  },

  async updateStatus(id: string, status: Parameters<typeof uploadRepository.updateStatus>[1], errorMessage?: string | null) {
    return uploadRepository.updateStatus(id, status, errorMessage);
  },

  async processWithAi(uploadId: string, imageUrl: string) {
    try {
      await uploadRepository.updateStatus(uploadId, "processing");
      const raw = await extractScheduleFromImage(imageUrl);
      const parsed = extractionResultSchema.safeParse(raw);

      if (!parsed.success) {
        await uploadRepository.updateStatus(uploadId, "failed", "AI returned invalid data");
        return { success: false as const, error: "AI returned invalid data" };
      }

      if (parsed.data.metadata.error) {
        await uploadRepository.updateStatus(uploadId, "failed", parsed.data.metadata.error);
        return { success: false as const, error: parsed.data.metadata.error };
      }

      await uploadRepository.updateAiResult(uploadId, parsed.data, "completed");
      return { success: true as const, data: parsed.data };
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI processing failed";
      await uploadRepository.updateStatus(uploadId, "failed", message);
      return { success: false as const, error: message };
    }
  },

  async getById(id: string) {
    return uploadRepository.findById(id);
  },
};
