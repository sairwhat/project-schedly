"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserSchedules } from "@/app/(dashboard)/schedule/actions";
import { updateAllReminderMinutes } from "@/app/(dashboard)/reminders/actions";
import { Button } from "@/components/ui/button";
import { HeaderBack } from "@/components/header-back";
import { NotificationBell } from "@/components/notification-bell";
import { ClassRemindersToggle } from "@/components/class-reminders-toggle";
import { Info, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

const MINUTE_OPTIONS = [5, 10, 15, 30, 60];

type ExampleClass = {
  subject: string;
  code?: string | null;
  shortName?: string | null;
  startTime: string | Date;
};

function fmtTime(value: string | Date): string {
  const d = new Date(value);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function notifyTime(value: string | Date, minutes: number): string {
  const d = new Date(value);
  d.setUTCMinutes(d.getUTCMinutes() - minutes);
  return fmtTime(d);
}

/** Shown right after a schedule is saved — pick how many minutes before each
 *  class the notification should fire, then Continue to the dashboard. */
export default function ReminderSetupPage() {
  const router = useRouter();
  const [minutes, setMinutes] = useState(15);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exampleClass, setExampleClass] = useState<ExampleClass | null>(null);

  useEffect(() => {
    let active = true;
    getUserSchedules()
      .then((schedules) => {
        if (!active) return;
        const classes = (schedules ?? []).flatMap((s) => s.classes);
        const c = classes[0];
        if (c) {
          setExampleClass({
            subject: c.subject,
            code: c.code,
            shortName: c.shortName,
            startTime: c.startTime,
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleContinue = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const res = await updateAllReminderMinutes(minutes);
    if (!res.success) {
      setError(res.error);
      setSaving(false);
      return;
    }
    router.push("/dashboard");
  };

  const exampleLabel = exampleClass
    ? exampleClass.shortName?.trim() ||
      exampleClass.code?.trim() ||
      exampleClass.subject
    : null;

  return (
    <div className="mx-auto max-w-2xl pt-8 md:pt-0">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
        <div className="flex items-start gap-3">
          <HeaderBack to="/schedule" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Remind Me Before Class
            </h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              Your schedule is saved! Choose how early you want a notification
              before every class.
            </p>
          </div>
        </div>
        <NotificationBell variant="inline" className="hidden md:flex" />
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Push alerts
          </p>
          <ClassRemindersToggle />
        </div>

        <div className="rounded-2xl border border-border/30 bg-card/30 p-5">
          <p className="text-sm font-semibold text-foreground">
            How early should we remind you?
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {MINUTE_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMinutes(m)}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 rounded-xl border px-3 py-3 transition-colors",
                  minutes === m
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/40 bg-card text-muted-foreground hover:border-border/80 hover:text-foreground"
                )}
              >
                {minutes === m && (
                  <Check className="absolute right-1.5 top-1.5 h-3.5 w-3.5" />
                )}
                <span className="text-lg font-bold leading-none">{m}</span>
                <span className="text-[11px]">min</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {minutes === 15
              ? "Recommended — the sweet spot before class starts."
              : `You'll get a push alert ${minutes} minutes before every class.`}
          </p>
        </div>

        {exampleLabel && exampleClass && (
          <p className="flex items-start gap-1.5 rounded-xl border border-border/40 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Example: your {exampleLabel} class at {fmtTime(exampleClass.startTime)} will
            notify you at {notifyTime(exampleClass.startTime, minutes)}.
          </p>
        )}

        {error && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <Button onClick={handleContinue} disabled={saving} className="w-full">
          {saving ? (
            <>
              <Spinner size={16} color="var(--primary-foreground)" /> Saving...
            </>
          ) : (
            <>Continue</>
          )}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          You can change this anytime in Settings &rarr; Support.
        </p>
      </div>
    </div>
  );
}