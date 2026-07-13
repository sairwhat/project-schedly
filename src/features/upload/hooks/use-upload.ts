"use client";

import { useState } from "react";
export type ExtractedClass = {
  subject: string;
  code: string | null;
  instructor: string | null;
  room: string | null;
  section: string | null;
  days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
  startTime: string;
  endTime: string;
};

type UploadStatus = {
  id: string;
  status: "pending" | "uploading" | "processing" | "completed" | "failed";
  progress: number;
  error?: string;
  fileUrl?: string;
};

export function useUpload() {
  const [upload, setUpload] = useState<UploadStatus | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [extractedClasses, setExtractedClasses] = useState<ExtractedClass[]>([]);
  const [metadata, setMetadata] = useState<{ confidence: number; notes?: string | null } | null>(null);

  const uploadFile = async (file: File) => {
    const uploadId = crypto.randomUUID();
    setUpload({ id: uploadId, status: "pending", progress: 0 });
    setIsUploading(true);
    setProgress(0);
    setExtractedClasses([]);
    setMetadata(null);

    try {
      setUpload((prev) => (prev ? { ...prev, status: "uploading", progress: 10 } : null));
      setProgress(10);

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      setUpload((prev) => (prev ? { ...prev, status: "processing", progress: 50 } : null));
      setProgress(50);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(error.error || "Upload failed");
      }

      const data = await response.json();

      setExtractedClasses(data.classes || []);
      setMetadata(data.metadata || { confidence: 0 });
      setUpload((prev) => (prev ? {
        ...prev,
        status: "completed",
        progress: 100,
        fileUrl: data.fileUrl,
        id: data.uploadId,
      } : null));
      setProgress(100);

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setUpload((prev) => (prev ? { ...prev, status: "failed", error: message } : null));
      throw err;
    } finally {
      setIsUploading(false);
    }
  };

  const resetUpload = () => {
    setUpload(null);
    setIsUploading(false);
    setProgress(0);
    setExtractedClasses([]);
    setMetadata(null);
  };

  const updateExtractedClass = (index: number, updated: ExtractedClass) => {
    setExtractedClasses((prev) => prev.map((c, i) => (i === index ? updated : c)));
  };

  const removeExtractedClass = (index: number) => {
    setExtractedClasses((prev) => prev.filter((_, i) => i !== index));
  };

  const addExtractedClass = () => {
    setExtractedClasses((prev) => [
      ...prev,
      {
        subject: "",
        code: null,
        instructor: null,
        room: null,
        section: null,
        days: [],
        startTime: "09:00",
        endTime: "10:00",
      },
    ]);
  };

  return {
    upload,
    isUploading,
    progress,
    uploadFile,
    resetUpload,
    extractedClasses,
    metadata,
    updateExtractedClass,
    removeExtractedClass,
    addExtractedClass,
  };
}
