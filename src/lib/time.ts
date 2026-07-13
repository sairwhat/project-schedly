import { type DayOfWeek } from "@/generated/prisma/client";
import { DAYS_OF_WEEK } from "@/lib/constants";

export function parseTime(timeStr: string): { hours: number; minutes: number } | null {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1]!, 10);
  const minutes = parseInt(match[2]!, 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

export function timeToString(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function formatTimeRange(start: Date, end: Date): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function isCurrentClass(startTime: Date, endTime: Date): boolean {
  const now = new Date();
  return now >= startTime && now <= endTime;
}

export function isUpcomingClass(startTime: Date): boolean {
  return startTime > new Date();
}

export function getNextOccurrence(days: DayOfWeek[], startTime: Date): Date {
  const now = new Date();

  const startHour = startTime.getHours();
  const startMinute = startTime.getMinutes();

  for (let offset = 0; offset < 7; offset++) {
    const checkDate = new Date(now);
    checkDate.setDate(checkDate.getDate() + offset);
    const checkDay = DAYS_OF_WEEK[checkDate.getDay() === 0 ? 6 : checkDate.getDay() - 1];

    if (days.includes(checkDay as DayOfWeek)) {
      checkDate.setHours(startHour, startMinute, 0, 0);
      if (checkDate > now) return checkDate;
    }
  }

  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 7);
  fallback.setHours(startHour, startMinute, 0, 0);
  return fallback;
}

export function getMinutesUntil(target: Date): number {
  const now = new Date();
  return Math.round((target.getTime() - now.getTime()) / 60000);
}
