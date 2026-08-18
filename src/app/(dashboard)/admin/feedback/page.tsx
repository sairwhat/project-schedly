"use client";

import { useCallback, useEffect, useState } from "react";
import { getAdminFeedback, updateFeedbackStatus } from "../actions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { HeaderBack } from "@/components/header-back";
import { Inbox, RefreshCw, CheckCircle2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type FeedbackRow = {
  id: string;
  type: "bug" | "feedback" | "question";
  status: string;
  subject: string | null;
  message: string;
  page: string | null;
  createdAt: Date;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    username: string;
  } | null;
};

const TYPE_BADGES: Record<FeedbackRow["type"], { label: string; cls: string }> = {
  bug: { label: "Bug", cls: "bg-red-500/10 text-red-600" },
  feedback: { label: "Feedback", cls: "bg-sky-500/10 text-sky-600" },
  question: { label: "Question", cls: "bg-amber-500/10 text-amber-600" },
};

function formatTime(iso: Date): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminFeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      try {
        const res = await getAdminFeedback({
          status: statusFilter || undefined,
          type: typeFilter || undefined,
        });
        setFeedback(res.feedback);
        setNextCursor(res.nextCursor);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load feedback");
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, typeFilter],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getAdminFeedback({
          status: statusFilter || undefined,
          type: typeFilter || undefined,
        });
        if (cancelled) return;
        setFeedback(res.feedback);
        setNextCursor(res.nextCursor);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load feedback");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, typeFilter, load]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await getAdminFeedback({
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        cursor: nextCursor,
      });
      setFeedback((prev) => [...prev, ...res.feedback]);
      setNextCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleStatusChange(row: FeedbackRow) {
    if (updatingId) return;
    setUpdatingId(row.id);
    const next = row.status === "open" ? "resolved" : "open";
    try {
      await updateFeedbackStatus(row.id, next);
      setFeedback((prev) =>
        prev.map((f) => (f.id === row.id ? { ...f, status: next } : f))
      );
      toast.success(next === "resolved" ? "Marked as resolved." : "Reopened.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  }

  const chips = [
    { value: "", label: "All" },
    { value: "open", label: "Open" },
    { value: "resolved", label: "Resolved" },
  ];

  return (
    <div className="mx-auto max-w-5xl pt-8 md:pt-0">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
        <div className="flex items-start gap-3">
          <HeaderBack to="/settings?tab=support" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Feedback
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Everything users sent from Help &amp; Feedback.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            disabled={loading}
            className="h-9 max-w-[150px] rounded-xl border border-border/50 bg-card px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/50 disabled:opacity-60"
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            <option value="bug">Bug</option>
            <option value="feedback">Feedback</option>
            <option value="question">Question</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => void load(false)} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            onClick={() => setStatusFilter(chip.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              statusFilter === chip.value
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {chip.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{feedback.length} shown</span>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && feedback.length === 0 && !error && (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No feedback matches these filters.</p>
          </CardContent>
        </Card>
      )}

      {!loading && feedback.length > 0 && (
        <div className="space-y-3">
          {feedback.map((row) => {
            const typeBadge = TYPE_BADGES[row.type];
            const resolved = row.status === "resolved";
            return (
              <Card key={row.id} className="border-border/50">
                <CardContent className="space-y-2.5 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                          typeBadge.cls
                        )}
                      >
                        {typeBadge.label}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          resolved
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-amber-500/10 text-amber-600"
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            resolved ? "bg-emerald-500" : "bg-amber-500"
                          )}
                        />
                        {resolved ? "Resolved" : "Open"}
                      </span>
                    </div>
                    <time className="text-xs text-muted-foreground" dateTime={new Date(row.createdAt).toISOString()}>
                      {formatTime(row.createdAt)}
                    </time>
                  </div>

                  {row.subject && (
                    <p className="text-sm font-semibold text-foreground">{row.subject}</p>
                  )}
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{row.message}</p>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2.5">
                    <div className="min-w-0 text-xs text-muted-foreground">
                      {row.user ? (
                        <span className="flex flex-wrap items-center gap-x-1.5">
                          <span className="font-medium text-foreground">
                            {row.user.firstName} {row.user.lastName}
                          </span>
                          <span>@{row.user.username}</span>
                          <span className="truncate">{row.user.email}</span>
                        </span>
                      ) : (
                        <span>Unknown user</span>
                      )}
                      {row.page && <span> · {row.page}</span>}
                    </div>
                    <Button
                      variant={resolved ? "outline" : "default"}
                      size="sm"
                      className="h-8 text-xs"
                      disabled={updatingId === row.id}
                      onClick={() => handleStatusChange(row)}
                    >
                      {updatingId === row.id ? (
                        "Updating…"
                      ) : resolved ? (
                        <>
                          <RotateCcw className="mr-1 h-3 w-3" />
                          Reopen
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Resolve
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {nextCursor && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}