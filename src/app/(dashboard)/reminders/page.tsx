"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Clock, CalendarDays, MapPin, Camera } from "lucide-react";
import { getUserSchedules } from "@/app/(dashboard)/schedule/actions";

type Day =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

const DAY_SHORT: Record<Day, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const DAY_FULL: Record<Day, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const DAY_KEYS: Day[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function fmtTime(value: string | Date): string {
  const d = new Date(value);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function startMinutes(value: string | Date): number {
  const d = new Date(value);
  return d.getHours() * 60 + d.getMinutes();
}

export default function RemindersPage() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<
    null | Awaited<ReturnType<typeof getUserSchedules>>
  >(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let active = true;
    getUserSchedules()
      .then((s) => {
        if (active) setSchedules(s);
      })
      .catch(() => {
        if (active) setSchedules([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const allClasses = (schedules ?? []).flatMap((s) =>
    s.classes.map((c) => ({ ...c, days: c.days as Day[] }))
  );

  const todayKey = DAY_KEYS[now.getDay()]!;

  const todays = allClasses
    .filter((c) => c.days.includes(todayKey) && new Date(c.startTime) > now)
    .sort((a, b) => startMinutes(a.startTime) - startMinutes(b.startTime));

  let visible = todays;
  let contextLabel = "Today";

  if (todays.length === 0) {
    let nextIdx = -1;
    for (let offset = 1; offset <= 7; offset++) {
      const idx = (now.getDay() + offset) % 7;
      if (allClasses.some((c) => c.days.includes(DAY_KEYS[idx]!))) {
        nextIdx = idx;
        break;
      }
    }
    const nextKey = nextIdx >= 0 ? DAY_KEYS[nextIdx]! : null;
    visible = nextKey
      ? allClasses
          .filter((c) => c.days.includes(nextKey))
          .sort((a, b) => startMinutes(a.startTime) - startMinutes(b.startTime))
      : [];
    contextLabel = nextKey ? DAY_FULL[nextKey] : "Upcoming";
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Reminders
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your next upcoming classes from your schedule.
        </p>
      </div>

      {schedules === null ? (
        <div className="space-y-3">
          <Skeleton className="h-3 w-16" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border border-border/30 bg-card/30 px-4 py-3.5">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-28" />
                <div className="flex gap-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : schedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-16 text-center">
          <Camera className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-foreground">No reminders yet</p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            Upload a photo of your class schedule and we&rsquo;ll automatically
            create a reminder for each class.
          </p>
          <Button className="mt-5" onClick={() => router.push("/schedule")}>
            <Camera className="mr-1.5 h-4 w-4" />
            Upload Schedule
          </Button>
        </div>
      ) : (
        <>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {contextLabel}
          </p>
          <div className="space-y-2">
            {visible.map((c, i) => (
              <div
                key={c.id ?? i}
                className="flex items-center gap-4 rounded-xl border border-border/30 bg-card/30 px-4 py-3.5 transition-[background-color,box-shadow] hover:shadow-sm"
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: c.color + "1f", color: c.color }}
                >
                  <Bell className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {c.code || c.subject}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {fmtTime(c.startTime)}&ndash;{fmtTime(c.endTime)}
                    </span>
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {c.days.map((d) => DAY_SHORT[d]).join(", ")}
                    </span>
                    {c.room && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {c.room}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
