# Recent Work Summary

## Security Sprint (P0–P3)

### P0 — Route Protection
- Kept `proxy.ts` as the middleware file (Next.js 16 convention — named `proxy` export)
- Removed all Prisma imports from the edge runtime — runs cookie-only checks
- Auth redirects, `/` → `/dashboard` for logged-in users, public route allowlist

### P1 — Upload Validation
- **Magic byte detection** (`src/server/lib/security.ts`): `detectImageMime()` reads actual file headers (not just MIME type headers) for JPEG, PNG, GIF, WebP, BMP
- Applied to both `/api/upload` route and avatar upload in `settings/actions.ts`
- **Rate limiting**: In-memory sliding window — 10 uploads/min per user, 5 feedback submissions/min per user

### P2 — Hardening
- CSP headers: `'unsafe-eval'` dynamically removed in production builds, kept in dev
- Created `.env.example` with placeholder values
- Added security guidelines to `AGENTS.md`

### P3 — CSRF
- `validateCsrf()` checks for `x-csrf-protection: 1` custom header
- Applied to `/api/upload` and `/api/feedback` API routes
- Client-side: XHR in `use-upload.ts` and `fetch` in `feedback/page.tsx` now send the header

---

## Service/Repository Layer (Clean Architecture)

Created the entire middle layer between server actions and Prisma queries.

### `src/server/lib/errors.ts`
- `AppError` — discriminated union with 9 error codes (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `RATE_LIMITED`, `AI_PROCESSING_FAILED`, `UPLOAD_FAILED`, `INTERNAL_ERROR`)
- `Result<T>` type — `{ success: true, data: T } | { success: false, error: AppError }`
- Helper factories: `ok()`, `fail()`, `unauthorized()`, `forbidden()`, `notFound()`, `validationError()`, `conflict()`, `internalError()`

### Repositories (`src/server/repositories/`)
*Data access only — no business logic, just Prisma queries.*

| File | Key Methods |
|------|-------------|
| `user.repository.ts` | `findById`, `findAllUsers`, `countUsers`, `toggleAdmin`, `countByDateRange` |
| `schedule.repository.ts` | `findByUser`, `findActiveByUser`, `findOwnedByUser`, `create`, `update`, `delete` |
| `class.repository.ts` | `findBySchedule`, `create`, `createMany`, `update`, `delete` |
| `upload.repository.ts` | `create`, `updateStatus`, `updateAiResult`, `linkSchedule` |
| `reminder.repository.ts` | `findByUser`, `findByClass`, `create`, `findActiveDue` |
| `notification.repository.ts` | `findByUser`, `findUnreadByUser`, `countUnread`, `markAsRead`, `markAllAsRead` |
| `feedback.repository.ts` | `create`, `findByUser`, `countAll`, `updateStatus` |

### Services (`src/server/services/`)
*Business logic — orchestrate repositories, enforce rules.*

| File | Responsibility |
|------|---------------|
| `schedule.service.ts` | Create schedule + classes in a transaction with color assignment. Delete/update with ownership check. Set active schedule. |
| `class.service.ts` | CRUD with time parsing. `detectOverlaps()` finds conflicting class times across shared days. |
| `upload.service.ts` | Create uploads, `processWithAi()` calls AI service and updates upload status through its lifecycle (processing → completed/failed). |
| `ai.service.ts` | Wraps `extractScheduleFromImage()` in the `Result` pattern. Handles JSON parsing and Zod validation. |
| `reminder.service.ts` | CRUD for class reminders. `getActiveDue()` returns all active reminders for cron delivery. |
| `notification.service.ts` | CRUD, mark read/unread, count unread. |
| `feedback.service.ts` | Submit feedback + query by user. |
| `admin.service.ts` | Stats aggregation (users/schedules/uploads/feedback counts), user list, toggle admin role with self-protection. |

### Refactored Server Actions
- `schedule/actions.ts` — `saveSchedule`, `deleteSchedule`, `getSchedule`, `getUserSchedules` now call `scheduleService`
- `admin/actions.ts` — `getAdminStats`, `getUsers`, `toggleAdminRole` now call `adminService`

Both remain thin wrappers: validate session → call service → format response.
