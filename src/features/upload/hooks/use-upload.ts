"use client";

import { useState } from "react";
import { retry } from "@/lib/retry";

export type ExtractedClass = {
  subject: string;
  code: string | null;
  instructor: string | null;
  room: string | null;
  section: string | null;
  block: string | null;
  notes: string | null;
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedClasses, setExtractedClasses] = useState<ExtractedClass[]>([]);
  const [metadata, setMetadata] = useState<{ confidence: number; notes?: string | null } | null>(null);

  const pollStatus = (uploadId: string): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/upload/${uploadId}`, {
            headers: { "x-csrf-protection": "1" },
          });
          if (!res.ok) {
            clearInterval(interval);
            reject(new Error("Failed to check upload status"));
            return;
          }
          const data = await res.json();
          if (data.status === "completed") {
            clearInterval(interval);
            resolve(data);
          } else if (data.status === "failed") {
            clearInterval(interval);
            reject(new Error(data.errorMessage || "Processing failed"));
          }
        } catch (err) {
          clearInterval(interval);
          reject(err);
        }
      }, 1500);

      setTimeout(() => {
        clearInterval(interval);
        reject(new Error("Processing timed out. Please try again."));
      }, 120_000);
    });

  const uploadFile = (file: File, ocrText?: string): Promise<Record<string, unknown>> => {
    const uploadId = crypto.randomUUID();
    setUpload({ id: uploadId, status: "uploading", progress: 0, error: undefined });
    setIsUploading(true);
    setProgress(0);
    setIsProcessing(false);
    setExtractedClasses([]);
    setMetadata(null);

    const doUpload = () => new Promise<Record<string, unknown>>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setProgress(pct);
          setUpload((prev) => prev ? { ...prev, progress: pct } : null);
        }
      });

      xhr.addEventListener("load", () => {
        setProgress(100);

        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText);
          const returnedUploadId = data.uploadId || uploadId;

          setIsUploading(false);
          setIsProcessing(true);
          setUpload((prev) => prev ? {
            ...prev,
            status: "processing",
            progress: 100,
            fileUrl: data.fileUrl,
            id: returnedUploadId,
            error: undefined,
          } : null);

          pollStatus(returnedUploadId)
            .then((result) => {
              const r = result as {
                classes?: ExtractedClass[];
                metadata?: { confidence: number; notes?: string | null };
                fileUrl?: string;
                uploadId?: string;
              };
              setExtractedClasses(r.classes || []);
              setMetadata(r.metadata || { confidence: 0 });
              setUpload((prev) => prev ? {
                ...prev,
                status: "completed" as const,
                progress: 100,
                fileUrl: r.fileUrl,
                id: r.uploadId ?? returnedUploadId,
                error: undefined,
              } : null);
              setIsProcessing(false);
              resolve(result);
            })
            .catch((pollErr) => {
              const msg = pollErr instanceof Error ? pollErr.message : "Upload failed";
              setUpload((prev) => prev ? { ...prev, status: "failed", error: msg } : null);
              setIsProcessing(false);
              reject(pollErr);
            });
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            throw new Error(err.error || "Upload failed");
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Upload failed";
            setUpload((prev) => prev ? { ...prev, status: "failed", error: msg } : null);
            setIsUploading(false);
            setIsProcessing(false);
            reject(e);
          }
        }
      });

      xhr.addEventListener("error", () => {
        setIsUploading(false);
        setIsProcessing(false);
        setUpload((prev) => prev ? { ...prev, status: "failed", error: "Network error" } : null);
        reject(new Error("Network error"));
      });

      xhr.addEventListener("abort", () => {
        setIsUploading(false);
        setIsProcessing(false);
        setUpload((prev) => prev ? { ...prev, status: "failed", error: "Upload cancelled" } : null);
        reject(new Error("Upload cancelled"));
      });

      xhr.open("POST", "/api/upload");
      xhr.setRequestHeader("x-csrf-protection", "1");

      const formData = new FormData();
      formData.append("file", file);
      if (ocrText) formData.append("ocrText", ocrText);

      xhr.send(formData);
    });

    return retry(doUpload, { maxRetries: 1, delayMs: 2000 });
  };

  const resetUpload = () => {
    setUpload(null);
    setIsUploading(false);
    setProgress(0);
    setIsProcessing(false);
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
        block: null,
        notes: null,
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
    isProcessing,
    uploadFile,
    resetUpload,
    extractedClasses,
    metadata,
    updateExtractedClass,
    removeExtractedClass,
    addExtractedClass,
  };
}
