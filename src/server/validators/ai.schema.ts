import { z } from "zod";

const daysOfWeek = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
] as const;

/* ===== AI Output Schema (per Architecture Doc) ===== */
const aiDayEnum = z.enum(["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]);

export const aiClassSchema = z.object({
  subject: z.string().min(1),
  subject_confidence: z.number().min(0).max(1).optional(),
  courseCode: z.string().nullable().default(null),
  courseCode_confidence: z.number().min(0).max(1).optional(),
  days: z.array(aiDayEnum).min(1),
  days_confidence: z.number().min(0).max(1).optional(),
  // Raw day abbreviations exactly as read by the model (e.g. "TF", "MWF").
  // Preferred over `days` for authoritative expansion in code.
  dayCodes: z.array(z.string()).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  startTime_confidence: z.number().min(0).max(1).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime_confidence: z.number().min(0).max(1).optional(),
  room: z.string().nullable().default(null),
  room_confidence: z.number().min(0).max(1).optional(),
  instructor: z.string().nullable().default(null),
  instructor_confidence: z.number().min(0).max(1).optional(),
  section: z.string().nullable().default(null),
  block: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
});

export const aiValidationResultSchema = z.object({
  validated: z.boolean(),
  semester: z.string().nullable().default(null),
  classes: z.array(aiClassSchema),
  issues: z.array(z.object({
    type: z.string(),
    message: z.string(),
    classIndex: z.number().optional(),
  })),
  overallConfidence: z.number().min(0).max(1),
});

export type AiClass = z.infer<typeof aiClassSchema>;
export type AiValidationResult = z.infer<typeof aiValidationResultSchema>;

/* ===== Internal Extraction Schema (app data model) ===== */
export const extractedClassSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  code: z.string().nullable().default(null),
  instructor: z.string().nullable().default(null),
  room: z.string().nullable().default(null),
  section: z.string().nullable().default(null),
  block: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
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

export const conflictSchema = z.object({
  classA: z.number(),
  classB: z.number(),
  day: z.string(),
  message: z.string(),
});

export const consistencyIssueSchema = z.object({
  type: z.string(),
  classIndex: z.number(),
  field: z.string(),
  message: z.string(),
});

export const extractionResultSchema = z.object({
  semester: z.string().nullable().default(null),
  classes: z.array(extractedClassSchema),
  metadata: z.object({
    totalClasses: z.number(),
    confidence: z.number().min(0).max(1),
    notes: z.string().nullable().default(null),
    error: z.string().optional(),
    issues: z.array(z.object({
      type: z.string(),
      message: z.string(),
      classIndex: z.number().optional(),
    })).optional(),
    consistencyScore: z.number().min(0).max(1).optional(),
    hasConflicts: z.boolean().optional(),
    conflicts: z.array(conflictSchema).optional(),
    consistencyIssues: z.array(consistencyIssueSchema).optional(),
  }),
});

export type ExtractedClass = z.infer<typeof extractedClassSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

/* ===== Save Schedule Schema (unchanged, uses internal format) ===== */
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
      block: z.string().nullable().default(null),
      notes: z.string().nullable().default(null),
      days: z.array(z.enum(daysOfWeek)).min(1),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
    })
  ).min(1, "At least one class is required"),
  uploadId: z.string().optional(),
});

export type SaveScheduleInput = z.infer<typeof saveScheduleSchema>;

/* ===== Transform AI output → Internal format ===== */
import { normalizeDays } from "@/server/lib/day-mapping";

export function transformAiOutputToInternal(aiOutput: AiValidationResult): ExtractionResult {
  const issues = aiOutput.issues || [];

  const classes = aiOutput.classes.map((aiClass) => {
    // Authoritative day expansion: prefer raw dayCodes, fall back to expanded days.
    const normalized = normalizeDays(aiClass.dayCodes && aiClass.dayCodes.length > 0 ? aiClass.dayCodes : aiClass.days);
    const days = normalized.days as typeof daysOfWeek[number][];

    // Confidence must reflect parsing certainty of day abbreviations.
    const dayConfidence = normalized.uncertain ? Math.min(normalized.confidence, 0.5) : (aiClass.days_confidence ?? 1);
    const baseConfidence = aiClass.startTime_confidence ?? aiOutput.overallConfidence ?? 1;
    const confidence = normalized.uncertain ? Math.min(baseConfidence, dayConfidence) : baseConfidence;

    return {
      subject: aiClass.subject,
      code: aiClass.courseCode,
      instructor: aiClass.instructor,
      room: aiClass.room,
      section: aiClass.section,
      block: aiClass.block,
      days,
      startTime: aiClass.startTime,
      endTime: aiClass.endTime,
      confidence,
      notes: aiClass.notes,
    };
  });

  return {
    semester: aiOutput.semester,
    classes,
    metadata: {
      totalClasses: classes.length,
      confidence: aiOutput.overallConfidence,
      notes: null,
      issues,
    },
  };
}
