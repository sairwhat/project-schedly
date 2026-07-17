"use client";

import { useState, useRef, useCallback } from "react";

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

type StepLabel =
  | "Uploading image..."
  | "Sending to server..."
  | "AI analyzing your schedule..."
  | "Extracting class data..."
  | "Validating results..."
  | "Done!";

const STEPS: { label: StepLabel; progress: number }[] = [
  { label: "Uploading image...", progress: 8 },
  { label: "Sending to server...", progress: 20 },
  { label: "AI analyzing your schedule...", progress: 40 },
  { label: "Extracting class data...", progress: 65 },
  { label: "Validating results...", progress: 85 },
  { label: "Done!", progress: 100 },
];

export function useUpload() {
  const [upload, setUpload] = useState<UploadStatus | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stepLabel, setStepLabel] = useState<StepLabel | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [extractedClasses, setExtractedClasses] = useState<ExtractedClass[]>([]);
  const [metadata, setMetadata] = useState<{ confidence: number; notes?: string | null } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const advanceSteps = useCallback((startIdx: number, duration: number) => {
    clearTimer();
    const remaining = STEPS.slice(startIdx);
    const interval = duration / remaining.length;
    let idx = 0;

    timerRef.current = setInterval(() => {
      if (idx < remaining.length) {
        const step = remaining[idx]!;
        setProgress(step.progress);
        setStepLabel(step.label);
        setCurrentStep(startIdx + idx);
        idx++;
      } else {
        clearTimer();
      }
    }, interval);
  }, [clearTimer]);

  const uploadFile = async (file: File) => {
    const uploadId = crypto.randomUUID();
    setUpload({ id: uploadId, status: "pending", progress: 0 });
    setIsUploading(true);
    setProgress(0);
    setCurrentStep(0);
    setStepLabel(STEPS[0]!.label);
    setExtractedClasses([]);
    setMetadata(null);

    advanceSteps(0, 6000);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      clearTimer();

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(error.error || "Upload failed");
      }

      const data = await response.json();

      setProgress(100);
      setStepLabel("Done!");
      setCurrentStep(STEPS.length - 1);
      setExtractedClasses(data.classes || []);
      setMetadata(data.metadata || { confidence: 0 });
      setUpload((prev) => prev ? {
        ...prev,
        status: "completed",
        progress: 100,
        fileUrl: data.fileUrl,
        id: data.uploadId,
      } : null);

      return data;
    } catch (err) {
      clearTimer();
      const message = err instanceof Error ? err.message : "Upload failed";
      setUpload((prev) => prev ? { ...prev, status: "failed", error: message, progress: 0 } : null);
      setStepLabel(null);
      setProgress(0);
      throw err;
    } finally {
      setIsUploading(false);
    }
  };

  const resetUpload = () => {
    clearTimer();
    setUpload(null);
    setIsUploading(false);
    setProgress(0);
    setStepLabel(null);
    setCurrentStep(0);
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
    stepLabel,
    currentStep,
    totalSteps: STEPS.length,
    uploadFile,
    resetUpload,
    extractedClasses,
    metadata,
    updateExtractedClass,
    removeExtractedClass,
    addExtractedClass,
  };
}
