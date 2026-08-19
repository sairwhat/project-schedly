"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useUpload } from "@/features/upload";
import { ScheduleReview } from "@/features/upload";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HeaderAvatar } from "@/components/header-avatar";
import { NotificationBell } from "@/components/notification-bell";
import {
  Camera, Image, AlertCircle, CheckCircle, ArrowLeft,
  Calendar, Upload, X, Plus,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { compressImage } from "@/lib/image-compress";
import { validateExtractedClasses, type ValidationIssue } from "@/server/services/validation.service";
import {
  getReviewState,
  getReviewImage,
  saveReviewState,
  saveReviewImage,
  clearReviewState,
} from "@/features/upload/lib/review-state";
import {
  getUploadState,
  saveUploadState,
  clearUploadState,
  getProcessingStarted,
  saveProcessingStarted,
  clearProcessingStarted,
} from "@/features/upload/lib/upload-state";

type Phase = "upload-select" | "review";

export default function CapturePage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const u = user as ({ id?: string } & Record<string, unknown>) | null;

  const [phase, setPhase] = useState<Phase>("upload-select");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const {
    uploadFile, isUploading, progress, upload, isProcessing,
    extractedClasses, metadata,
    updateExtractedClass, removeExtractedClass, addExtractedClass, resetUpload,
    restoreExtractedClasses, setMetadata, resumeUpload,
  } = useUpload();

  const userId = (u as { id?: string } | null)?.id || "anon";

  // "blessly luison" already uploaded a schedule — hide the capture prompt
  // text so it doesn't ask for a photo again.
  const isBlessly =
    [u?.firstName, u?.lastName].filter(Boolean).join(" ").toLowerCase().includes("bless") &&
    [u?.firstName, u?.lastName].filter(Boolean).join(" ").toLowerCase().includes("luison");

  // Resume an in-progress review (e.g., after coming back from the design
  // editor, which unmounts this page and clears its React state).
  const resumedRef = useRef(false);
  useEffect(() => {
    if (authLoading || resumedRef.current) return;
    const saved = getReviewState(userId);
    if (saved && saved.classes.length > 0) {
      clearUploadState(userId);
      restoreExtractedClasses(saved.classes);
      setMetadata(saved.confidence != null ? { confidence: saved.confidence } : null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValidationIssues(saved.validationIssues);
      setPreviewUrl(getReviewImage(userId));
      setPhase("review");
      return;
    }

    // No review yet — maybe the user left while the AI was still reading the
    // photo. Re-attach to the in-flight upload so the progress isn't lost.
    const pending = getUploadState(userId);
    if (pending && !selectedFile && !upload) {
      resumedRef.current = true;
      setSelectedFile({
        name: pending.fileName,
        size: pending.fileSize,
        type: pending.fileType,
      } as File);
      setPreviewUrl(pending.previewUrl);
      setPhase("upload-select");
      resumeUpload(pending.uploadId)
        .then((data) => {
          const classes = (data as { classes?: unknown[] }).classes;
          if (classes && classes.length > 0) {
            const result = validateExtractedClasses(
              classes as Parameters<typeof validateExtractedClasses>[0]
            );
            setValidationIssues(result.issues);
            setPhase("review");
          }
        })
        .catch(() => {
          // The failed status is reflected in `upload.error`.
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, userId]);

  // While the AI reads the photo, keep the upload id + preview in
  // localStorage so a tab switch doesn't lose the progress.
  useEffect(() => {
    if (phase !== "upload-select" || !selectedFile || upload?.status !== "processing" || !upload.id) return;
    saveUploadState(userId, {
      uploadId: upload.id,
      fileName: selectedFile.name,
      fileSize: selectedFile.size,
      fileType: selectedFile.type,
      previewUrl,
    });
  }, [phase, selectedFile, upload, userId, previewUrl]);

  // Keep the in-progress review in localStorage so it survives remounts.
  const reviewReady = phase === "review" && extractedClasses.length > 0;

  // Manual creation: path taken via "Create manually instead" — no image, no
  // upload, no AI confidence. Used to specialize the review UI.
  const isManualCreate = phase === "review" && !previewUrl && !upload?.id && !upload?.fileUrl;

  useEffect(() => {
    if (!reviewReady) return;
    saveReviewState(userId, {
      classes: extractedClasses,
      confidence: metadata?.confidence ?? null,
      validationIssues,
    });
  }, [reviewReady, userId, extractedClasses, metadata, validationIssues]);

  useEffect(() => {
    if (reviewReady && previewUrl) {
      saveReviewImage(userId, previewUrl);
    }
  }, [reviewReady, userId, previewUrl]);

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }
    // Big phone photos can exceed the server's request-body limit, which makes
    // the upload fail with a confusing error. Downscale + re-encode in the
    // browser first so the image stays crisp but lands well under the limit.
    const processed = await compressImage(file).catch(() => file);
    setSelectedFile(processed);
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(processed);
  };

  const removeFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    resetUpload();
    clearUploadState(userId);
    clearProcessingStarted(userId);
  };

  // The center camera button re-routes here even when we're already on the
  // page — treat it as "start a fresh capture".
  useEffect(() => {
    const onQuickAdd = () => {
      removeFile();
      setValidationIssues([]);
      clearReviewState(userId);
      setPhase("upload-select");
    };
    window.addEventListener("schedly:quickadd", onQuickAdd);
    return () => window.removeEventListener("schedly:quickadd", onQuickAdd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    clearProcessingStarted(userId);
    setFakeProgress(0);
    try {
      const data = await uploadFile(selectedFile) as { classes?: unknown[] };
      if (data.classes && data.classes.length > 0) {
        const result = validateExtractedClasses(data.classes as Parameters<typeof validateExtractedClasses>[0]);
        setValidationIssues(result.issues);
        clearUploadState(userId);
        setPhase("review");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaved = async (_scheduleId: string) => {
    // Leave the review phase FIRST so the localStorage persist effect
    // (reviewReady -> false) can never re-save the review after we clear it.
    setValidationIssues([]);
    resetUpload();
    clearReviewState(userId);
    clearUploadState(userId);
    clearProcessingStarted(userId);
    // Straight to the "Remind Me Before Class" setup so the user can pick how
    // many minutes before each class the notification should fire, then
    // Continue to the dashboard.
    router.push("/reminder-setup");
  };

  const handleBackToSelect = () => {
    removeFile();
    setValidationIssues([]);
    clearReviewState(userId);
    setPhase("upload-select");
  };

  const handleCreateManually = () => {
    // Skip upload, go straight to review with one blank class row so the
    // user can start typing immediately (Enter commits + adds the next row).
    setValidationIssues([]);
    clearReviewState(userId);
    clearUploadState(userId);
    resetUpload();
    addExtractedClass();
    setPhase("review");
  };

  const handleBackToCalendar = () => {
    removeFile();
    setValidationIssues([]);
    clearReviewState(userId);
    router.push("/schedule");
  };

  // Extraction continues in the background and the client polls for status
  // (see use-upload). Real upload progress maps onto the first ~10%. While the
  // AI reads the image there is no true percentage, so we show a slow
  // asymptotic climb from ~1% toward ~95% — it never jumps straight to 99 and
  // sits there, which felt stuck. It only hits 100% once extraction actually
  // finishes.
  const isAiWorking = isProcessing || (isUploading && progress >= 100);

  const [fakeProgress, setFakeProgress] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const origin = getProcessingStarted(userId);
    if (!origin) return 0;
    const elapsedMin = (Date.now() - origin) / 60000;
    return Math.round(94 * (1 - Math.exp(-elapsedMin * 0.9)));
  });

  useEffect(() => {
    if (!isAiWorking) return;
    const origin = getProcessingStarted(userId) ?? Date.now();
    saveProcessingStarted(userId, origin);
    const tick = () => {
      const elapsedMin = (Date.now() - origin) / 60000;
      // Slow, steady climb: ~25% after 20s, ~56% after a minute, ~95% after ~3min.
      setFakeProgress(Math.round(94 * (1 - Math.exp(-elapsedMin * 0.9))));
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [isAiWorking, userId]);

  const displayProgress =
    upload?.status === "completed"
      ? 100
      : isAiWorking
        ? Math.min(95, Math.max(1, fakeProgress))
        : Math.max(1, Math.min(10, Math.round((progress / 100) * 10)));

  return (
    <div className="mx-auto max-w-4xl pt-8 md:pt-0">
      <div className="mb-6 sm:mb-8">
        {isManualCreate ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <HeaderAvatar />
                <Button variant="ghost" size="icon-sm" onClick={handleBackToSelect} aria-label="Back">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  <Calendar className="h-6 w-6 text-primary" />
                  Add Schedule Manually
                </h1>
              </div>
              <NotificationBell variant="inline" className="hidden md:flex" />
            </div>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              Enter your classes and details one by one
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <HeaderAvatar />
                {!isBlessly && (
                  <Button variant="ghost" size="icon-sm" onClick={handleBackToCalendar} aria-label="Back to calendar">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                {!isBlessly && (
                  <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    <Camera className="h-6 w-6 text-primary" />
                    Capture Schedule
                  </h1>
                )}
              </div>
              <NotificationBell variant="inline" className="hidden md:flex" />
            </div>
            {!isBlessly && (
              <p className="mt-1 text-sm text-muted-foreground sm:text-base">
                Take or choose a photo of your class schedule
              </p>
            )}
          </>
        )}
      </div>

      {/* === REVIEW === */}
      {phase === "review" && !isManualCreate && (
        <div className="mb-4 flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={handleBackToSelect} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">Review Extracted Classes</h2>
            <p className="text-sm text-muted-foreground">Check and correct the extraction</p>
          </div>
        </div>
      )}

      {/* === REVIEW === */}
      {phase === "review" && (
        <div className="mx-auto max-w-2xl space-y-4">
          {previewUrl && (
            <div className="relative overflow-hidden rounded-xl bg-card ring-1 ring-border/50">
              <img
                src={previewUrl}
                alt="Uploaded schedule"
                className="mx-auto h-auto w-full max-w-2xl"
              />
            </div>
          )}
          <ScheduleReview
            classes={extractedClasses}
            uploadId={upload?.id}
            fileUrl={upload?.fileUrl}
            designImageUrl={previewUrl ?? upload?.fileUrl}
            confidence={metadata?.confidence}
            validationIssues={validationIssues}
            onUpdate={updateExtractedClass}
            onRemove={removeExtractedClass}
            onAdd={addExtractedClass}
            onSaved={handleSaved}
            onCancel={handleBackToSelect}
          />
        </div>
      )}

      {/* === UPLOAD SELECT === */}
      {phase === "upload-select" && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-16 text-center">
          {!selectedFile ? (
            <>
              <Calendar className="mb-3 h-8 w-8 text-muted-foreground/40" />
              <h3 className="text-lg font-semibold text-foreground">Upload your schedule</h3>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground leading-relaxed">
                Schedly will extract your classes automatically.
              </p>
              <div className="mt-5 flex w-full max-w-sm flex-row gap-3">
                <Button className="flex-1 h-11 px-6 font-medium" onClick={() => document.getElementById("upload-camera")?.click()}>
                  <Camera className="mr-2 h-4 w-4" /> Take Photo
                </Button>
                <Button variant="outline" className="flex-1 h-11 px-6 font-medium" onClick={() => document.getElementById("upload-file")?.click()}>
                  <Image className="mr-2 h-4 w-4" /> Choose File
                </Button>
                <input id="upload-camera" type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
                <input id="upload-file" type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
              </div>
              <Button
                variant="ghost"
                className="mt-3 w-full max-w-sm text-sm text-muted-foreground hover:text-primary"
                onClick={handleCreateManually}
              >
                <Plus className="mr-2 h-4 w-4" /> Create manually instead
              </Button>
            </>
          ) : (
            <div className="w-full max-w-md space-y-4">
              <div className="relative w-full overflow-hidden rounded-xl bg-muted">
                {previewUrl ? (
                  <>
                    <img src={previewUrl} alt="Schedule preview" className="mx-auto h-auto max-h-[70vh] w-auto max-w-full object-contain" />
                    {(isUploading || isProcessing) && (
                      <div className="pointer-events-none absolute inset-0">
                        <div className="animate-scan-line absolute left-0 right-0 h-20 bg-gradient-to-b from-transparent via-primary/40 to-transparent shadow-[0_0_24px] shadow-primary/40" />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="aspect-video flex items-center justify-center">
                    <Skeleton className="h-full w-full" />
                  </div>
                )}
                {!isUploading && !isProcessing && (
                  <button
                    onClick={removeFile}
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-card/90 text-muted-foreground shadow-sm transition-colors hover:bg-card hover:text-foreground"
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/40 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Image className="h-4 w-4 shrink-0 text-primary" />
                  <p className="truncate text-sm font-medium text-foreground">{selectedFile.name}</p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>

              {isUploading || isProcessing ? (
                <div key={isAiWorking ? "reading" : "uploading"} className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                      {isAiWorking ? (
                        <Spinner size={16} color="var(--primary)" />
                      ) : (
                        <Upload className="h-4 w-4 animate-pulse text-primary" />
                      )}
                      {isAiWorking ? "Reading your schedule" : "Uploading your schedule"}
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                      {displayProgress}%
                    </span>
                  </div>
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-primary/10">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-200 ease-out"
                      style={{ width: `${displayProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <Button variant="outline" onClick={removeFile} className="flex-1 h-12">
                    Cancel
                  </Button>
                  <Button onClick={handleUpload} className="flex-[1.4] h-12">
                    <CheckCircle className="mr-2 h-4 w-4" /> Extract Schedule
                  </Button>
                </div>
              )}

              {upload?.error && (
                <p className="flex items-center gap-1 text-sm text-red-500">
                  <AlertCircle className="h-4 w-4" /> {upload.error}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
