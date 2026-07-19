"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useUpload } from "@/features/upload";
import { useOcr } from "@/features/upload/hooks/use-ocr";
import { ScheduleReview } from "@/features/upload";
import { SchedulePreview } from "@/features/schedule/components/schedule-preview";
import { getUserSchedules, getSchedule, deleteSchedule } from "./actions";
import { retry } from "@/lib/retry";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Camera, Image, AlertCircle, CheckCircle, ArrowLeft,
  Plus, Calendar, ChevronRight, Trash2,
} from "lucide-react";
import { validateExtractedClasses, type ValidationIssue } from "@/server/services/validation.service";

type ClassData = {
  id: string;
  subject: string;
  code: string | null;
  instructor: string | null;
  room: string | null;
  section: string | null;
  color: string;
  startTime: Date;
  endTime: Date;
  days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
};

type ScheduleData = {
  id: string;
  title: string;
  semester: string | null;
  academicYear: string | null;
  isActive: boolean;
  createdAt: Date;
  classes: ClassData[];
};

type UserWithExtras = {
  firstName?: string;
  lastName?: string;
} & Record<string, unknown>;

type Phase = "list" | "view" | "upload-select" | "review" | "saved";

export default function SchedulePage() {
  const { user, isLoading: authLoading } = useAuth();
  const u = user as UserWithExtras | null;

  const [phase, setPhase] = useState<Phase>("list");
  const [greeting] = useState(() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  });
  const [schedules, setSchedules] = useState<ScheduleData[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleData | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [ocrError, setOcrError] = useState("");
  const {
    uploadFile, isUploading, progress, upload, isProcessing,
    extractedClasses, metadata,
    updateExtractedClass, removeExtractedClass, addExtractedClass, resetUpload,
  } = useUpload();
  const { runOcr, isOcrRunning, ocrProgress } = useOcr();

  useEffect(() => {
    if (!authLoading) {
      retry(() => getUserSchedules(), { delayMs: 2000 }).then((data) => {
        setSchedules(data as ScheduleData[]);
        setLoadingSchedules(false);
      });
    }
  }, [authLoading]);

  const firstName = u?.firstName || "User";

  const handleViewSchedule = async (scheduleId: string) => {
    const data = await getSchedule(scheduleId);
    if (data) {
      setSelectedSchedule(data as ScheduleData);
      setPhase("view");
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm("Delete this schedule?")) return;
    const result = await deleteSchedule(scheduleId);
    if (result.success) {
      setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
      if (selectedSchedule?.id === scheduleId) {
        setSelectedSchedule(null);
        setPhase("list");
      }
    }
  };

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const removeFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    resetUpload();
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setOcrError("");
    try {
      const ocrText = await runOcr(selectedFile);
      if (!ocrText) {
        setOcrError("OCR couldn't read any text. Try a clearer image.");
        return;
      }
      const data = await uploadFile(selectedFile, ocrText) as { classes?: unknown[] };
      if (data.classes && data.classes.length > 0) {
        const result = validateExtractedClasses(data.classes as Parameters<typeof validateExtractedClasses>[0]);
        setValidationIssues(result.issues);
        setPhase("review");
      }
    } catch (err) {
      console.error(err);
      setOcrError("Something went wrong during text extraction.");
    }
  };

  const handleSaved = async (_scheduleId: string) => {
    setPhase("saved");
    setValidationIssues([]);
    const data = await getUserSchedules();
    setSchedules(data as ScheduleData[]);
  };

  const handleBackToList = () => {
    removeFile();
    setValidationIssues([]);
    setSelectedSchedule(null);
    setPhase("list");
  };

  const handleBackToSelect = () => {
    removeFile();
    setValidationIssues([]);
    setPhase("upload-select");
  };

  return (
    <div className="flex flex-col bg-background">
      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {greeting}, {firstName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              {phase === "list"
                ? `${schedules.length} schedule${schedules.length !== 1 ? "s" : ""} saved`
                : "Your class schedule"
              }
            </p>
          </div>

          {/* === SAVED SUCCESS === */}
          {phase === "saved" && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-green-200 bg-green-50 px-6 py-16 text-center dark:border-green-800 dark:bg-green-950">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 dark:bg-green-900">
                <CheckCircle className="h-7 w-7 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">Schedule Saved!</h3>
              <p className="mt-1 max-w-xs text-sm text-green-700 dark:text-green-300">
                Your classes have been saved to your timetable.
              </p>
              <Button className="mt-5" onClick={handleBackToList}>
                Back to Schedules
              </Button>
            </div>
          )}

          {/* === REVIEW === */}
          {phase === "review" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={handleBackToSelect}>
                  <ArrowLeft className="mr-1 h-4 w-4" /> Back
                </Button>
                <div>
                  <h2 className="text-lg font-semibold">Review Extracted Classes</h2>
                  <p className="text-sm text-muted-foreground">Check and correct the AI extraction</p>
                </div>
              </div>
              {previewUrl && (
                <div className="relative max-h-48 overflow-hidden rounded-xl bg-muted">
                  <img src={previewUrl} alt="Uploaded schedule" className="h-full w-full object-contain" />
                </div>
              )}
              <ScheduleReview
                classes={extractedClasses}
                uploadId={upload?.id}
                fileUrl={upload?.fileUrl}
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
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={handleBackToList}>
                  <ArrowLeft className="mr-1 h-4 w-4" /> Back
                </Button>
                <div>
                  <h2 className="text-lg font-semibold">Upload Schedule</h2>
                  <p className="text-sm text-muted-foreground">Take or choose a photo of your class schedule</p>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-16 text-center">
                {!selectedFile ? (
                  <>
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                      <Calendar className="h-7 w-7 text-primary/70" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">Upload your schedule</h3>
                    <p className="mt-1 max-w-xs text-sm text-muted-foreground leading-relaxed">
                      Schedly will use AI to extract your classes automatically.
                    </p>
                     <div className="mt-5 flex flex-row gap-3 w-full max-w-xs">
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
                  </>
                ) : (
                  <div className="w-full max-w-md space-y-4">
                    <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                      {previewUrl ? (
                        <img src={previewUrl} alt="Schedule preview" className="h-full w-full object-contain" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Skeleton className="h-full w-full" />
                        </div>
                      )}
                      {!isUploading && (
                        <button onClick={removeFile} className="absolute right-2 top-2 rounded-full bg-background/80 p-1 hover:bg-background" aria-label="Remove">
                          <span className="text-lg">&times;</span>
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB &middot; {selectedFile.type}</p>
                    </div>

                    {isUploading || isOcrRunning ? (
                      <div className="space-y-3">
                        {isOcrRunning && (
                          <>
                            <div className="relative h-2 w-full overflow-hidden rounded-full bg-primary/10">
                              <div
                                className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-300 ease-out"
                                style={{ width: `${ocrProgress}%` }}
                              />
                            </div>
                            <div className="text-center">
                              <p className="text-sm font-medium text-foreground">
                                <span className="inline-flex items-center gap-2">
                                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                  Extracting text from image...
                                </span>
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                This runs entirely in your browser.
                              </p>
                            </div>
                          </>
                        )}
                        {isUploading && (
                          <>
                            <div className="relative h-2 w-full overflow-hidden rounded-full bg-primary/10">
                              <div
                                className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-300 ease-out"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <div className="text-center">
                              <p className="text-sm font-medium text-foreground">
                                {isProcessing ? (
                                  <span className="inline-flex items-center gap-2">
                                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                    AI is reading your schedule
                                  </span>
                                ) : `Uploading ${progress}%`}
                              </p>
                              {isProcessing && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  This may take a moment — AI processing time varies depending on server load.
                                  <br />
                                  Please hold on while we extract your classes.
                                </p>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <Button variant="outline" onClick={removeFile} className="flex-1">Cancel</Button>
                        <Button onClick={handleUpload} className="flex-1">
                          <CheckCircle className="mr-2 h-4 w-4" /> Extract Schedule
                        </Button>
                      </div>
                    )}

                    {upload?.error && (
                      <p className="flex items-center gap-1 text-sm text-red-500">
                        <AlertCircle className="h-4 w-4" /> {upload.error}
                      </p>
                    )}
                    {ocrError && (
                      <p className="flex items-center gap-1 text-sm text-red-500">
                        <AlertCircle className="h-4 w-4" /> {ocrError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* === VIEW TIMETABLE === */}
          {phase === "view" && selectedSchedule && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" size="sm" onClick={handleBackToList}>
                  <ArrowLeft className="mr-1 h-4 w-4" /> Back
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-destructive hover:text-destructive"
                  onClick={() => handleDeleteSchedule(selectedSchedule.id)}
                >
                  <Trash2 className="mr-1 h-3 w-3" /> Delete
                </Button>
              </div>
              <SchedulePreview
                classes={selectedSchedule.classes}
                filename={`${selectedSchedule.title}.png`}
              />
            </div>
          )}

          {/* === SCHEDULE LIST === */}
          {phase === "list" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Your Schedules</h2>
                <Button size="sm" onClick={() => setPhase("upload-select")}>
                  <Plus className="mr-1 h-4 w-4" /> New Schedule
                </Button>
              </div>

              {loadingSchedules ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[1, 2].map((i) => (
                    <Card key={i} className="border-border/50">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <Skeleton className="h-5 w-32" />
                          <Skeleton className="h-4 w-4 rounded" />
                        </div>
                        <Skeleton className="mt-1 h-3 w-24" />
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-5 w-16 rounded-full" />
                          <Skeleton className="h-5 w-12 rounded-full" />
                          <Skeleton className="h-5 w-10 rounded-full" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : schedules.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-16 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <Calendar className="h-7 w-7 text-primary/70" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">No schedules yet</h3>
                  <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
                    Upload a photo of your class schedule and let Schedly extract your timetable automatically.
                  </p>
                  <Button className="mt-5" onClick={() => setPhase("upload-select")}>
                    <Camera className="mr-2 h-4 w-4" /> Upload Schedule
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {schedules.map((schedule) => (
                    <Card
                      key={schedule.id}
                      className="cursor-pointer transition-colors hover:border-primary/50"
                      onClick={() => handleViewSchedule(schedule.id)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base">{schedule.title}</CardTitle>
                          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                        </div>
                        {(schedule.semester || schedule.academicYear) && (
                          <p className="text-xs text-muted-foreground">
                            {[schedule.semester, schedule.academicYear].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {schedule.classes.length} class{schedule.classes.length !== 1 ? "es" : ""}
                          </Badge>
                          {schedule.classes.slice(0, 3).map((cls) => (
                            <Badge key={cls.id} variant="outline" className="text-[10px]" style={{ borderColor: cls.color + "60", color: cls.color }}>
                              {cls.code || cls.subject}
                            </Badge>
                          ))}
                          {schedule.classes.length > 3 && (
                            <Badge variant="outline" className="text-[10px]">+{schedule.classes.length - 3}</Badge>
                          )}
                        </div>
                        <div className="mt-3 flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); handleDeleteSchedule(schedule.id); }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
