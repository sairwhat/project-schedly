"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  registerStep1Schema,
  registerStep2Schema,
  registerStep3Schema,
  type RegisterInput,
} from "@/lib/validations";
import Link from "next/link";

const TOTAL_STEPS = 3;

export function RegisterForm() {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [form, setForm] = useState<RegisterInput>({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    birthdate: "",
    sex: "",
    homeAddress: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterInput, string>>>({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const router = useRouter();

  function update(field: keyof RegisterInput, value: string) {
    let processed = value;
    if (field === "username") {
      processed = value.toLowerCase().replace(/[^a-z0-9_.]/g, "");
    }
    setForm((prev) => ({ ...prev, [field]: processed }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    if (serverError) setServerError("");
  }

  function validateStep(s: number): boolean {
    let result;
    if (s === 1) {
      result = registerStep1Schema.safeParse(form);
    } else if (s === 2) {
      result = registerStep2Schema.safeParse(form);
    } else {
      result = registerStep3Schema.safeParse(form);
    }
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof RegisterInput, string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof RegisterInput;
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    return true;
  }

  function goNext() {
    if (!validateStep(step)) return;
    setDirection("next");
    setStep((s) => s + 1);
  }

  function goPrev() {
    setDirection("prev");
    setErrors({});
    setStep((s) => s - 1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");

    if (!validateStep(3)) return;

    setLoading(true);
    const signUpResult = await signUp(form);

    if (signUpResult.error) {
      setServerError(signUpResult.error.message || "Registration failed. Please try again.");
      setLoading(false);
      return;
    }

    router.push(`/verify-email/pending?email=${encodeURIComponent(form.email)}`);
  }

  const passwordStrength = form.password
    ? [
        form.password.length >= 8,
        /[A-Z]/.test(form.password),
        /[a-z]/.test(form.password),
        /\d/.test(form.password),
      ].filter(Boolean).length
    : 0;

  const slideClass =
    direction === "next"
      ? "animate-in fade-in-0 slide-in-from-right-4"
      : "animate-in fade-in-0 slide-in-from-left-4";

  return (
    <Card className="border-border/50 shadow-lg shadow-primary/5 overflow-hidden">
      <CardHeader className="space-y-1 pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl font-bold tracking-tight">Create an account</CardTitle>
          <span className="text-xs font-medium text-muted-foreground">
            {step} / {TOTAL_STEPS}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {step === 1 && "Let's start with your basic info"}
          {step === 2 && "Tell us a bit more about yourself"}
          {step === 3 && "Set up your password"}
        </p>
        <div className="flex gap-1.5 pt-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                i < step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate>
          <div className={`${slideClass} duration-300 ease-out`}>
            {step === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="text-sm font-medium">First name</Label>
                    <Input
                      id="firstName"
                      type="text"
                      placeholder="John"
                      value={form.firstName}
                      onChange={(e) => update("firstName", e.target.value)}
                      aria-invalid={!!errors.firstName}
                      autoComplete="given-name"
                      className="h-11"
                    />
                    {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="text-sm font-medium">Last name</Label>
                    <Input
                      id="lastName"
                      type="text"
                      placeholder="Doe"
                      value={form.lastName}
                      onChange={(e) => update("lastName", e.target.value)}
                      aria-invalid={!!errors.lastName}
                      autoComplete="family-name"
                      className="h-11"
                    />
                    {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-sm font-medium">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="johndoe"
                    value={form.username}
                    onChange={(e) => update("username", e.target.value)}
                    aria-invalid={!!errors.username}
                    autoComplete="username"
                    className="h-11"
                  />
                  {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">Email</Label>
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
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="birthdate" className="text-sm font-medium">Birthdate</Label>
                  <Input
                    id="birthdate"
                    type="date"
                    value={form.birthdate}
                    onChange={(e) => update("birthdate", e.target.value)}
                    aria-invalid={!!errors.birthdate}
                    max={new Date(new Date().setFullYear(new Date().getFullYear() - 13)).toISOString().split("T")[0]}
                    className="h-11"
                  />
                  {errors.birthdate && <p className="text-xs text-destructive">{errors.birthdate}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Sex</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {["Male", "Female", "Other"].map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => update("sex", option.toLowerCase())}
                        className={`h-11 rounded-lg border text-sm font-medium transition-all ${
                          form.sex === option.toLowerCase()
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border/60 bg-card/50 text-muted-foreground hover:border-border hover:text-foreground"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  {errors.sex && <p className="text-xs text-destructive">{errors.sex}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="homeAddress" className="text-sm font-medium">Home address</Label>
                  <Input
                    id="homeAddress"
                    type="text"
                    placeholder="City, Province, Country"
                    value={form.homeAddress}
                    onChange={(e) => update("homeAddress", e.target.value)}
                    aria-invalid={!!errors.homeAddress}
                    autoComplete="street-address"
                    className="h-11"
                  />
                  {errors.homeAddress && <p className="text-xs text-destructive">{errors.homeAddress}</p>}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min 8 chars, upper, lower, number"
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    aria-invalid={!!errors.password}
                    autoComplete="new-password"
                    className="h-11"
                  />
                  {form.password && (
                    <div className="flex gap-1.5 pt-1">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-colors ${
                            i < passwordStrength
                              ? passwordStrength <= 2
                                ? "bg-destructive"
                                : passwordStrength === 3
                                  ? "bg-yellow-500"
                                  : "bg-green-500"
                              : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                  {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Repeat your password"
                    value={form.confirmPassword}
                    onChange={(e) => update("confirmPassword", e.target.value)}
                    aria-invalid={!!errors.confirmPassword}
                    autoComplete="new-password"
                    className="h-11"
                  />
                  {errors.confirmPassword && (
                    <p className="text-xs text-destructive">{errors.confirmPassword}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {serverError && (
            <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">{serverError}</p>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={goPrev}
                className="h-11 flex-1 font-medium"
              >
                Back
              </Button>
            )}
            {step < TOTAL_STEPS ? (
              <Button
                type="button"
                onClick={goNext}
                className="h-11 flex-1 font-medium"
              >
                Continue
              </Button>
            ) : (
              <Button
                type="submit"
                className="h-11 flex-1 font-medium"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Creating account...
                  </span>
                ) : (
                  "Sign up"
                )}
              </Button>
            )}
          </div>
        </form>
        <div className="mt-6 pt-6 border-t border-border/50 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:text-primary/80 transition-colors">
            Sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
