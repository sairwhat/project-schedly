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
  day: aiDayEnum,
  day_confidence: z.number().min(0).max(1).optional(),
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
export function transformAiOutputToInternal(aiOutput: AiValidationResult): ExtractionResult {
  const issues = aiOutput.issues || [];

  const classes = aiOutput.classes.map((aiClass) => {
    const dayLower = aiClass.day.toLowerCase() as typeof daysOfWeek[number];

    return {
      subject: aiClass.subject,
      code: aiClass.courseCode,
      instructor: aiClass.instructor,
      room: aiClass.room,
      section: aiClass.section,
      block: aiClass.block,
      days: [dayLower],
      startTime: aiClass.startTime,
      endTime: aiClass.endTime,
      confidence: aiClass.startTime_confidence ?? aiOutput.overallConfidence ?? 1,
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
