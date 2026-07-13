import type { AppError } from "@/types";

export type { AppError, Result } from "@/types";

export class NotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor(resource: string) {
    super(`${resource} not found`);
  }
}

export class UnauthorizedError extends Error {
  readonly code = "UNAUTHORIZED";
  constructor(message = "Not authenticated") {
    super(message);
  }
}

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";
  constructor(message = "Insufficient permissions") {
    super(message);
  }
}

export class ValidationError extends Error {
  readonly code = "VALIDATION_ERROR";
  readonly details: Record<string, string[]>;
  constructor(details: Record<string, string[]>) {
    super("Validation failed");
    this.details = details;
  }
}

export class ConflictError extends Error {
  readonly code = "CONFLICT";
  constructor(message: string) {
    super(message);
  }
}

export class RateLimitError extends Error {
  readonly code = "RATE_LIMITED";
  readonly retryAfter: number;
  constructor(retryAfter: number) {
    super("Rate limited");
    this.retryAfter = retryAfter;
  }
}

export class AIProcessingError extends Error {
  readonly code = "AI_PROCESSING_FAILED";
  constructor(message: string) {
    super(message);
  }
}

export function toAppError(error: unknown): AppError {
  if (error && typeof error === "object" && "code" in error) {
    const e = error as AppError;
    return {
      code: e.code,
      message: e.message,
      details: "details" in e ? (e.details as Record<string, string[]>) : undefined,
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message: error instanceof Error ? error.message : "An unexpected error occurred",
  };
}
