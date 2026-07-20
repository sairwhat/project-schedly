import { Capacitor, registerPlugin } from "@capacitor/core";

export interface WidgetClass {
  subject: string;
  shortName?: string | null;
  code?: string | null;
  color: string;
  days: string[];
  startTime: string;
  endTime: string;
  room?: string | null;
  section?: string | null;
}

export interface WidgetSchedule {
  title: string;
  classes: WidgetClass[];
}

interface WidgetDataPlugin {
  saveSchedule(payload: { payload: string }): Promise<{ success: boolean }>;
  clearSchedule(): Promise<{ success: boolean }>;
}

const WidgetData = registerPlugin<WidgetDataPlugin>("WidgetData");

function toIsoTime(date: Date): string {
  const d = new Date(date);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}:00`;
}

/** Persist the active schedule to the device so the home-screen widget can show it. */
export async function publishScheduleToWidget(schedule: {
  title: string;
  classes: Array<{
    subject: string;
    shortName?: string | null;
    code?: string | null;
    color: string;
    days: string[];
    startTime: Date;
    endTime: Date;
    room?: string | null;
    section?: string | null;
  }>;
} | null): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (!schedule) {
      await WidgetData.clearSchedule();
      return;
    }
    const payload: WidgetSchedule = {
      title: schedule.title,
      classes: schedule.classes.map((c) => ({
        subject: c.subject,
        shortName: c.shortName ?? null,
        code: c.code ?? null,
        color: c.color,
        days: c.days,
        startTime: toIsoTime(c.startTime),
        endTime: toIsoTime(c.endTime),
        room: c.room ?? null,
        section: c.section ?? null,
      })),
    };
    await WidgetData.saveSchedule({ payload: JSON.stringify(payload) });
  } catch (err) {
    console.error("[WIDGET] failed to publish schedule", err);
  }
}
