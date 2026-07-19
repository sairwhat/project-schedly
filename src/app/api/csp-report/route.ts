import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const report = await request.json();
    console.warn("[CSP_VIOLATION]", JSON.stringify(report));
  } catch {
    console.warn("[CSP_VIOLATION] Invalid report received");
  }
  return NextResponse.json({ ok: true });
}
