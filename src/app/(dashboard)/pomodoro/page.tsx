"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Timer,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
} from "lucide-react";

const DEFAULTS = { focus: 25, break: 5 };

function format(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function PomodoroPage() {
  const [focusMin, setFocusMin] = useState(DEFAULTS.focus);
  const [breakMin, setBreakMin] = useState(DEFAULTS.break);
  const [phase, setPhase] = useState<"focus" | "break">("focus");
  const [secondsLeft, setSecondsLeft] = useState(DEFAULTS.focus * 60);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setSecondsLeft((phase === "focus" ? focusMin : breakMin) * 60);
    if (!running) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [running, phase, focusMin, breakMin]);

  useEffect(() => {
    if (secondsLeft === 0 && running) {
      setPhase((p) => (p === "focus" ? "break" : "focus"));
    }
  }, [secondsLeft, running]);

  const total = (phase === "focus" ? focusMin : breakMin) * 60;
  const progress = total > 0 ? (secondsLeft / total) * 100 : 0;

  const toggle = () => setRunning((r) => !r);

  const reset = () => {
    setRunning(false);
    setSecondsLeft((phase === "focus" ? focusMin : breakMin) * 60);
  };

  const skip = () => {
    setPhase((p) => (p === "focus" ? "break" : "focus"));
    setRunning(false);
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Pomodoro Timer
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Focus in sprints, then take a break.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-6 py-8">
          <div className="flex gap-2">
            <button
              onClick={() => { setRunning(false); setPhase("focus"); }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                phase === "focus"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              Focus
            </button>
            <button
              onClick={() => { setRunning(false); setPhase("break"); }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                phase === "break"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              Break
            </button>
          </div>

          <div className="relative flex h-56 w-56 items-center justify-center">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50" cy="50" r="46"
                fill="none" stroke="currentColor"
                className="text-muted/30" strokeWidth="6"
              />
              <circle
                cx="50" cy="50" r="46"
                fill="none" stroke="currentColor"
                className="text-primary transition-[stroke-dashoffset] duration-1000 ease-linear"
                strokeWidth="6" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 46}
                strokeDashoffset={(2 * Math.PI * 46) * (1 - progress / 100)}
              />
            </svg>
            <div className="text-center">
              <div className="text-5xl font-bold tabular-nums text-foreground">
                {format(secondsLeft)}
              </div>
              <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                {phase === "focus" ? "Focus session" : "Break time"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={reset} aria-label="Reset">
              <RotateCcw className="h-5 w-5" />
            </Button>
            <Button size="lg" onClick={toggle} className="w-32">
              {running ? (
                <><Pause className="mr-2 h-5 w-5" /> Pause</>
              ) : (
                <><Play className="mr-2 h-5 w-5" /> Start</>
              )}
            </Button>
            <Button variant="outline" size="icon" onClick={skip} aria-label="Skip">
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>

          <div className="grid w-full grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Focus (min)
              </label>
              <input
                type="number" min={1} max={120} value={focusMin}
                onChange={(e) => setFocusMin(Math.max(1, Number(e.target.value) || 1))}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-center text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Break (min)
              </label>
              <input
                type="number" min={1} max={60} value={breakMin}
                onChange={(e) => setBreakMin(Math.max(1, Number(e.target.value) || 1))}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-center text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
