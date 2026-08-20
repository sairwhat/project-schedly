"use client";

import { useEffect, useState } from "react";
import {
  isPushSupported,
  getPushState,
  pushUnsupportedReasons,
  enablePush,
  disablePush,
  isIosPwa,
  type PushErrorCode,
} from "@/lib/push";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { BellOff, BellRing, Check, Info } from "lucide-react";

/** Small pill switch — the app doesn't have a Switch component. */
function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
        checked ? "bg-primary" : "bg-muted"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <span className="absolute left-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-primary shadow-sm transition-transform duration-200">
        {checked ? <Check className="h-3 w-3" /> : null}
      </span>
    </button>
  );
}

/** Troubleshooting steps shown in the dialog when enabling class reminders
 *  (push subscription) fails on this device. */
function buildPushHelpSteps(code: PushErrorCode, iosPwa: boolean): string[] {
  if (iosPwa) {
    return [
      "Make sure Schedly was installed from your Home Screen — push alerts don't work in Safari tabs.",
      "Open iOS Settings → Schedly → Notifications and allow alerts.",
      "Come back to the app, refresh the page, and turn the toggle on again.",
    ];
  }
  if (code === "NOTIFICATION_PERMISSION_DENIED") {
    return [
      "Notifications are blocked for this site. Open your browser or phone settings and allow Schedly notifications.",
      "Then come back, refresh the page, and turn the toggle on again.",
    ];
  }
  return [
    "Refresh the page, then try the toggle again.",
    "On Android, use the Chrome app — in-app browsers (like Facebook or Messenger) block push alerts.",
    "Make sure you're online with a stable connection, then try again.",
    "If it still fails, check your browser settings and confirm notifications for Schedly aren't blocked.",
  ];
}

/** The class-reminders master toggle: "Get a push alert before every class."
 *  Lives on the Settings → Support tab. */
export function ClassRemindersToggle() {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushUpdating, setPushUpdating] = useState(false);
  const [pushBlocked, setPushBlocked] = useState(false);
  const [pushMessage, setPushMessage] = useState<{ kind: "error"; text: string } | null>(null);
  const [pushHelpOpen, setPushHelpOpen] = useState(false);
  const [pushHelp, setPushHelp] = useState<{ reason: string; steps: string[] } | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [unsupportedReasons, setUnsupportedReasons] = useState<string[]>([]);
  const [iosPwa, setIosPwa] = useState(false);

  // Check push support on mount (client-side only)
  useEffect(() => {
    setPushSupported(isPushSupported());
    setUnsupportedReasons(pushUnsupportedReasons());
    setIosPwa(isIosPwa());
  }, []);

  // Restore push subscription state — defaults to OFF unless this device is
  // actually subscribed through the current VAPID key.
  useEffect(() => {
    if (!pushSupported) return;
    let active = true;
    getPushState()
      .then((s) => {
        if (!active) return;
        if (s.kind === "granted") setPushEnabled(s.subscribed);
        if (s.kind === "denied") setPushBlocked(true);
      })
      .catch(() => {
        if (active) setPushEnabled(false);
      });
    return () => {
      active = false;
    };
  }, [pushSupported]);

  const togglePush = async () => {
    if (pushUpdating) return;
    setPushUpdating(true);
    setPushMessage(null);
    setPushBlocked(false);
    try {
      if (pushEnabled) {
        const result = await disablePush();
        if (result.ok) setPushEnabled(false);
        else setPushMessage({ kind: "error", text: result.reason });
      } else {
        const result = await enablePush();
        if (result.ok) setPushEnabled(true);
        else {
          if (result.code === "NOTIFICATION_PERMISSION_DENIED") setPushBlocked(true);
          setPushMessage({ kind: "error", text: result.reason });
          setPushHelp({ reason: result.reason, steps: buildPushHelpSteps(result.code, iosPwa) });
          setPushHelpOpen(true);
        }
      }
    } catch {
      setPushMessage({ kind: "error", text: "Something went wrong. Try again." });
    }
    setPushUpdating(false);
  };

  const handleRetryPush = () => {
    setPushHelpOpen(false);
    togglePush();
  };

  return (
    <div className="space-y-3">
      {/* Push subscription control */}
      <div
        className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-4 transition-colors ${
          pushEnabled
            ? "border-green-500/30 bg-green-500/[0.06]"
            : "border-border/30 bg-card/30"
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              pushEnabled
                ? "bg-green-500/15 text-green-600"
                : "bg-primary/10 text-primary"
            }`}
          >
            {pushEnabled ? <BellRing className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Class reminders</p>
            <p className="text-xs text-muted-foreground">
              {pushEnabled
                ? "You'll get a push alert before every class."
                : pushSupported
                  ? "Get a push alert before every class."
                  : "Push isn't supported on this browser."}
            </p>
            {!pushEnabled && !pushSupported && (
              <p className="mt-1 text-[11px] text-destructive">
                {unsupportedReasons.join(" · ")}
              </p>
            )}
          </div>
        </div>
        <Toggle
          checked={pushEnabled}
          onChange={togglePush}
          disabled={pushUpdating || !pushSupported}
          label="Toggle class reminders"
        />
      </div>

      {pushMessage && (
        <p className="flex items-start gap-1.5 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {pushMessage.text}
        </p>
      )}

      {pushBlocked && !pushEnabled && (
        <p className="flex items-start gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {iosPwa
            ? "Notifications are blocked in iOS Settings. Go to Settings → Schedly → Notifications and allow them, then toggle this back on."
            : "Notifications are blocked in your browser or device settings. Allow Schedly to send notifications there, then toggle this back on."}
        </p>
      )}

      <p className="flex items-start gap-1.5 rounded-xl border border-border/40 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Reminders fire even when the app is closed. On iPhone, push requires
        adding Schedly to your home screen first.
      </p>

      {/* Help dialog when enabling class reminders fails */}
      <Dialog open={pushHelpOpen} onOpenChange={setPushHelpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Couldn&apos;t enable class reminders</DialogTitle>
            <DialogDescription>{pushHelp?.reason}</DialogDescription>
          </DialogHeader>
          {pushHelp && (
            <ol className="space-y-3 text-xs leading-relaxed text-muted-foreground">
              {pushHelp.steps.map((step, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}
          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPushHelpOpen(false)}>
              Close
            </Button>
            <Button size="sm" onClick={handleRetryPush} disabled={pushUpdating}>
              {pushUpdating ? "Trying..." : "Try again"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}