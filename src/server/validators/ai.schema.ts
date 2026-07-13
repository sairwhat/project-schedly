import { z } from "zod";

const daysOfWeek = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
] as const;

export const extractedClassSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  code: z.string().nullable().default(null),
  instructor: z.string().nullable().default(null),
  room: z.string().nullable().default(null),
  section: z.string().nullable().default(null),
  days: z
    .array(z.enum(daysOfWeek))
    .min(1, "At least one day is required"),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format"),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format"),
});

export const extractionResultSchema = z.object({
  classes: z.array(extractedClassSchema),
  metadata: z.object({
    totalClasses: z.number(),
    confidence: z.number().min(0).max(1),
    notes: z.string().nullable().default(null),
    error: z.string().optional(),
  }),
});

export type ExtractedClass = z.infer<typeof extractedClassSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export const saveScheduleSchema = z.object({
  title: z.string().min(1, "Schedule title is required"),
  semester: z.string().nullable().default(null),
  academicYear: z.string().nullable().default(null),
  classes: z.array(
    z.object({
      subject: z.string().min(1),
      code: z.string().nullable().default(null),
      instructor: z.string().nullable().default(null),
      room: z.string().nullable().default(null),
      section: z.string().nullable().default(null),
      days: z.array(z.enum(daysOfWeek)).min(1),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
    })
  ).min(1, "At least one class is required"),
  uploadId: z.string().optional(),
});

export type SaveScheduleInput = z.infer<typeof saveScheduleSchema>;
