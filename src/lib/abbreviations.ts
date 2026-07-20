/**
 * Deterministic subject abbreviation generator.
 *
 * Produces compact, readable labels for timetable cells while keeping the full
 * subject name in the database. Rules:
 *
 *  - If a manual short name exists, it is used verbatim.
 *  - Stopwords (to, in, the, of, a, an, and, for, with) are de-emphasized.
 *  - >= 3 significant words  -> initials (e.g. "Understanding the Self" -> "UTS",
 *    "Mathematics in the Modern World" -> "MMW").
 *  - <= 2 significant words  -> readable abbreviation (first word kept/abbreviated,
 *    stopwords kept, longer words truncated with "."):
 *    "Introduction to Computing" -> "Intro to Comp",
 *    "Fundamentals of Programming" -> "Fund. Prog.".
 *  - Single significant word -> kept whole if short, else truncated (e.g.
 *    "Chemistry" -> "Chem.", "English" -> "English", "Programming 2" -> "Prog. 2").
 *
 * The result is stable for a given subject, so the same class always renders
 * with the same label across the app.
 */

const STOPWORDS = new Set([
  "to", "in", "the", "of", "a", "an", "and", "for", "with", "on", "ii", "iii", "iv",
]);

function isStopword(w: string): boolean {
  return STOPWORDS.has(w.toLowerCase());
}

function abbreviateWord(word: string): string {
  const w = word.trim();
  if (!w) return "";
  if (w.length <= 4) return w;
  // Keep internal capitals when present (e.g. "McGraw") — fall back to first 4.
  const upper = w.match(/[A-Z]/g);
  if (upper && upper.length > 1) {
    return w.slice(0, 5).trim() + ".";
  }
  return w.slice(0, 4) + ".";
}

export function generateShortName(subject: string | null | undefined): string {
  if (!subject || !subject.trim()) return "";
  const raw = subject.trim().replace(/\s+/g, " ");
  const words = raw.split(" ");

  const significant = words.filter((w) => !isStopword(w) && w.trim() !== "");
  const sigCount = significant.length;

  if (sigCount === 0) {
    // All stopwords — just truncate the whole thing.
    return raw.length <= 12 ? raw : raw.slice(0, 11) + ".";
  }

  if (sigCount >= 3) {
    // Acronym from significant words' first letters.
    return significant
      .map((w) => w[0]!.toUpperCase())
      .join("");
  }

  if (sigCount === 1) {
    const only = significant[0]!;
    // Keep a trailing number/label (e.g. "Programming 2").
    const numMatch = only.match(/^(.*?)(\s*\d+.*)$/);
    if (numMatch) {
      const base = numMatch[1]!;
      const tail = numMatch[2]!;
      return (base.length <= 5 ? base : abbreviateWord(base)) + tail;
    }
    return only.length <= 6 ? only : abbreviateWord(only);
  }

  // sigCount === 2 -> readable abbreviation, preserving stopwords in place.
  return words
    .map((w) => {
      if (isStopword(w)) return w;
      return w.length <= 4 ? w : abbreviateWord(w);
    })
    .join(" ");
}

/** Pick the display label: explicit short name -> code -> generated short name -> subject. */
export function subjectLabel(
  subject: string,
  opts?: { code?: string | null; shortName?: string | null },
): string {
  if (opts?.shortName && opts.shortName.trim()) return opts.shortName.trim();
  if (opts?.code && opts.code.trim()) return opts.code.trim();
  const gen = generateShortName(subject);
  return gen || subject;
}
