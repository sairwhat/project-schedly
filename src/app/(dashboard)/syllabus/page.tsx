"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Trash2,
  Save,
  ChevronDown,
  ChevronUp,
  BookOpen,
  GraduationCap,
  ClipboardList,
  FlaskConical,
  Presentation,
  Newspaper,
  PenTool,
  Calendar,
  X,
  Clock,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { HeaderAvatar } from "@/components/header-avatar";
import { NotificationBell } from "@/components/notification-bell";
import { AppNavPanel } from "@/components/app-nav-panel";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  getSyllabusUploads,
  updateSyllabusTask,
  deleteSyllabusTask,
  saveSyllabusTaskToTodo,
  saveAllSyllabusTasks,
  deleteSyllabusUpload,
  summarizeSyllabusAction,
} from "./actions";

type SyllabusTaskType = "assignment" | "exam" | "quiz" | "project" | "activity" | "reading" | "lab" | "presentation" | "other";

interface SyllabusTask {
  id: string;
  uploadId: string;
  subject: string;
  courseCode: string | null;
  taskName: string;
  taskType: SyllabusTaskType;
  importance: string;
  dueDate: Date | null;
  dateNote: string | null;
  description: string | null;
  instructor: string | null;
  reminder: boolean;
  savedToTodo: boolean;
  todoId: string | null;
}

interface SyllabusUpload {
  id: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: string;
  errorMessage: string | null;
  summary: string | null;
  summaryLanguage: string | null;
  createdAt: Date;
  tasks: SyllabusTask[];
}

interface SubjectGroup {
  subject: string;
  courseCode: string | null;
  instructor: string | null;
  tasks: SyllabusTask[];
}

const TASK_TYPE_ICONS: Record<SyllabusTaskType, React.ReactNode> = {
  assignment: <PenTool className="h-4 w-4" />,
  exam: <GraduationCap className="h-4 w-4" />,
  quiz: <ClipboardList className="h-4 w-4" />,
  project: <FlaskConical className="h-4 w-4" />,
  activity: <BookOpen className="h-4 w-4" />,
  reading: <Newspaper className="h-4 w-4" />,
  lab: <FlaskConical className="h-4 w-4" />,
  presentation: <Presentation className="h-4 w-4" />,
  other: <FileText className="h-4 w-4" />,
};

const TASK_TYPE_LABELS: Record<SyllabusTaskType, string> = {
  assignment: "Assignment",
  exam: "Exam",
  quiz: "Quiz",
  project: "Project",
  activity: "Activity",
  reading: "Reading",
  lab: "Lab",
  presentation: "Presentation",
  other: "Other",
};

