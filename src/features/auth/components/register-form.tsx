"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff, ChevronDown } from "lucide-react";
import {
  registerStep1Schema,
  registerStep2Schema,
  registerStep3Schema,
  type RegisterInput,
} from "@/lib/validations";
import { TurnstileWidget } from "@/components/turnstile";
import { verifyCaptcha } from "@/app/actions";
import { isPasswordBreached } from "@/lib/hibp";
import Link from "next/link";
import { Spinner } from "@/components/ui/spinner";

const TOTAL_STEPS = 3;

export function RegisterForm() {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [form, setForm] = useState<RegisterInput>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    school: "",
    course: "",
    year: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterInput, string>>>({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [breachedCount, setBreachedCount] = useState(0);
  const [checkingBreach, setCheckingBreach] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const { signUp } = useAuth();
  const router = useRouter();

  function update(field: keyof RegisterInput, value: string) {
    const processed = value;
    setForm((prev) => ({ ...prev, [field]: processed }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    if (serverError) setServerError("");
    if (field === "password") setBreachedCount(0);
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

    try {
      setCheckingBreach(true);
      const breachCount = await isPasswordBreached(form.password).catch(() => 0);
      setCheckingBreach(false);
      if (breachCount > 0) {
        setBreachedCount(breachCount);
        setLoading(false);
        return;
      }

      const captchaResult = await verifyCaptcha(turnstileToken);
      if (!captchaResult.success) {
        setServerError("Bot verification failed. Please try again.");
        toast.error("Bot verification failed. Please try again.");
        setLoading(false);
        return;
      }

      const signUpResult = await signUp(form);

      if (signUpResult.error) {
        setServerError(signUpResult.error.message || "Registration failed. Please try again.");
        toast.error("Registration failed. Please try again.");
        setLoading(false);
        return;
      }

      router.push(`/verify-email/pending?email=${encodeURIComponent(form.email)}`);
    } catch (err) {
      console.error("[RegisterForm] Unexpected error:", err);
      setServerError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const passwordStrength = form.password
    ? [
        form.password.length >= 10,
        /[A-Z]/.test(form.password),
        /[a-z]/.test(form.password),
        /\d/.test(form.password),
        /[!@#$%^&*()_\-+=<>?/{}~|]/.test(form.password),
      ].filter(Boolean).length
    : 0;

  const slideClass =
    direction === "next"
      ? "animate-in fade-in-0 slide-in-from-right-4"
      : "animate-in fade-in-0 slide-in-from-left-4";

  return (
    <Card className="border-border/50 shadow-lg shadow-primary/5 overflow-hidden">
      <CardHeader className="space-y-1 pb-4 text-center">
        <img
          src="/images/logo.jpg"
          alt=""
          aria-hidden
          className="mx-auto mb-3 h-12 w-12 rounded-xl object-cover shadow-lg shadow-primary/20"
        />
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
              className={`h-1 flex-1 rounded-full transition-[background-color] duration-300 ${
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
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <FloatingLabelInput
                      label="First name"
                      value={form.firstName}
                      onChange={(e) => update("firstName", e.target.value)}
                      aria-invalid={!!errors.firstName}
                      autoComplete="given-name"
                    />
                    {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
                  </div>
                  <div className="space-y-2">
                    <FloatingLabelInput
                      label="Last name"
                      value={form.lastName}
                      onChange={(e) => update("lastName", e.target.value)}
                      aria-invalid={!!errors.lastName}
                      autoComplete="family-name"
                    />
                    {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <FloatingLabelInput
                    label="Email"
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    aria-invalid={!!errors.email}
                    autoComplete="email"
                  />
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>
                <div className="flex justify-center">
                  <TurnstileWidget onToken={setTurnstileToken} />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <FloatingLabelInput
                    label="School"
                    value={form.school}
                    onChange={(e) => update("school", e.target.value)}
                    autoComplete="organization"
                    aria-invalid={!!errors.school}
                  />
                  {errors.school && <p className="text-xs text-destructive">{errors.school}</p>}
                </div>
                <div className="space-y-2">
                  <FloatingLabelInput
                    label="Course / Strand"
                    value={form.course}
                    onChange={(e) => update("course", e.target.value)}
                    autoComplete="off"
                    aria-invalid={!!errors.course}
                  />
                  {errors.course && <p className="text-xs text-destructive">{errors.course}</p>}
                </div>
                <div className="space-y-2">
                  <div className={`relative rounded-lg border bg-background transition-colors duration-150 focus-within:border-primary ${errors.year ? "border-destructive" : "border-input"}`}>
                    <select
                      value={form.year}
                      onChange={(e) => update("year", e.target.value)}
                      aria-label="Year Level"
                      className="h-11 w-full appearance-none bg-transparent px-3 pb-1 pt-4 text-base outline-none"
                    >
                      <option value="" disabled hidden />
                      <optgroup label="Junior High School (JHS)">
                        <option value="Grade 7 (JHS)">Grade 7</option>
                        <option value="Grade 8 (JHS)">Grade 8</option>
                        <option value="Grade 9 (JHS)">Grade 9</option>
                        <option value="Grade 10 (JHS)">Grade 10</option>
                      </optgroup>
                      <optgroup label="Senior High School (SHS)">
                        <option value="Grade 11 (SHS)">Grade 11</option>
                        <option value="Grade 12 (SHS)">Grade 12</option>
                      </optgroup>
                      <optgroup label="College">
                        <option value="1st Year">1st Year</option>
                        <option value="2nd Year">2nd Year</option>
                        <option value="3rd Year">3rd Year</option>
                        <option value="4th Year">4th Year</option>
                        <option value="5th Year">5th Year</option>
                      </optgroup>
                    </select>
                    <label
                      className={`pointer-events-none absolute left-2.5 z-[1] origin-left bg-background px-1 leading-none text-muted-foreground transition-all duration-200 ease-out ${
                        form.year
                          ? "top-[8px] scale-75 text-primary"
                          : "top-1/2 -translate-y-1/2 text-base"
                      }`}
                    >
                      Year Level
                    </label>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                  {errors.year && <p className="text-xs text-destructive">{errors.year}</p>}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <FloatingLabelInput
                    label="Password"
                    id="password"
                    type={showPasswords ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    aria-invalid={!!errors.password}
                    autoComplete="new-password"
                  />
                  {form.password && (
                    <div className="flex gap-1.5 pt-1">
                      {Array.from({ length: 5 }).map((_, i) => (
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
                  <FloatingLabelInput
                    label="Confirm password"
                    id="confirmPassword"
                    type={showPasswords ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={(e) => update("confirmPassword", e.target.value)}
                    aria-invalid={!!errors.confirmPassword}
                    autoComplete="new-password"
                  />
                  {errors.confirmPassword && (
                    <p className="text-xs text-destructive">{errors.confirmPassword}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowPasswords((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPasswords ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  {showPasswords ? "Hide passwords" : "Show passwords"}
                </button>
                {checkingBreach && (
                  <p className="text-xs text-muted-foreground">Checking password against known breaches...</p>
                )}
                {breachedCount > 0 && (
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                    <p className="text-xs text-yellow-700">
                      This password has appeared in {breachedCount.toLocaleString()} known data breaches. 
                      Using a compromised password significantly increases the risk of account takeover. 
                      Please choose a different password.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {serverError && (
            <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">{serverError}</p>
            </div>
          )}

          <div className="mt-5 flex gap-3">
            {step > 1 && (
              <Button
                type="button"
                variant="secondary"
                onClick={goPrev}
                className="h-10 flex-1 font-medium hover:bg-primary/10 hover:text-primary"
              >
                Back
              </Button>
            )}
            {step < TOTAL_STEPS ? (
              <Button
                type="button"
                variant="secondary"
                onClick={goNext}
                className="h-10 flex-1 font-medium hover:bg-primary/10 hover:text-primary"
              >
                Continue
              </Button>
            ) : (
              <Button
                type="submit"
                variant="secondary"
                className="h-10 flex-1 font-medium hover:bg-primary/10 hover:text-primary"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Spinner size={16} color="var(--secondary-foreground)" />
                    Creating account...
                  </span>
                ) : (
                  "Sign up"
                )}
              </Button>
            )}
          </div>
        </form>
        <div className="mt-4 pt-4 border-t border-border/50 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:text-primary/80 transition-colors">
            Sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
