"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function PendingContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const [resent, setResent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function resendEmail() {
    if (!email) return;
    setLoading(true);
    try {
      await authClient.sendVerificationEmail({ email });
      setResent(true);
    } catch {
      // silent
    }
    setLoading(false);
  }

  return (
    <Card className="border-border/50 shadow-lg shadow-primary/5">
      <CardHeader className="space-y-1 pb-6 text-center">
        <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <svg
            className="h-8 w-8 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
            />
          </svg>
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">Check your email</CardTitle>
        <p className="text-sm text-muted-foreground">
          We sent a verification link to{" "}
          <span className="font-medium text-foreground">{email}</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground text-center leading-relaxed">
          Click the link in the email to verify your account.
          The link expires in 24 hours.
        </p>
        {resent && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center dark:border-green-800 dark:bg-green-950">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              Verification email resent!
            </p>
          </div>
        )}
        <Button
          variant="outline"
          className="w-full h-11 font-medium"
          onClick={resendEmail}
          disabled={loading || !email}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Sending...
            </span>
          ) : (
            "Resend verification email"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPendingPage() {
  return (
    <Suspense>
      <PendingContent />
    </Suspense>
  );
}
