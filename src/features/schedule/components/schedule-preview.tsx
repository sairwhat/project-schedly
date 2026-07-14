"use client";

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

type Props = {
  classes: ClassData[];
  filename?: string;
};

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

export function SchedulePreview({ classes, filename = "schedule.png" }: Props) {
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

  return (
    <div className="mx-auto w-full max-w-2xl rounded-xl border border-border/60 bg-card p-4 shadow-2xl shadow-primary/5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="h-3 w-3 rounded-full bg-destructive/60" />
        <div className="h-3 w-3 rounded-full bg-yellow-400/60" />
        <div className="h-3 w-3 rounded-full bg-green-400/60" />
        <span className="ml-2 text-xs font-mono text-muted-foreground">{filename}</span>
      </div>

      <div
        className="grid gap-2 text-xs"
        style={{ gridTemplateColumns: `repeat(${activeDays.length}, minmax(0, 1fr))` }}
      >
          {activeDays.map((day) => (
            <div
              key={day}
              className="rounded-lg bg-primary/10 p-3 text-center font-semibold text-primary"
            >
              {DAY_LABELS[day]}
            </div>
          ))}

          {slots.map((slot) =>
            activeDays.map((day) => {
              const items = classesAt(day, slot);
              return (
                <div key={`${slot}-${day}`} className="min-h-[52px]">
                  {items.length === 0 ? (
                    <div className="flex h-full min-h-[52px] items-center justify-center rounded-lg bg-muted/30" />
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {items.map((c) => (
                        <div
                          key={c.id}
                          className="rounded-lg p-2 text-center"
                          style={{ backgroundColor: c.color + "1f", color: c.color }}
                        >
                          <div className="text-[11px] font-semibold leading-tight">
                            {c.code || c.subject}
                          </div>
                          <div className="opacity-80">
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
  );
}
