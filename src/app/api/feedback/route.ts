import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";

const feedbackSchema = z.object({
  type: z.enum(["bug", "feedback", "question"]).default("feedback"),
  subject: z.string().max(200).optional(),
  message: z.string().min(1, "Message is required").max(5000),
  page: z.string().max(200).optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { type, subject, message, page } = parsed.data;

  try {
    const feedback = await db.feedback.create({
      data: {
        userId: session.user.id,
        type,
        subject: subject ?? null,
        message,
        page: page ?? null,
      },
    });

    return NextResponse.json({ success: true, id: feedback.id }, { status: 201 });
  } catch (err) {
    console.error("[FEEDBACK_API] Failed to save feedback:", err);
    return NextResponse.json(
      { error: "Failed to save feedback. Please try again." },
      { status: 500 }
    );
  }
}
