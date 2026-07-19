import { type NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(_request: NextRequest) {
  const contact = process.env.SECURITY_CONTACT || "https://github.com/sairwhat/project-schedly/security/advisories/new";
  const text = [
    "Contact: " + contact,
    "Policy: https://github.com/sairwhat/project-schedly/security/policy",
    "Preferred-Languages: en",
    "Canonical: https://app.schedly.shop/.well-known/security.txt",
    "Expires: " + new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  ].join("\n");

  return new NextResponse(text, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "no-store",
    },
  });
}
