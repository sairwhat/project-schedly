"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { loginSchema, type LoginInput } from "@/lib/validations";
import { TurnstileWidget } from "@/components/turnstile";
import { verifyCaptcha } from "@/app/actions";
import Link from "next/link";

export function LoginForm() {
  const [form, setForm] = useState<LoginInput>({ email: "", password: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof LoginInput, string>>>({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const { signIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callback") || "/schedule";

  function update(field: keyof LoginInput, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    if (serverError) setServerError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");

    const result = loginSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof LoginInput, string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof LoginInput;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);

    try {
      const captchaResult = await verifyCaptcha(turnstileToken);
      if (!captchaResult.success) {
        setServerError("Bot verification failed. Please try again.");
        setLoading(false);
        return;
      }

      const signInResult = await signIn(result.data);

      if (signInResult.error) {
        const msg = signInResult.error.message || "";
        if (msg.includes("locked") || msg.includes("too many")) {
          setServerError("Account temporarily locked due to too many failed attempts. Please try again later.");
        } else if (msg.includes("Invalid") || msg.includes("invalid")) {
          setServerError("Invalid email or password.");
        } else {
          setServerError(msg || "Sign in failed. Please try again.");
        }
        setLoading(false);
        return;
      }

      router.push(callbackUrl);
    } catch (err) {
      console.error("[LoginForm] Unexpected error:", err);
      setServerError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <Card className="border-border/50 shadow-lg shadow-primary/5">
      <CardHeader className="space-y-1 pb-6">
        <CardTitle className="text-2xl font-bold tracking-tight">Welcome back</CardTitle>
        <p className="text-sm text-muted-foreground">
          Sign in to your Schedly account
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              aria-invalid={!!errors.email}
              autoComplete="email"
              className="h-11"
            />
            {errors.email && (
              <p className="text-xs text-destructive mt-1">{errors.email}</p>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              aria-invalid={!!errors.password}
              autoComplete="current-password"
              className="h-11"
            />
            {errors.password && (
              <p className="text-xs text-destructive mt-1">{errors.password}</p>
            )}
          </div>
          {serverError && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">{serverError}</p>
            </div>
          )}
          <div className="flex justify-center">
            <TurnstileWidget onToken={setTurnstileToken} />
          </div>
          <Button type="submit" className="w-full h-11 font-medium" disabled={loading}>
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                Signing in...
              </span>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
        <div className="mt-6 pt-6 border-t border-border/50 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium text-primary hover:text-primary/80 transition-colors">
            Sign up
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
