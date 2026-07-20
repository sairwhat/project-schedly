import type { DayOfWeek } from "@/generated/prisma/client";

/**
 * Authoritative academic day-abbreviation mapping.
 *
 * This is the SINGLE SOURCE OF TRUTH for day parsing. The AI model may
 * misread combinations (e.g. it has historically expanded "TF" as
 * Tuesday+Thursday), so expansion is done here in code, not by the model.
 *
 * Standard academic notation:
 *   M   = Monday
 *   T   = Tuesday
 *   W   = Wednesday
 *   TH  = Thursday
 *   F   = Friday
 *   S   = Saturday
 *   SU  = Sunday
 *
 * Combined codes concatenate single-day letters, with TH/SA/SU treated as
 * two-character tokens before single-character tokens:
 *   MW   = Monday, Wednesday
 *   TF   = Tuesday, Friday          <-- NOT Tuesday+Thursday
 *   TTH  = Tuesday, Thursday
 *   MWF  = Monday, Wednesday, Friday
 */

const SINGLE_TOKENS: Record<string, DayOfWeek> = {
  M: "monday",
  T: "tuesday",
  W: "wednesday",
  TH: "thursday",
  F: "friday",
  S: "saturday",
  U: "sunday",
};

// Two-character tokens must be matched before single-character ones.
const TWO_CHAR_TOKENS: Record<string, DayOfWeek> = {
  TH: "thursday",
  SA: "saturday",
  SU: "sunday",
};

// Friendly full-name aliases accepted on input.
const FULL_NAME_ALIASES: Record<string, DayOfWeek> = {
  monday: "monday",
  tuesday: "tuesday",
  wednesday: "wednesday",
  thursday: "thursday",
  friday: "friday",
  saturday: "saturday",
  sunday: "sunday",
  mon: "monday",
  tue: "tuesday",
  tues: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  thur: "thursday",
  fri: "friday",
  sat: "saturday",
  sun: "sunday",
};

export const DAY_ABBREVIATIONS: Record<string, DayOfWeek[]> = {
  M: ["monday"],
  T: ["tuesday"],
  W: ["wednesday"],
  TH: ["thursday"],
  F: ["friday"],
  S: ["saturday"],
  SA: ["saturday"],
  SU: ["sunday"],
  U: ["sunday"],
  MW: ["monday", "wednesday"],
  MF: ["monday", "friday"],
  TW: ["tuesday", "wednesday"],
  TF: ["tuesday", "friday"],
  TTH: ["tuesday", "thursday"],
  WF: ["wednesday", "friday"],
  WTH: ["wednesday", "thursday"],
  MTW: ["monday", "tuesday", "wednesday"],
  MWT: ["monday", "wednesday", "tuesday"],
  MWF: ["monday", "wednesday", "friday"],
  MTF: ["monday", "tuesday", "friday"],
  TWF: ["tuesday", "wednesday", "friday"],
  MWTH: ["monday", "wednesday", "thursday"],
  MTWT: ["monday", "tuesday", "wednesday", "thursday"],
  MTWHF: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  MTWTHF: ["monday", "tuesday", "wednesday", "thursday", "friday"],
};

export interface ExpandResult {
  days: DayOfWeek[];
  /** 0-1 — how confidently the input was mapped to known days */
  confidence: number;
  /** true when the input could not be mapped cleanly (needs user review) */
  uncertain: boolean;
  /** raw tokens that failed to map (if any) */
  unknowns: string[];
}

/**
 * Expand a single day code (e.g. "TF", "MWF", "TH", "Mon") into DayOfWeek[].
 */
export function expandDayCode(raw: string): ExpandResult {
  const code = raw.trim().toUpperCase();
  if (!code) {
    return { days: [], confidence: 0, uncertain: true, unknowns: [raw] };
  }

  // Direct lookup first (handles full combined codes like "MWF", "TTH").
  if (DAY_ABBREVIATIONS[code]) {
    return { days: DAY_ABBREVIATIONS[code]!, confidence: 1, uncertain: false, unknowns: [] };
  }

  // Full-name alias?
  if (FULL_NAME_ALIASES[code.toLowerCase()]) {
    return { days: [FULL_NAME_ALIASES[code.toLowerCase()]!], confidence: 1, uncertain: false, unknowns: [] };
  }

  // Greedy tokenizer for arbitrary combinations (M,T,W,TH,F,S,SU,SA).
  const tokens: DayOfWeek[] = [];
  const unknowns: string[] = [];
  let i = 0;
  let parsed = true;
  while (i < code.length) {
    const two = code.slice(i, i + 2);
    if (TWO_CHAR_TOKENS[two]) {
      tokens.push(TWO_CHAR_TOKENS[two]!);
      i += 2;
      continue;
    }
    const one = code[i]!;
    if (SINGLE_TOKENS[one]) {
      tokens.push(SINGLE_TOKENS[one]!);
      i += 1;
      continue;
    }
    // Unrecognized character.
    unknowns.push(one);
    parsed = false;
    i += 1;
  }

  // De-duplicate while preserving order.
  const seen = new Set<DayOfWeek>();
  const days: DayOfWeek[] = [];
  for (const d of tokens) {
    if (!seen.has(d)) {
      seen.add(d);
      days.push(d);
    }
  }

  if (!parsed || days.length === 0) {
    return { days, confidence: 0, uncertain: true, unknowns };
  }

  return { days, confidence: 0.9, uncertain: false, unknowns: [] };
}

/**
 * Normalize an array of day tokens (abbreviations or full names) into a
 * canonical, de-duplicated DayOfWeek[] using the authoritative mapping.
 */
export function normalizeDays(input: unknown): ExpandResult {
  if (!Array.isArray(input) || input.length === 0) {
    return { days: [], confidence: 0, uncertain: true, unknowns: [] };
  }

  const allDays: DayOfWeek[] = [];
  const unknowns: string[] = [];
  let worstConfidence = 1;
  let anyUncertain = false;

  for (const entry of input) {
    if (typeof entry !== "string" || !entry.trim()) continue;
    const res = expandDayCode(entry);
    if (res.uncertain) {
      anyUncertain = true;
      worstConfidence = Math.min(worstConfidence, res.confidence);
    }
    if (res.days.length === 0 && res.unknowns.length > 0) {
      unknowns.push(...res.unknowns);
    }
    allDays.push(...res.days);
  }

  const seen = new Set<DayOfWeek>();
  const days: DayOfWeek[] = [];
  for (const d of allDays) {
    if (!seen.has(d)) {
      seen.add(d);
      days.push(d);
    }
  }

  const uncertain = anyUncertain || days.length === 0;
  const confidence = uncertain ? worstConfidence : 1;

  return { days, confidence, uncertain, unknowns };
}
