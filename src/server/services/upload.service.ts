import { uploadRepository } from "@/server/repositories/upload.repository";
import { aiService } from "@/server/services/ai.service";

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
      const result = await aiService.processImage(imageUrl);

      if (!result.success) {
        await uploadRepository.updateStatus(uploadId, "failed", result.error.message);
        return { success: false as const, error: result.error.message };
      }

      await uploadRepository.updateAiResult(uploadId, JSON.parse(JSON.stringify(result.data)), "completed");
      return { success: true as const, data: result.data };
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
