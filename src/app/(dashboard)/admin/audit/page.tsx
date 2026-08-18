"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuditLogs, getAuditActions } from "../actions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { HeaderBack } from "@/components/header-back";
import { ScrollText, RefreshCw, User, Globe, TerminalSquare, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type AuditLogRow = {
  id: string;
  action: string;
  email: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
  createdAt: Date;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    username: string;
    isAdmin: boolean;
  } | null;
};

function formatAction(action: string): string {
  const words = action.replace(/[._]/g, " ").trim().split(/\s+/);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function formatTime(iso: Date): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ActorName({ log }: { log: AuditLogRow }) {
  if (log.user) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="font-medium text-foreground">
          {log.user.firstName} {log.user.lastName}
        </span>
        <span className="text-muted-foreground">@{log.user.username}</span>
        {log.user.isAdmin && (
          <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-label="Admin" />
        )}
      </span>
    );
  }
  if (log.email) {
    return <span className="text-muted-foreground">{log.email}</span>;
  }
  return <span className="text-muted-foreground">System</span>;
}

function ActionBadge({ action }: { action: string }) {
  const isAdminAction = action.startsWith("user.admin") || action.startsWith("admin.");
  return (
    <span
      title={action}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] font-medium",
        isAdminAction
          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : "bg-muted text-muted-foreground"
      )}
    >
      {formatAction(action)}
    </span>
  );
}

function LogRow({ log }: { log: AuditLogRow }) {
  return (
    <Card className="border-border/50">
      <CardContent className="space-y-2 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ActionBadge action={log.action} />
          <time className="text-xs text-muted-foreground" dateTime={new Date(log.createdAt).toISOString()}>
            {formatTime(log.createdAt)}
          </time>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
          <ActorName log={log} />
        </div>
        {log.ipAddress && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe className="h-3 w-3" />
            <span title={log.userAgent ?? undefined}>{log.ipAddress}</span>
          </div>
        )}
        {log.metadata != null && (
          <details className="group rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground select-none">
              <TerminalSquare className="h-3.5 w-3.5" />
              Details
              <span className="ml-auto text-muted-foreground/50 group-open:hidden">▸</span>
              <span className="ml-auto hidden text-muted-foreground/50 group-open:inline">▾</span>
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-background/60 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [actionFilter, setActionFilter] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const load = useCallback(
    async (background = false) => {
      if (!background) setRefreshing(true);
      try {
        const res = await getAuditLogs({ action: actionFilter || undefined });
        setLogs(res.logs);
        setNextCursor(res.nextCursor);
        setLastUpdated(new Date().toLocaleTimeString());
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load audit logs");
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    },
    [actionFilter],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [logsRes, actionsRes] = await Promise.all([
          getAuditLogs({ action: actionFilter || undefined }),
          getAuditActions(),
        ]);
        if (cancelled) return;
        setLogs(logsRes.logs);
        setNextCursor(logsRes.nextCursor);
        setActions(actionsRes.map((a) => a.action));
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load audit logs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const interval = setInterval(() => void load(true), 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [actionFilter, load]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await getAuditLogs({ action: actionFilter || undefined, cursor: nextCursor });
      setLogs((prev) => [...prev, ...res.logs]);
      setNextCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl pt-8 md:pt-0">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
        <div className="flex items-start gap-3">
          <HeaderBack to="/settings?tab=support" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Audit Logs
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Every user action and admin change — auto-refreshes every 30s.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            disabled={loading}
            className="h-9 max-w-[180px] rounded-xl border border-border/50 bg-card px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/50 disabled:opacity-60 sm:max-w-none"
            aria-label="Filter by action"
          >
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {formatAction(a)}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => void load(false)} disabled={refreshing}>
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          LIVE
        </span>
        {lastUpdated && <span>Last updated {lastUpdated}</span>}
        <span>· {logs.length} shown</span>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && logs.length === 0 && !error && (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ScrollText className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {actionFilter ? "No events match this action yet." : "No audit events yet."}
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && logs.length > 0 && (
        <div className="space-y-3">
          {logs.map((log) => (
            <LogRow key={log.id} log={log} />
          ))}

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