const IMPORTANCE_BADGE: Record<string, { label: string; className: string }> = {
  high: {
    label: "Important",
    className: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
  medium: {
    label: "Medium",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  low: {
    label: "Minor",
    className: "bg-muted text-muted-foreground",
  },
};

function termAnchorWeek(tasks: SyllabusTask[], term: string): number | null {
  const exam = tasks.find((t) => t.taskName.toLowerCase().includes(`${term} exam`));
  const m = (exam?.dateNote ?? "").toLowerCase().match(/week\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

function taskOrderScore(task: SyllabusTask, allTasks: SyllabusTask[]): number {
  const note = (task.dateNote ?? "").toLowerCase();
  const weekMatch = note.match(/week\s*(\d+)/);
  if (weekMatch) return 100 + Number(weekMatch[1]);
  if (note.includes("midterm term")) {
    return 100 + (termAnchorWeek(allTasks, "midterm") ?? 8) + 0.5;
  }
  if (note.includes("final term")) {
    return 100 + (termAnchorWeek(allTasks, "final") ?? 20) + 0.5;
  }
  if (task.dueDate) return 300 + new Date(task.dueDate).getTime() / 86_400_000;
  if (note.includes("prelim") || note.includes("preliminary")) return 400;
  if (note.includes("midterm")) return 500;
  if (note.includes("final")) return 600;
  return 1000;
}

function groupBySubject(tasks: SyllabusTask[]): SubjectGroup[] {
  const sorted = [...tasks].sort((a, b) => {
    const sa = taskOrderScore(a, tasks);
    const sb = taskOrderScore(b, tasks);
    if (sa !== sb) return sa - sb;
    return a.taskName.localeCompare(b.taskName);
  });

  const map = new Map<string, SubjectGroup>();
  for (const task of sorted) {
    const key = task.subject.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        subject: task.subject,
        courseCode: task.courseCode,
        instructor: task.instructor,
        tasks: [],
      });
    }
    map.get(key)!.tasks.push(task);
  }
  return Array.from(map.values());
}

export default function SyllabusPage() {
  const { user: authUser, isLoading: authLoading } = useAuth();
  const isAdmin = Boolean((authUser as Record<string, unknown> | null)?.isAdmin);
  const [uploads, setUploads] = useState<SyllabusUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [polling, setPolling] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [expandedUploads, setExpandedUploads] = useState<Set<string>>(new Set());
  const [extractProgress, setExtractProgress] = useState(0);
  const [summarizing, setSummarizing] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [summaryLang, setSummaryLang] = useState<Record<string, "english" | "tagalog">>({});
  const [summaryError, setSummaryError] = useState<Record<string, string>>({});
  const [hiddenSummaries, setHiddenSummaries] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const extractStartRef = useRef<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const data = await getSyllabusUploads();
      const uploadsData = data as SyllabusUpload[];
      setUploads(uploadsData);
      // Restore saved summaries so users can hide/show them anytime — even
      // after a page reload, without calling the AI again.
      setSummaries((prev) => {
        const next = { ...prev };
        for (const u of uploadsData) {
          if (u.summary) next[u.id] = u.summary;
        }
        return next;
      });
      setSummaryLang((prev) => {
        const next = { ...prev };
        for (const u of uploadsData) {
          if (u.summaryLanguage) next[u.id] = u.summaryLanguage as "english" | "tagalog";
        }
        return next;
      });
      setExpandedUploads((prev) => {
        const next = new Set(prev);
        for (const u of uploadsData) next.add(u.id);
        return next;
      });
      const processing = uploadsData.find((u) => u.status === "processing");
      if (processing && !pollRef.current) {
        startPolling(processing.id);
      }
    } catch {
      setUploads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    loadData();
  }, [authLoading, loadData]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Fake asymptotic progress while the AI reads the syllabus — there is no
  // true percentage during extraction, so we climb from ~1% toward ~95% and
  // only hit 100% once polling reports completion.
  useEffect(() => {
    if (!polling) return;
    const origin = extractStartRef.current ?? Date.now();
    extractStartRef.current = origin;
    const tick = () => {
      const elapsedMin = (Date.now() - origin) / 60000;
      setExtractProgress(Math.round(94 * (1 - Math.exp(-elapsedMin * 0.9))));
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [polling]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("File must be an image (JPEG, PNG, GIF, WebP, BMP) or PDF");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error("File too large (max 20MB)");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/syllabus/upload", {
        method: "POST",
        body: formData,
        headers: { "x-csrf-protection": "1" },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Upload failed");
      }

      const { uploadId } = await res.json();
      toast.info("Syllabus uploaded! Extracting tasks...");
      startPolling(uploadId);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(null);
  }

  function startPolling(uploadId: string) {
    setPolling(uploadId);
    extractStartRef.current = Date.now();
    setExtractProgress(0);
    setExpandedUploads((prev) => new Set([...prev, uploadId]));
    let attempts = 0;

    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 120) {
        stopPolling();
        toast.error("Extraction timed out");
        return;
      }

      try {
        const res = await fetch(`/api/syllabus/${uploadId}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "completed" || data.status === "failed") {
          stopPolling();
          if (data.status === "completed") {
            toast.success(`Extracted ${data.tasks?.length ?? 0} tasks!`);
          } else {
            toast.error(data.errorMessage ?? "Extraction failed");
          }
          await loadData();
        }
      } catch {
        // retry
      }
    }, 2000);
  }

  async function handleSaveTask(taskId: string, data: Partial<SyllabusTask>) {
    try {
      await updateSyllabusTask(taskId, {
        subject: data.subject,
        courseCode: data.courseCode,
        taskName: data.taskName,
        taskType: data.taskType,
        importance: data.importance,
        dueDate: data.dueDate ? new Date(data.dueDate).toISOString().split("T")[0] : data.dueDate === null ? null : undefined,
        dateNote: data.dateNote,
        description: data.description,
        instructor: data.instructor,
      });
      setEditingTask(null);
      await loadData();
      toast.success("Task updated");
    } catch {
      toast.error("Failed to update task");
    }
  }

  async function handleDeleteTask(taskId: string) {
    try {
      await deleteSyllabusTask(taskId);
      await loadData();
      toast.success("Task removed");
    } catch {
      toast.error("Failed to delete task");
    }
  }

  async function handleSaveToTodo(taskId: string) {
    try {
      await saveSyllabusTaskToTodo(taskId);
      await loadData();
      toast.success("Saved to To-Do list!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function handleSaveAll(uploadId: string) {
    try {
      const result = await saveAllSyllabusTasks(uploadId);
      await loadData();
      toast.success(`Saved ${result.count} important tasks to To-Do list!`);
    } catch {
      toast.error("Failed to save tasks");
    }
  }

  async function handleSummarize(uploadId: string, language: "english" | "tagalog") {
    if (summarizing === uploadId) return;
    setSummarizing(uploadId);
    setSummaryError((p) => ({ ...p, [uploadId]: "" }));
    try {
      const result = await summarizeSyllabusAction(uploadId, language);
      setSummaries((p) => ({ ...p, [uploadId]: result.summary }));
      setSummaryLang((p) => ({ ...p, [uploadId]: language }));
      setHiddenSummaries((p) => ({ ...p, [uploadId]: false }));
      setExpandedUploads((prev) => new Set([...prev, uploadId]));
    } catch (err) {
      setSummaryError((p) => ({
        ...p,
        [uploadId]: err instanceof Error ? err.message : "Failed to summarize",
      }));
    } finally {
      setSummarizing(null);
    }
  }

  async function handleDeleteUpload(uploadId: string) {
    if (!window.confirm("Delete this syllabus and all its extracted tasks?")) return;
    try {
      await deleteSyllabusUpload(uploadId);
      await loadData();
      toast.success("Syllabus deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }

  function toggleUpload(uploadId: string) {
    setExpandedUploads((prev) => {
      const next = new Set(prev);
      if (next.has(uploadId)) next.delete(uploadId);
      else next.add(uploadId);
      return next;
    });
  }

  const totalTasks = uploads.reduce(
    (sum, u) => sum + u.tasks.filter((t) => t.importance !== "low").length,
    0
  );
  const tasksWithoutDates = uploads.reduce(
    (sum, u) => sum + u.tasks.filter((t) => t.importance !== "low" && !t.dueDate).length,
    0
  );
  const sortedUploads = [...uploads].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (authLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 pt-8 md:pt-0 md:space-y-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
          <div className="flex items-start gap-3">
            <HeaderAvatar />
            <div className="min-w-0">
              <h1 className="font-heading text-[clamp(1.5rem,1.25rem+1vw,1.875rem)] leading-tight font-bold tracking-tight text-foreground">
                Syllabus Extractor
              </h1>
              <p className="mt-1 text-sm text-muted-foreground sm:text-base">
                Upload your syllabus — Schedly extracts tasks, deadlines, and requirements.
              </p>
            </div>
          </div>
          <NotificationBell variant="inline" className="hidden md:flex" />
        </header>
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <AppNavPanel />
          <div className="min-w-0 flex-1 space-y-4 md:space-y-8">
            <div className="space-y-3">
              <Skeleton className="h-40 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto w-full max-w-6xl pt-8 md:pt-0">
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <AppNavPanel />
          <div className="min-w-0 flex-1">
            <Card className="border-border/50">
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10">
                  <AlertCircle className="h-6 w-6 text-rose-500" />
                </div>
                <h2 className="font-heading text-lg font-bold text-foreground">Access denied</h2>
                <p className="max-w-sm text-sm text-muted-foreground">
                  You need admin privileges to view the Syllabus tab.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 pt-8 md:pt-0 md:space-y-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
          <div className="flex items-start gap-3">
            <HeaderAvatar />
            <div className="min-w-0">
              <h1 className="font-heading text-[clamp(1.5rem,1.25rem+1vw,1.875rem)] leading-tight font-bold tracking-tight text-foreground">
                Syllabus Extractor
              </h1>
              <p className="mt-1 text-sm text-muted-foreground sm:text-base">
                Upload your syllabus — Schedly extracts tasks, deadlines, and requirements.
              </p>
            </div>
          </div>
          <NotificationBell variant="inline" className="hidden md:flex" />
        </header>
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <AppNavPanel />
          <div className="min-w-0 flex-1 space-y-4 md:space-y-8">
            <div className="space-y-3">
              <Skeleton className="h-40 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pt-8 md:pt-0 md:space-y-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
        <div className="flex items-start gap-3">
          <HeaderAvatar />
          <div className="min-w-0">
            <h1 className="font-heading text-[clamp(1.5rem,1.25rem+1vw,1.875rem)] leading-tight font-bold tracking-tight text-foreground">
              Syllabus Extractor
            </h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              Upload your syllabus — Schedly extracts tasks, deadlines, and requirements.
            </p>
          </div>
        </div>
        <NotificationBell variant="inline" className="hidden md:flex" />
      </header>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <AppNavPanel />

        <div className="min-w-0 flex-1 space-y-4 md:space-y-8">

      {/* Upload Area — big dashed card only when there are no syllabi yet */}
      {uploads.length === 0 ? (
        <Card className="border-border/50 mb-6">
          <CardContent className="pt-6">
            <div
              className={cn(
                "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
                uploading
                  ? "border-primary/40 bg-primary/5"
                  : "border-muted-foreground/20 hover:border-primary/40 hover:bg-muted/30 cursor-pointer"
              )}
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              {uploading ? (
                <>
                  <Spinner size={24} />
                  <p className="text-sm font-medium text-muted-foreground">Uploading syllabus...</p>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground/40" />
                  <div>
                    <p className="text-sm font-medium">Upload Syllabus</p>
                    <p className="text-xs text-muted-foreground">
                      PDF or image (JPEG, PNG, GIF, WebP, BMP) — Max 20MB
                    </p>
                  </div>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,application/pdf"
              className="hidden"
              onChange={handleFileSelect}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="mb-6 flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Spinner size={14} /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
            {uploading ? "Uploading..." : "Upload Syllabus"}
          </Button>
          <p className="text-xs text-muted-foreground">
            PDF or image (JPEG, PNG, GIF, WebP, BMP) — Max 20MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,application/pdf"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      )}

      {/* Stats */}
      {!loading && uploads.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <Card className="border-border/50">
            <CardContent className="flex items-center gap-3 py-3">
              <FileText className="h-5 w-5 text-muted-foreground/40" />
              <div>
                <p className="text-lg font-bold">{uploads.length}</p>
                <p className="text-xs text-muted-foreground">Syllabi</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="flex items-center gap-3 py-3">
              <ClipboardList className="h-5 w-5 text-muted-foreground/40" />
              <div>
                <p className="text-lg font-bold">{totalTasks}</p>
                <p className="text-xs text-muted-foreground">Tasks</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="flex items-center gap-3 py-3">
              {tasksWithoutDates > 0 ? (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              ) : (
                <Save className="h-5 w-5 text-muted-foreground/40" />
              )}
              <div>
                <p className="text-lg font-bold">{tasksWithoutDates}</p>
                <p className="text-xs text-muted-foreground">No date set</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Uploads List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : uploads.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/20" />
            <div>
              <p className="font-medium text-muted-foreground">No syllabi uploaded yet</p>
              <p className="text-xs text-muted-foreground">
                Upload your first syllabus to extract tasks and deadlines.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedUploads.map((upload) => {
            const isExpanded = expandedUploads.has(upload.id);
            const isPolling = polling === upload.id;
            // Only show IMPORTANT tasks (high/medium) — minor/low ones are
            // still extracted and saved in the DB but hidden from the list.
            const visibleTasks = upload.tasks.filter((t) => t.importance !== "low");
            const hiddenCount = upload.tasks.length - visibleTasks.length;
            const savedCount = visibleTasks.filter((t) => t.savedToTodo).length;
            const unsavedCount = visibleTasks.filter(
              (t) => !t.savedToTodo && (t.importance === "high" || t.importance === "medium")
            ).length;
            const subjectGroups = groupBySubject(visibleTasks);

            return (
              <Card key={upload.id} className="border-border/50 overflow-hidden">
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleUpload(upload.id)}
                >
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground/40" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{upload.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {visibleTasks.length} tasks · {subjectGroups.length} subject{subjectGroups.length !== 1 ? "s" : ""}
                      {savedCount > 0 && ` · ${savedCount} saved`}
                      {hiddenCount > 0 && ` · ${hiddenCount} minor task${hiddenCount !== 1 ? "s" : ""} hidden`}
                      {upload.status === "processing" && " · Extracting..."}
                      {upload.status === "failed" && " · Failed"}
                    </p>
                    {upload.status === "failed" && (
                      <p className="mt-0.5 truncate text-xs text-destructive">
                        {upload.errorMessage ?? "Extraction failed"}
                      </p>
                    )}
                  </div>
                  {upload.status === "completed" && (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  )}
                  {upload.status === "failed" && (
                    <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                  )}
                  {isPolling && <Spinner size={16} />}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 px-0 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteUpload(upload.id);
                    }}
                    aria-label="Delete syllabus"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t border-border/40 px-4 py-3">
                    {upload.status === "failed" && (
                      <p className="mb-3 text-sm text-destructive">
                        {upload.errorMessage ?? "Extraction failed"}
                      </p>
                    )}

                    {upload.status === "processing" && (
                      <div className="py-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                            <Spinner size={16} color="var(--primary)" />
                            {isPolling ? "Extracting tasks from your syllabus..." : "Still processing..."}
                          </span>
                          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                            {isPolling ? `${Math.max(1, Math.min(95, extractProgress))}%` : "..."}
                          </span>
                        </div>
                        {isPolling ? (
                          <div className="mt-2.5 relative h-2 w-full overflow-hidden rounded-full bg-primary/10">
                            <div
                              className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-200 ease-out"
                              style={{ width: `${Math.max(1, Math.min(95, extractProgress))}%` }}
                            />
                          </div>
                        ) : (
                          <div className="mt-2.5 relative h-2 w-full overflow-hidden rounded-full bg-primary/10">
                            <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary/60 animate-shimmer" />
                          </div>
                        )}
                      </div>
                    )}

                    {upload.status === "completed" && upload.tasks.length === 0 && (
                      <p className="py-4 text-sm text-muted-foreground">
                        No tasks found in this syllabus.
                      </p>
                    )}

                    {upload.status === "completed" && visibleTasks.length === 0 && upload.tasks.length > 0 && (
                      <p className="py-4 text-sm text-muted-foreground">
                        All extracted tasks are minor (low importance) and are hidden. Only important
                        tasks (high/medium) are shown in the syllabus.
                      </p>
                    )}

                    {visibleTasks.length > 0 && (
                      <>
                        <div className="mb-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveAll(upload.id)}
                            disabled={unsavedCount === 0}
                            title="Only high/medium importance tasks are added to your To-Do list"
                          >
                            <Save className="mr-1.5 h-3.5 w-3.5" />
                            Save Important to To-Do ({unsavedCount})
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSummarize(upload.id, summaryLang[upload.id] ?? "english")}
                            disabled={summarizing === upload.id}
                          >
                            {summarizing === upload.id ? (
                              <Spinner size={14} />
                            ) : (
                              <GraduationCap className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            {summarizing === upload.id ? "Summarizing..." : "Summarize"}
                          </Button>
                          <select
                            value={summaryLang[upload.id] ?? "english"}
                            onChange={(e) =>
                              setSummaryLang((p) => ({
                                ...p,
                                [upload.id]: e.target.value as "english" | "tagalog",
                              }))
                            }
                            className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-muted-foreground"
                          >
                            <option value="english">English</option>
                            <option value="tagalog">Tagalog</option>
                          </select>
                        </div>

                        {summaryError[upload.id] && (
                          <p className="mb-3 text-sm text-destructive">{summaryError[upload.id]}</p>
                        )}

                        {summaries[upload.id] && !hiddenSummaries[upload.id] && (
                          <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold">
                                <GraduationCap className="mr-1.5 inline h-4 w-4 text-primary" />
                                Syllabus Summary ({summaryLang[upload.id] ?? "english"})
                              </p>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                                onClick={() =>
                                  setHiddenSummaries((p) => ({ ...p, [upload.id]: true }))
                                }
                              >
                                <EyeOff className="mr-1 h-3 w-3" /> Hide
                              </Button>
                            </div>
                            <p className="text-sm leading-relaxed whitespace-pre-line">
                              {summaries[upload.id]}
                            </p>
                          </div>
                        )}

                        {summaries[upload.id] && hiddenSummaries[upload.id] && (
                          <div className="mb-4">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setHiddenSummaries((p) => ({ ...p, [upload.id]: false }))
                              }
                            >
                              <Eye className="mr-1 h-3 w-3" /> Show summary
                            </Button>
                          </div>
                        )}

                        {/* Grouped by subject */}
                        <div className="space-y-4">
                          {subjectGroups.map((group) => (
                            <div key={group.subject} className="rounded-xl border border-border/40 overflow-hidden">
                              {/* Subject header */}
                              <div className="flex items-center gap-3 bg-muted/40 px-4 py-2.5">
                                <BookOpen className="h-4 w-4 shrink-0 text-primary" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold">
                                    {group.subject}
                                    {group.courseCode && (
                                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                                        {group.courseCode}
                                      </span>
                                    )}
                                  </p>
                                  {group.instructor && (
                                    <p className="text-xs text-muted-foreground">
                                      {group.instructor}
                                    </p>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {group.tasks.length} task{group.tasks.length !== 1 ? "s" : ""}
                                </span>
                              </div>

                              {/* Tasks */}
                              <div className="divide-y divide-border/30">
                                {group.tasks.map((task) => (
                                  <TaskCard
                                    key={task.id}
                                    task={task}
                                    isEditing={editingTask === task.id}
                                    onEdit={() => setEditingTask(task.id)}
                                    onCancelEdit={() => setEditingTask(null)}
                                    onSave={(data) => handleSaveTask(task.id, data)}
                                    onDelete={() => handleDeleteTask(task.id)}
                                    onSaveToTodo={() => handleSaveToTodo(task.id)}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
        </div>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  isEditing,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onSaveToTodo,
}: {
  task: SyllabusTask;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (data: Partial<SyllabusTask>) => void;
  onDelete: () => void;
  onSaveToTodo: () => void;
}) {
  const [editData, setEditData] = useState({
    subject: task.subject,
    courseCode: task.courseCode ?? "",
    taskName: task.taskName,
    taskType: task.taskType,
    importance: task.importance ?? "medium",
    dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : "",
    dateNote: task.dateNote ?? "",
    description: task.description ?? "",
    instructor: task.instructor ?? "",
  });

  const typeIcon = TASK_TYPE_ICONS[task.taskType] ?? TASK_TYPE_ICONS.other;
  const typeLabel = TASK_TYPE_LABELS[task.taskType] ?? "Other";
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const hasDate = Boolean(dueDate);
  const isOverdue = dueDate && dueDate < new Date() && !task.savedToTodo;

  return (
    <div
      className={cn(
        "px-4 py-3 transition-colors",
        task.savedToTodo
          ? "bg-emerald-500/5"
          : "hover:bg-muted/20"
      )}
    >
      {isEditing ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Edit Task</p>
            <button onClick={onCancelEdit} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FloatingLabelInput
              label="Subject"
              value={editData.subject}
              onChange={(e) => setEditData((p) => ({ ...p, subject: e.target.value }))}
            />
            <FloatingLabelInput
              label="Course Code (optional)"
              value={editData.courseCode}
              onChange={(e) => setEditData((p) => ({ ...p, courseCode: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FloatingLabelInput
              label="Task Name"
              value={editData.taskName}
              onChange={(e) => setEditData((p) => ({ ...p, taskName: e.target.value }))}
            />
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Type</label>
              <select
                value={editData.taskType}
                onChange={(e) => setEditData((p) => ({ ...p, taskType: e.target.value as SyllabusTaskType }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                {Object.entries(TASK_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Importance</label>
              <select
                value={editData.importance}
                onChange={(e) => setEditData((p) => ({ ...p, importance: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="high">High — important</option>
                <option value="medium">Medium</option>
                <option value="low">Low — minor</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FloatingLabelInput
              label="Due Date (optional)"
              type="date"
              value={editData.dueDate}
              onChange={(e) => setEditData((p) => ({ ...p, dueDate: e.target.value }))}
            />
            <FloatingLabelInput
              label="Date note (e.g. Week 3)"
              value={editData.dateNote}
              onChange={(e) => setEditData((p) => ({ ...p, dateNote: e.target.value }))}
            />
          </div>
          <FloatingLabelInput
            label="Instructor (optional)"
            value={editData.instructor}
            onChange={(e) => setEditData((p) => ({ ...p, instructor: e.target.value }))}
          />
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Description (optional)</label>
            <textarea
              value={editData.description}
              onChange={(e) => setEditData((p) => ({ ...p, description: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
              rows={2}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => onSave({
                subject: editData.subject,
                courseCode: editData.courseCode || null,
                taskName: editData.taskName,
                taskType: editData.taskType as SyllabusTaskType,
                importance: editData.importance,
                dueDate: editData.dueDate ? new Date(editData.dueDate) : null,
                dateNote: editData.dateNote || null,
                description: editData.description || null,
                instructor: editData.instructor || null,
              })}
            >
              Save Changes
            </Button>
            <Button size="sm" variant="outline" onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <div className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5",
            task.savedToTodo ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
          )}>
            {typeIcon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{task.taskName}</p>
              {task.savedToTodo && (
                <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                  Saved
                </span>
              )}
            </div>

            {/* Date / Warning */}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                task.savedToTodo ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
              )}>
                {typeIcon} {typeLabel}
              </span>
              {(IMPORTANCE_BADGE[task.importance] ?? IMPORTANCE_BADGE.medium) && (
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  IMPORTANCE_BADGE[task.importance]?.className ?? IMPORTANCE_BADGE.medium!.className
                )}>
                  <AlertTriangle className="h-3 w-3" />
                  {IMPORTANCE_BADGE[task.importance]?.label ?? "Medium"}
                </span>
              )}
              {hasDate ? (
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  isOverdue
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
                )}>
                  <Calendar className="h-3 w-3" />
                  {dueDate!.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              ) : task.dateNote ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                  <AlertTriangle className="h-3 w-3" />
                  {task.dateNote}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                  <Clock className="h-3 w-3" />
                  No date set
                </span>
              )}
            </div>

            {task.description && (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{task.description}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            {!task.savedToTodo && (
              <Button size="sm" variant="ghost" onClick={onSaveToTodo} className="h-7 px-2 text-xs">
                <Save className="mr-1 h-3 w-3" /> Save
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onEdit} className="h-7 px-2 text-xs">
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
