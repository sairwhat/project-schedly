"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { getUserSchedules } from "@/app/(dashboard)/schedule/actions";
import { SchedulePreview } from "@/features/schedule/components/schedule-preview";
import { useTodos, isToday } from "@/features/todo/use-todos";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CalendarClock,
  ListTodo,
  CheckCircle2,
  Download,
  Loader2,
  Clock,
  MapPin,
  GraduationCap,
} from "lucide-react";

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

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function toMin(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

function fmtDuration(ms: number) {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function getNextClass(classes: ClassData[]) {
  if (!classes.length) return null;
  const now = new Date();
  const nowDay = now.getDay();
  const nowMin = toMin(now);
  let best: { class: ClassData; startMs: number; endMs: number } | null = null;

  for (const c of classes) {
    for (const day of c.days) {
      const dayIdx = DAY_NAMES.indexOf(day);
      if (dayIdx < 0) continue;
      const diff = (dayIdx - nowDay + 7) % 7;
      const start = new Date(now);
      start.setDate(now.getDate() + diff);
      start.setHours(c.startTime.getHours(), c.startTime.getMinutes(), 0, 0);
      const end = new Date(now);
      end.setDate(now.getDate() + diff);
      end.setHours(c.endTime.getHours(), c.endTime.getMinutes(), 0, 0);
      if (end.getTime() <= now.getTime()) continue; // fully past
      const startMs = start.getTime() - now.getTime();
      if (best === null || startMs < best.startMs) {
        best = { class: c, startMs, endMs: end.getTime() - now.getTime() };
      }
    }
  }
  return best;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { todos } = useTodos();
  const [schedules, setSchedules] = useState<ScheduleData[] | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const firstName = (user as { firstName?: string } | null)?.firstName || "User";

  useEffect(() => {
    getUserSchedules()
      .then((data) => setSchedules(data as ScheduleData[]))
      .catch(() => setSchedules([]));
  }, []);

  const allClasses = (schedules ?? []).flatMap((s) => s.classes);
  const nextClass = getNextClass(allClasses);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysTodos = todos.filter((t) => t.dueDate === todayStr);
  const completedToday = todos.filter((t) => t.completed && t.completedAt && isToday(t.completedAt)).length;
  const activeTodos = todos.filter((t) => !t.completed).length;

  const handleDownload = async () => {
    if (!tableRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(tableRef.current, {
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        pixelRatio: 2,
        cacheBust: true,
        skipFonts: true,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "schedule.png";
      a.click();
    } catch (err) {
      console.error("Download failed", err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Here&apos;s your day at a glance.
        </p>
      </div>

      {/* At a Glance */}
      <div className="grid grid-cols-2 items-start gap-3">
        {/* Next Class */}
        <Card className="border-border/50 [--card-spacing:--spacing(5)]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Next Class
            </CardTitle>
            <CalendarClock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {schedules === null ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : nextClass ? (
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {nextClass.class.code || nextClass.class.subject}
                </p>
                <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {nextClass.class.room && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {nextClass.class.room}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {nextClass.startMs <= 0
                      ? `Happening now · ends in ${fmtDuration(nextClass.endMs)}`
                      : `Starts in ${fmtDuration(nextClass.startMs)}`}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming classes</p>
            )}
          </CardContent>
        </Card>

        {/* Today's To-Dos */}
        <Card className="border-border/50 [--card-spacing:--spacing(5)]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              To-Dos Today
            </CardTitle>
            <ListTodo className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {todaysTodos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing due today</p>
            ) : (
              <ul className="space-y-1.5">
                {todaysTodos.slice(0, 4).map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        t.completed ? "bg-green-500" : "bg-primary"
                      }`}
                    />
                    <span className={t.completed ? "line-through text-muted-foreground" : "text-foreground"}>
                      {t.text}
                    </span>
                  </li>
                ))}
                {todaysTodos.length > 4 && (
                  <li className="text-xs text-muted-foreground">
                    +{todaysTodos.length - 4} more
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card className="border-border/50 sm:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Quick Stats
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-foreground">{completedToday}</span>
              <span className="pb-1 text-xs text-muted-foreground">done today</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeTodos} task{activeTodos !== 1 ? "s" : ""} remaining
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Generated Schedule Table */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Your Schedule</h2>
          {schedules && schedules.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleDownload} disabled={downloading}>
              {downloading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
              ) : (
                <><Download className="mr-2 h-4 w-4" /> Download image</>
              )}
            </Button>
          )}
        </div>

        {schedules === null ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-16 text-center">
            <GraduationCap className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">No schedule yet</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Upload a photo of your class schedule and your timetable will appear here
              automatically.
            </p>
            <Button className="mt-5" onClick={() => (window.location.href = "/schedule")}>
              Upload Schedule
            </Button>
          </div>
        ) : (
          <div ref={tableRef}>
            <SchedulePreview classes={allClasses} filename="schedule.png" scale={0.8} />
          </div>
        )}
      </div>
    </div>
  );
}
