"use client";

type ClassData = {
  id: string;
  subject: string;
  shortName: string | null;
  code: string | null;
  instructor: string | null;
  room: string | null;
  section: string | null;
  block: string | null;
  notes: string | null;
  color: string;
  startTime: Date;
  endTime: Date;
  days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
};

type Props = {
  classes: ClassData[];
  filename?: string;
  scale?: number;
  capture?: boolean;
};

function classLabel(c: ClassData): string {
  return c.shortName?.trim() || c.code?.trim() || c.subject;
}

const ALL_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const DAY_LABELS: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

function timeToMinutes(t: Date): number {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
}

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const m2 = m % 60;
  return `${String(h).padStart(2, "0")}:${String(m2).padStart(2, "0")}`;
}

function minutesTo12h(m: number): string {
  const totalH = Math.floor(m / 60);
  let h = totalH % 12;
  if (h === 0) h = 12;
  const m2 = m % 60;
  const ampm = totalH < 12 ? "AM" : "PM";
  return `${h}:${String(m2).padStart(2, "0")} ${ampm}`;
}

export function SchedulePreview({ classes, filename = "schedule.png", scale, capture }: Props) {
  const activeDays = ALL_DAYS.filter((day) => classes.some((c) => c.days.includes(day)));

  if (activeDays.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No classes scheduled
      </div>
    );
  }

  const slots = Array.from(
    new Set(classes.map((c) => timeToMinutes(c.startTime)))
  ).sort((a, b) => a - b);

  const classesAt = (day: string, slot: number) =>
    classes.filter(
      (c) =>
        c.days.includes(day as ClassData["days"][number]) &&
        timeToMinutes(c.startTime) === slot
    );

  const isCapture = capture;

  return (
    <div
      className={
        isCapture
          ? "w-full rounded-xl border border-border/60 bg-card p-8"
          : "mx-auto w-full max-w-2xl rounded-xl border border-border/60 bg-card p-3 shadow-2xl shadow-primary/5 sm:p-5"
      }
      style={
        isCapture
          ? { width: "1200px", fontFamily: "inherit" }
          : scale
          ? { zoom: scale }
          : undefined
      }
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="h-3 w-3 rounded-full bg-destructive/60" />
        <div className="h-3 w-3 rounded-full bg-yellow-400/60" />
        <div className="h-3 w-3 rounded-full bg-green-400/60" />
        <span className="ml-2 truncate text-xs font-mono text-muted-foreground">{filename}</span>
      </div>

      <div className="overflow-hidden">
        <div
          className={isCapture ? "grid min-w-[760px] gap-3" : "grid gap-1"}
          style={{ gridTemplateColumns: `repeat(${activeDays.length}, minmax(0, 1fr))` }}
        >
          {activeDays.map((day) => (
            <div
              key={day}
              className={
                isCapture
                  ? "rounded-lg bg-primary/10 p-4 text-center text-2xl font-semibold text-primary"
                  : "rounded-md bg-primary/10 p-1.5 text-center text-[11px] font-semibold text-primary sm:p-1.5 sm:text-xs"
              }
            >
              {DAY_LABELS[day]}
            </div>
          ))}

          {slots.map((slot) =>
            activeDays.map((day) => {
              const items = classesAt(day, slot);
              return (
                <div key={`${slot}-${day}`} className={isCapture ? "min-h-[120px]" : "min-h-[44px]"}>
                  {items.length === 0 ? (
                    <div className={isCapture ? "flex h-full min-h-[120px] items-center justify-center rounded-lg bg-muted/30" : "flex h-full min-h-[44px] items-center justify-center rounded-md bg-muted/30"} />
                  ) : (
                    <div className={isCapture ? "flex flex-col gap-3" : "flex flex-col gap-1"}>
                      {items.map((c) => (
                        <div
                          key={c.id}
                          className={isCapture ? "rounded-lg p-4 text-center" : "rounded-md p-1 text-center"}
                          style={{ backgroundColor: c.color + "1f", color: c.color }}
                          title={
                            !isCapture
                              ? [
                                  c.subject,
                                  c.code && `Code: ${c.code}`,
                                  c.instructor && `Instructor: ${c.instructor}`,
                                  c.room && `Room: ${c.room}`,
                                  `${minutesTo12h(timeToMinutes(c.startTime))}–${minutesTo12h(timeToMinutes(c.endTime))}`,
                                ]
                                  .filter(Boolean)
                                  .join("\n")
                              : undefined
                          }
                        >
                          <div className={isCapture ? "text-2xl font-semibold leading-tight break-words" : "text-[10px] font-semibold leading-tight break-words sm:text-[10px]"}>
                            {classLabel(c)}
                          </div>
                          <div className={isCapture ? "text-lg opacity-80 leading-tight" : "mt-0.5 text-[9px] opacity-80 leading-tight"}>
                            {minutesTo12h(timeToMinutes(c.startTime))}–
                            {minutesTo12h(timeToMinutes(c.endTime))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
