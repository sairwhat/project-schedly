"use server";

export async function verifyCaptcha(token: string): Promise<{ success: boolean }> {
  const { verifyTurnstile } = await import("@/server/lib/turnstile");
  const ok = await verifyTurnstile(token);
  return { success: ok };
}
