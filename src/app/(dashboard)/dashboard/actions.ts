"use server";

import { headers } from "next/headers";
import type { ScheduleSuggestionInput } from "@/server/lib/ai";

export type AiInsightsResult =
  | { success: true; suggestions: string[] }
  | { success: false; error: string };

const AI_INSIGHTS_MAX = 10;
const AI_INSIGHTS_WINDOW_MS = 60 * 60 * 1000;

export async function getAiInsights(
  classes: ScheduleSuggestionInput[],
): Promise<AiInsightsResult> {
  const { auth } = await import("@/server/lib/auth");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  if (!Array.isArray(classes) || classes.length === 0) {
    return { success: false, error: "Add a schedule first" };
  }

  const { checkRateLimitDb } = await import("@/server/lib/security");
  const rate = await checkRateLimitDb(
    `ai-insights:${session.user.id}`,
    AI_INSIGHTS_MAX,
    AI_INSIGHTS_WINDOW_MS,
  );
  if (!rate.allowed) {
    return {
      success: false,
      error: "You've used your free insight generations for this hour. Try again later.",
    };
  }

  try {
    const { generateScheduleSuggestions } = await import("@/server/lib/ai");
    const suggestions = await generateScheduleSuggestions(classes);
    return { success: true, suggestions };
  } catch (err) {
    console.error("[AI_INSIGHTS]", err);
    return { success: false, error: "Could not generate insights. Please try again." };
  }
}
