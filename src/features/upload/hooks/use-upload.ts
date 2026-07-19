"use client";

import { useState, useCallback, useRef } from "react";

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
  statusMessage?: string;
};

export function useUpload() {
  const [upload, setUpload] = useState<UploadStatus | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedClasses, setExtractedClasses] = useState<ExtractedClass[]>([]);
  const [metadata, setMetadata] = useState<{ confidence: number; notes?: string | null } | null>(null);
  const parsedRef = useRef(0);

  const uploadFile = (file: File): Promise<Record<string, unknown>> => {
    return new Promise((resolve, reject) => {
      const uploadId = crypto.randomUUID();
      parsedRef.current = 0;
      setUpload({ id: uploadId, status: "uploading", progress: 0, statusMessage: "Reading file..." });
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
          setUpload((prev) => prev ? { ...prev, progress: pct, statusMessage: `Uploading ${pct}%` } : null);
        }
      });

      xhr.addEventListener("readystatechange", () => {
        if (xhr.readyState === 3 && xhr.status === 200) {
          const newText = xhr.responseText.substring(parsedRef.current);
          parsedRef.current = xhr.responseText.length;

          const lines = newText.split("\n").filter((l: string) => l.trim());
          for (const line of lines) {
            try {
              const msg = JSON.parse(line);
              if (msg.type === "progress") {
                setIsProcessing(true);
                setProgress(msg.progress);
                setUpload((prev) => prev ? {
                  ...prev,
                  status: "processing",
                  progress: msg.progress,
                  statusMessage: msg.message,
                } : null);
              }
            } catch { /* partial line — wait for more data */ }
          }
        }
      });

      xhr.addEventListener("load", () => {
        setProgress(100);
        setIsProcessing(false);

        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const fullText = xhr.responseText;
            const lines = fullText.split("\n").filter((l: string) => l.trim());
            let result: Record<string, unknown> | null = null;

            for (const line of lines) {
              try {
                const msg = JSON.parse(line);
                if (msg.type === "progress") {
                  setProgress(msg.progress);
                  setUpload((prev) => prev ? { ...prev, progress: msg.progress, statusMessage: msg.message } : null);
                } else if (msg.type === "result") {
                  result = msg.data;
                } else if (msg.type === "error") {
                  throw new Error(msg.error);
                }
              } catch { /* skip malformed lines */ }
            }

            if (result) {
              setExtractedClasses((result.classes || []) as ExtractedClass[]);
              setMetadata((result.metadata || { confidence: 0 }) as { confidence: number; notes?: string | null });
              setUpload((prev) => prev ? {
                ...prev,
                status: "completed",
                progress: 100,
                fileUrl: result!.fileUrl as string,
                id: result!.uploadId as string,
                statusMessage: "Complete!",
              } : null);
              resolve(result);
            } else {
              // Fallback: parse entire response as JSON
              const data = JSON.parse(fullText);
              if (data.error) throw new Error(data.error);
              setExtractedClasses(data.classes || []);
              setMetadata(data.metadata || { confidence: 0 });
              setUpload((prev) => prev ? {
                ...prev,
                status: "completed",
                progress: 100,
                fileUrl: data.fileUrl,
                id: data.uploadId,
                statusMessage: "Complete!",
              } : null);
              resolve(data);
            }
          } catch {
            setUpload((prev) => prev ? { ...prev, status: "failed", error: "Invalid response" } : null);
            reject(new Error("Invalid response"));
          }
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            throw new Error(err.error || "Upload failed");
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Upload failed";
            setUpload((prev) => prev ? { ...prev, status: "failed", error: msg } : null);
            reject(e);
          }
        }
      });

      xhr.addEventListener("error", () => {
        setIsProcessing(false);
        setUpload((prev) => prev ? { ...prev, status: "failed", error: "Network error" } : null);
        reject(new Error("Network error"));
      });

      xhr.addEventListener("abort", () => {
        setIsProcessing(false);
        setUpload((prev) => prev ? { ...prev, status: "failed", error: "Upload cancelled" } : null);
        reject(new Error("Upload cancelled"));
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
