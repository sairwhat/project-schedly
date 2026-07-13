"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function VerifiedSuccess() {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.href = "/schedule";
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Card className="border-border/50 shadow-lg shadow-primary/5">
      <CardHeader className="space-y-1 pb-6 text-center">
        <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100 dark:bg-green-950">
          <svg
            className="h-8 w-8 text-green-600 dark:text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">Email verified!</CardTitle>
        <p className="text-sm text-muted-foreground">
          Your email has been successfully verified.
        </p>
      </CardHeader>
      <CardContent className="text-center">
        <p className="text-sm text-muted-foreground">
          Redirecting to your schedule in{" "}
          <span className="font-semibold text-primary">{countdown}</span>...
        </p>
      </CardContent>
    </Card>
  );
}
