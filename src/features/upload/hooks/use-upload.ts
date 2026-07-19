"use client";

import { useState, useCallback } from "react";

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedClasses, setExtractedClasses] = useState<ExtractedClass[]>([]);
  const [metadata, setMetadata] = useState<{ confidence: number; notes?: string | null } | null>(null);

  const uploadFile = (file: File): Promise<Record<string, unknown>> => {
    return new Promise((resolve, reject) => {
      const uploadId = crypto.randomUUID();
      setUpload({ id: uploadId, status: "uploading", progress: 0 });
      setIsUploading(true);
      setProgress(0);
      setIsProcessing(false);
      setExtractedClasses([]);
      setMetadata(null);

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
          try {
            const data = JSON.parse(xhr.responseText);
            setExtractedClasses(data.classes || []);
            setMetadata(data.metadata || { confidence: 0 });
            setUpload((prev) => prev ? {
              ...prev,
              status: "completed",
              progress: 100,
              fileUrl: data.fileUrl,
              id: data.uploadId,
            } : null);
            setIsUploading(false);
            setIsProcessing(false);
            resolve(data);
          } catch {
            setUpload((prev) => prev ? { ...prev, status: "failed", error: "Invalid response" } : null);
            setIsUploading(false);
            setIsProcessing(false);
            reject(new Error("Invalid response"));
          }
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

      xhr.upload.addEventListener("load", () => {
        setIsProcessing(true);
        setUpload((prev) => prev ? { ...prev, status: "processing" } : null);
      });

      xhr.open("POST", "/api/upload");
      xhr.setRequestHeader("x-csrf-protection", "1");

      const formData = new FormData();
      formData.append("file", file);

      xhr.send(formData);
    });
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
