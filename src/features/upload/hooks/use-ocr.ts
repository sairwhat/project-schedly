"use client";

import { useState, useCallback } from "react";

export function useOcr() {
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);

  const runOcr = useCallback(async (file: File): Promise<string> => {
    setIsOcrRunning(true);
    setOcrProgress(0);

    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text" && typeof m.progress === "number") {
            setOcrProgress(Math.round(m.progress * 100));
          }
        },
      });
      const { data } = await worker.recognize(file);
      await worker.terminate();
      return data.text.trim();
    } finally {
      setIsOcrRunning(false);
    }
  }, []);

  return { runOcr, isOcrRunning, ocrProgress };
}
