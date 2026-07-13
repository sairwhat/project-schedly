# Schedly - Architecture Document

> AI-powered schedule management application. Upload a photo of your class schedule, and Schedly extracts, validates, and digitizes it into an interactive timetable with reminders.

---

## Table of Contents

1. [Technology Decisions](#1-technology-decisions)
2. [Database Design](#2-database-design)
3. [Authentication](#3-authentication)
4. [File Storage](#4-file-storage)
5. [AI Processing Pipeline](#5-ai-processing-pipeline)
6. [API Design](#6-api-design)
7. [State Management](#7-state-management)
8. [UI Architecture](#8-ui-architecture)
9. [Project Structure](#9-project-structure)
10. [Code Style & Conventions](#10-code-style--conventions)
11. [Security](#11-security)
12. [Deployment](#12-deployment)
13. [Roadmap](#13-roadmap)

---

## 1. Technology Decisions

### 1.1 Frontend Framework

**Decision: Next.js 15 (App Router) + React 19**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Next.js (App Router) | Server Components, Server Actions, ISR/SSR, built-in routing, image optimization, Vercel integration | App Router learning curve, some RSC limitations | **Winner** |
| Remix | Loaders/actions pattern, progressive enhancement | Smaller ecosystem, less corporate backing, slower adoption | Rejected |
| Vite + React SPA | Full client control, simple mental model | No SSR/SEO, no server components, manual routing setup | Rejected |
| Nuxt/ Angular/ Svelte | Different ecosystems | User chose TypeScript/React | Rejected |

**Why Next.js:**
- **Server Components** reduce client JS bundle, improving initial load by 30-50% for schedule views.
- **Server Actions** eliminate boilerplate API routes for mutations (upload, save, delete).
- **Image optimization** (`next/image`) is critical for schedule photo uploads - automatic WebP conversion, lazy loading, and responsive sizing.
- **App Router** provides colocation of route, layout, loading, and error files - perfect for feature-based organization.
- **Streaming** allows progressive rendering of the timetable while AI processes in the background.
- **Edge Runtime** support enables low-latency auth middleware globally.
- **TypeScript-first** with excellent inference throughout the router.

### 1.2 Backend Architecture

**Decision: Next.js Server Actions + Route Handlers with Service Layer Pattern**

The backend lives inside the Next.js application but follows Clean Architecture principles through a service/repository layer:

```
Route Handler / Server Action
    ↓
Controller (input validation, response formatting)
    ↓
Service (business logic, orchestration)
    ↓
Repository (data access, Prisma queries)
    ↓
Database (PostgreSQL via Prisma)
```

**Why this over separate backend:**
- Eliminates network hop between frontend and backend (same process).
- Server Actions provide type-safe RPC without schema duplication.
- Reduces deployment complexity (single deploy target).
- The service layer enforces separation of concerns so business logic never leaks into route handlers.
- If we need a separate backend later (mobile app, third-party integrations), services are extractable into a standalone API because they don't depend on Next.js.

**Why NOT a separate backend (Express, Fastify, NestJS):**
- Doubles deployment and infrastructure complexity for no benefit at this scale.
- Adds network latency between frontend and backend.
- Requires separate authentication handling.
- Schema/types must be shared or duplicated across two codebases.

### 1.3 Database

**Decision: PostgreSQL (hosted on Supabase)**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| PostgreSQL | ACID, JSON/JSONB, CTEs, window functions, full-text search, row-level security, mature ecosystem | Requires schema management | **Winner** |
| MySQL | Widely used, fast reads | Weaker JSON support, no full-text search as flexible, less type safety | Rejected |
| MongoDB | Flexible schema, good for unstructured data | Poor relational queries, no ACID across documents, overkill for structured data | Rejected |
| Supabase (as platform) | Managed PostgreSQL + Auth + Storage + Realtime + RLS | Vendor coupling (mitigated by using Prisma) | Partial - host only |
| Firebase | Realtime sync, easy auth | NoSQL limitations, vendor lock-in, poor complex queries, expensive at scale | Rejected |

**Why PostgreSQL:**
- **Structured relational data**: Users have schedules, schedules have classes, classes have times and days. This is inherently relational. PostgreSQL handles this with JOINs, foreign keys, and constraints.
- **JSONB support**: The raw AI extraction result can be stored as JSONB for debugging while structured columns store parsed data. Best of both worlds.
- **Row-Level Security**: PostgreSQL RLS policies enforce that users can only query their own schedules at the database level - defense in depth.
- **Full-text search**: Future feature - search across subjects, instructors, rooms without an external search service.
- **Array types**: Days of the week can be stored as `Day[]` enum arrays natively.
- **Generated columns**: `day_of_week` can be auto-derived from `start_time`.
- **Check constraints**: Enforce `end_time > start_time` at the DB level.
- **Ecosystem**: Every ORM, every library, every tutorial supports PostgreSQL.

**Why Supabase as host (not Firebase, not self-hosted):**
- Managed PostgreSQL with zero operational overhead.
- Built-in connection pooling (Supavisor) handles serverless cold starts.
- Dashboard for debugging queries and data.
- Row-Level Security policies configured via SQL.
- Storage service included (for schedule images).
- If we outgrow Supabase, we migrate to Neon/Railway/AWS RDS - Prisma makes this trivial since it's standard PostgreSQL.

### 1.4 ORM

**Decision: Prisma**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Prisma | Type-safe, excellent migrations, great DX, schema-as-code, good Next.js integration | Query overhead for complex joins, schema file is not SQL | **Winner** |
| Drizzle | SQL-like, lighter, faster queries, better for raw SQL | Younger ecosystem, less tooling, fewer examples | Runner-up |
| TypeORM | Decorators, Active Record pattern | Poor TypeScript inference, verbose, declining community | Rejected |
| Kysely | Type-safe SQL builder, fast | No schema management, more manual work | Rejected |

**Why Prisma:**
- **Schema as single source of truth**: `schema.prisma` defines tables, relations, enums, and indexes. Migration files are auto-generated.
- **Type inference**: `Prisma.ScheduleWhereInput` gives us fully typed query filters without manual type definitions.
- **Migration safety**: `prisma migrate dev` creates reversible, reviewable SQL migrations.
- **Client generation**: `prisma generate` creates a type-safe client that catches invalid queries at compile time.
- **Ecosystem**: Largest TypeScript ORM community, most Stack Overflow answers, most library integrations.
- **Prisma Studio**: Visual database browser for debugging - invaluable during development.

**Why NOT Drizzle:**
- Drizzle is excellent but has a smaller ecosystem and less battle-tested migration system. If starting a new project today, Drizzle would be a strong contender. For a project targeting hundreds of thousands of users, Prisma's maturity and tooling win.

### 1.5 Authentication

**Decision: Better Auth**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Better Auth | Self-hosted, full control, session-based, OAuth support, framework agnostic, lightweight, TypeScript-first | Newer (less community content), self-managed infra | **Winner** |
| Clerk | Beautiful UI, easy setup, managed service | Vendor lock-in, expensive at scale ($0.02/MAU after free tier), limited customization, external dependency for auth | Rejected |
| Auth.js (NextAuth) | Widely used, Next.js integration | Buggy App Router support, limited session strategies, confusing config, Prisma adapter has issues | Rejected |
| Supabase Auth | Included with Supabase, RLS integration | Tied to Supabase ecosystem, limited customization, JWT-based (less secure than session cookies) | Rejected |
| Lucia | Lightweight, educational | Deprecated in favor of Better Auth (same author) | Rejected (superseded) |

**Why Better Auth:**
- **Self-hosted**: Auth data lives in YOUR database. No external service can go down and take your auth with it.
- **Session cookies**: Uses secure HTTP-only session cookies instead of JWTs stored in localStorage. More secure against XSS.
- **OAuth support**: Google OAuth works out of the box with a plugin. Easy to add more providers.
- **Email/password + OAuth**: Both flows supported natively.
- **TypeScript-first**: All types inferred from your schema.
- **Framework agnostic**: Works with Next.js App Router via a simple adapter.
- **No vendor lock-in**: It's a library, not a service. Your auth tables are standard PostgreSQL tables.
- **Lightweight**: Adds minimal bundle size and server overhead.
- **Modern**: Built for the Server Components era. Handles RSC, Server Actions, and middleware correctly.

**Why NOT Clerk:**
- Clerk is excellent for quick prototypes but becomes expensive and restrictive at scale. $0.02/MAU means 100K users = $2,000/month just for auth. Better Auth is free forever. Clerk also stores auth data on their servers - you can't query it directly or join it with your data.

**Why NOT Auth.js:**
- Auth.js has had persistent issues with App Router compatibility. Configuration is complex, Prisma adapter is unreliable, and the library has had breaking changes across versions. Better Auth was literally created to solve these problems (by the same developer who created Lucia).

### 1.6 File Storage

**Decision: UploadThing**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| UploadThing | Type-safe, simple API, built-in compression, progress events, free tier generous | Newer service, less global CDN than Cloudinary | **Winner** |
| Cloudinary | Powerful transforms, CDN, mature | Complex API, expensive at scale, overkill for schedule images | Runner-up |
| Supabase Storage | Included with Supabase, RLS integration | Manual implementation, less DX polish for uploads | Rejected |
| AWS S3 | Industry standard, cheapest at scale | Complex setup, IAM configuration, manual CDN (CloudFront), verbose SDK | Rejected |

**Why UploadThing:**
- **Type safety**: Upload types are inferred from your configuration. `我们的 uploadRouter` defines allowed file types and max sizes with full TypeScript support.
- **Zero config CDN**: Files served from a global CDN automatically.
- **Client-side progress**: Built-in upload progress events for the UI.
- **Server-side validation**: File type and size validated before storage.
- **Image processing**: Automatic thumbnail generation and format optimization.
- **Free tier**: 2GB storage, 10GB bandwidth/month - sufficient for development and early users.
- **Framework integration**: Official `@uploadthing/react` package with Dropzone component.

**Why NOT Cloudinary:**
- Cloudinary is powerful but overkill for schedule images. We don't need AI background removal, video transcoding, or advanced transforms. UploadThing covers our needs with 10x better DX.

**Why NOT Supabase Storage:**
- While included with Supabase, the upload API is manual and verbose. UploadThing handles the entire upload flow (client to CDN) with type safety and progress tracking out of the box.

### 1.7 State Management

**Decision: Zustand (client state) + TanStack Query (server state)**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Zustand | Minimal, no providers, easy to use, TypeScript-first | No built-in server state management | **Winner (client)** |
| TanStack Query | Server state caching, refetching, optimistic updates, pagination | Not for client-only state | **Winner (server)** |
| React Context | Built-in, no dependencies | Performance issues with frequent updates, no caching, boilerplate | Rejected as primary |
| Redux Toolkit | Powerful, DevTools, middleware | Overkill for this app, verbose, steep learning curve | Rejected |

**Why Zustand + TanStack Query:**
- **Separation of concerns**: TanStack Query handles server state (schedules, user data) with caching and synchronization. Zustand handles client state (UI state, theme, preferences).
- **No provider hell**: Zustand uses hooks, not providers. No wrapping the app in `<Provider>`.
- **TanStack Query essentials**: Stale-while-revalidate, background refetching, optimistic updates for schedule edits, infinite scroll for pagination, query invalidation on mutations.
- **Minimal bundle**: Zustand is ~1KB, TanStack Query is ~13KB. Total: ~14KB vs Redux Toolkit's ~30KB+.
- **DevTools**: Both have excellent DevTools for debugging.

### 1.8 Validation

**Decision: Zod (everywhere)**

- **API input validation**: Zod schemas validate all server inputs.
- **Form validation**: React Hook Form + Zod resolver for client-side forms.
- **AI output validation**: Zod schemas validate and parse AI extraction results.
- **Type inference**: `z.infer<typeof schema>` generates TypeScript types from schemas. Single source of truth.
- **Environment validation**: Validate `process.env` at startup with Zod.

**Why Zod over alternatives:**
- Yup: Older, slower, no `pipe`/`transform` support, worse TypeScript inference.
- Joi: Not TypeScript-first, requires separate type definitions.
- Superstruct: Less popular, smaller ecosystem.
- Valibot: Smaller bundle but less ecosystem support.

### 1.9 API Style

**Decision: Next.js Server Actions + Route Handlers**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Server Actions | Type-safe, no API routes needed for mutations, progressive enhancement | New paradigm, harder to test in isolation, not reusable by external clients | **Winner (mutations)** |
| Route Handlers | Standard HTTP endpoints, testable, reusable | More boilerplate, manual type sharing | **Winner (queries, external API)** |
| tRPC | End-to-end type safety, no schema duplication | Tight coupling, harder to extract to separate backend, adds dependency | Rejected |
| GraphQL | Flexible querying, single endpoint | Complexity, N+1 problems, schema duplication, overkill for our data model | Rejected |

**Why Server Actions + Route Handlers:**
- **Server Actions** for mutations (save schedule, update profile, delete class). No fetch calls, no API route files, full type safety, progressive enhancement (works without JS).
- **Route Handlers** for: image uploads (multipart), webhook endpoints, health checks, and any endpoint that might be consumed by external services or a future mobile app.
- **Not tRPC**: While tRPC provides excellent type safety, it tightly couples the client to the server. If we ever build a mobile app or open an API, we'd need to extract routes anyway. Server Actions + Zod gives us 90% of the type safety with full decoupling.
- **Not GraphQL**: Our data model is simple and known. GraphQL adds complexity (schema, resolvers, N+1, client caching) without benefit.

### 1.10 Deployment

**Decision: Vercel (primary)**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Vercel | Zero-config Next.js deployment, edge network, preview deploys, analytics | Vendor lock-in risk (mitigated), can be expensive at scale | **Winner** |
| Railway | Docker support, databases, cheap | No edge network, slower cold starts, manual Next.js config | Runner-up |
| Render | Free tier, simple | Slow cold starts, limited regions, no edge | Rejected |
| DigitalOcean | Affordable, full control | Requires DevOps knowledge, manual setup | Future option |
| AWS (Vercel alternative: Amplify) | Full control, scalable | Complex, expensive, DevOps overhead | Overkill for now |

**Why Vercel:**
- **First-class Next.js support**: The Next.js team maintains Vercel. Every Next.js feature works on Vercel first.
- **Edge Network**: Auth middleware runs at the edge globally. Sub-50ms auth checks.
- **Preview Deploys**: Every PR gets a unique URL for testing. Critical for reviewing schedule UI changes.
- **Serverless functions**: API routes scale to zero when not in use. Pay only for usage.
- **Analytics**: Built-in Web Vitals monitoring.
- **Environment variables**: Secure management of secrets.
- **If we outgrow Vercel**: We can deploy Next.js to any platform (Railway, AWS, Docker). No code changes needed.

### 1.11 Caching

**Decision: Multi-layer caching strategy**

| Layer | Tool | Purpose |
|-------|------|---------|
| Client | TanStack Query | Cache server responses, stale-while-revalidate |
| Server | Next.js `revalidateTag` / `revalidatePath` | ISR for schedule views |
| Database | Prisma `findMany` with `cacheStrategy` | Query result caching |
| CDN | Vercel Edge Network | Static assets, images |

- Schedule data changes infrequently (once uploaded), making it an ideal candidate for aggressive caching.
- User profile changes rarely - cache with long TTL, invalidate on mutation.
- Use `unstable_cache` (Next.js) for expensive queries like "upcoming classes" that are read frequently.

### 1.12 Logging

**Decision: Pino (server) + Sentry (errors)**

- **Pino**: Fastest Node.js logger. JSON structured logs for production. Pino transport for pretty dev output.
- **Sentry**: Error tracking with source maps, session replay, performance monitoring. Free tier covers 5K errors/month.
- **No Winston**: Winston is slower and heavier than Pino for identical functionality.

### 1.13 Error Handling

**Decision: Typed error boundaries + Result pattern**

- **Server**: Service methods return `Result<T, AppError>` types (never throw). `AppError` is a discriminated union with error codes.
- **Client**: React Error Boundaries per feature (schedule, profile, upload). Each renders a contextual fallback.
- **API routes**: Global error handler middleware converts `AppError` to HTTP responses with consistent `{ error: { code, message } }` format.
- **Zod errors**: Parsed and converted to `AppError` with field-level details.

### 1.14 Testing

**Decision: Vitest + Testing Library + Playwright**

| Layer | Tool | Why |
|-------|------|-----|
| Unit | Vitest | Fastest, Vite-native, Jest-compatible API |
| Integration | Vitest + Testing Library | Test server actions, services, repositories |
| E2E | Playwright | Cross-browser, visual regression, reliable selectors |
| API | Vitest + MSW | Mock service worker for API mocking |

- **Not Jest**: Vitest is 2-10x faster for large test suites and has native ESM/TypeScript support.
- **Not Cypress**: Playwright is faster, supports multiple browsers, and has better API testing.

### 1.15 Monitoring

**Decision: Vercel Analytics + Sentry + custom health endpoint**

- **Vercel Analytics**: Core Web Vitals (LCP, FID, CLS) out of the box.
- **Sentry**: Error tracking, performance traces, user feedback widget.
- **Health endpoint**: `GET /api/health` returns DB connection status, AI service status, storage status.
- **Future**: Add APM (Application Performance Monitoring) when scaling warrants it.

### 1.16 Environment Variables

**Decision: Zod-validated env at build time**

```typescript
// Validated once at server startup
const env = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  UPLOADTHING_SECRET: z.string(),
  UPLOADTHING_APP_ID: z.string(),
  OPENROUTER_API_KEY: z.string(),
  OPENROUTER_MODEL: z.string().default("google/gemini-2.0-flash-001"),
  SENTRY_DSN: z.string().url().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]),
}).parse(process.env);
```

- Crash on startup if required env vars are missing. Never fail silently at runtime.
- `.env.example` committed to git with placeholder values.
- `.env` and `.env.local` in `.gitignore`.

---

## 2. Database Design

### 2.1 ER Diagram

```
┌─────────────────────┐       ┌──────────────────────────┐
│       users          │       │        sessions           │
├─────────────────────┤       ├──────────────────────────┤
│ id          UUID PK │──┐    │ id          UUID PK      │
│ email       TEXT    │  │    │ expiresAt   TIMESTAMP    │
│ name        TEXT    │  │    │ token       TEXT UNIQUE   │
│ avatarUrl   TEXT    │  ├───▶│ userId      UUID FK      │
│ school      TEXT    │  │    └──────────────────────────┘
│ course      TEXT    │  │
│ year        INT     │  │    ┌──────────────────────────┐
│ timezone    TEXT    │  │    │       accounts           │
│ theme       TEXT    │  │    ├──────────────────────────┤
│ createdAt   TIMESTAMP│  │   │ id          UUID PK      │
│ updatedAt   TIMESTAMP│  │   │ userId      UUID FK ─────│──┐
└─────────────────────┘  │   │ providerId  TEXT          │  │
                         │   │ accountId   TEXT          │  │
                         │   └──────────────────────────┘  │
                         │                                   │
                         │   ┌──────────────────────────┐  │
                         │   │      schedules            │  │
                         │   ├──────────────────────────┤  │
                         │   │ id          UUID PK      │  │
                         │   │ userId      UUID FK ─────│──┘
                         │   │ title       TEXT          │
                         │   │ semester    TEXT          │
                         │   │ academicYear TEXT         │
                         │   │ isActive    BOOLEAN       │
                         │   │ createdAt   TIMESTAMP     │
                         │   │ updatedAt   TIMESTAMP     │
                         │   └───────────┬──────────────┘
                         │               │
                         │               │ 1:N
                         │               ▼
                         │   ┌──────────────────────────┐
                         │   │      classes              │
                         │   ├──────────────────────────┤
                         │   │ id          UUID PK      │
                         │   │ scheduleId  UUID FK       │
                         │   │ subject     TEXT          │
                         │   │ code        TEXT          │
                         │   │ instructor  TEXT          │
                         │   │ room        TEXT          │
                         │   │ section     TEXT          │
                         │   │ color       TEXT          │
                         │   │ startTime   TIME          │
                         │   │ endTime     TIME          │
                         │   │ days        DAY[]         │
                         │   │ createdAt   TIMESTAMP     │
                         │   │ updatedAt   TIMESTAMP     │
                         │   └───────────┬──────────────┘
                         │               │
                         │               │ 1:N
                         │               ▼
                         │   ┌──────────────────────────┐
                         │   │      reminders            │
                         │   ├──────────────────────────┤
                         │   │ id          UUID PK      │
                         │   │ classId     UUID FK       │
                         │   │ userId      UUID FK       │
                         │   │ minutesBefore INT         │
                         │   │ isActive    BOOLEAN       │
                         │   │ createdAt   TIMESTAMP     │
                         │   └───────────┬──────────────┘
                         │               │
                         │   ┌───────────┴──────────────┐
                         │   │      uploads             │
                         │   ├──────────────────────────┤
                         │   │ id          UUID PK      │
                         │   │ userId      UUID FK       │
                         │   │ scheduleId  UUID FK (opt) │
                         │   │ fileUrl     TEXT          │
                         │   │ fileName    TEXT          │
                         │   │ fileSize    INT           │
                         │   │ mimeType    TEXT          │
                         │   │ status      UPLOAD_STATUS │
                         │   │ aiResult    JSONB         │
                         │   │ errorMessage TEXT         │
                         │   │ createdAt   TIMESTAMP     │
                         │   └──────────────────────────┘
                         │
                         │   ┌──────────────────────────┐
                         │   │      notifications        │
                         │   ├──────────────────────────┤
                         │   │ id          UUID PK      │
                         │   │ userId      UUID FK       │
                         │   │ type        NOTIF_TYPE    │
                         │   │ title       TEXT          │
                         │   │ body        TEXT          │
                         │   │ read        BOOLEAN       │
                         │   │ scheduledAt TIMESTAMP     │
                         │   │ createdAt   TIMESTAMP     │
                         │   └──────────────────────────┘
```

### 2.2 Enums

```sql
CREATE TYPE day_of_week AS ENUM (
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
);

CREATE TYPE upload_status AS ENUM (
  'pending', 'uploading', 'processing', 'completed', 'failed'
);

CREATE TYPE notification_type AS ENUM (
  'class_reminder', 'schedule_update', 'system'
);
```

### 2.3 Table Definitions

#### users

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default `gen_random_uuid()` | |
| email | TEXT | UNIQUE, NOT NULL | Login identifier |
| name | TEXT | NOT NULL | Display name |
| avatarUrl | TEXT | NULLABLE | Profile picture URL |
| school | TEXT | NULLABLE | University/school name |
| course | TEXT | NULLABLE | Major/program |
| year | INTEGER | NULLABLE | Academic year (1-6) |
| timezone | TEXT | NOT NULL, default `'UTC'` | IANA timezone string |
| theme | TEXT | NOT NULL, default `'system'` | `'light'` / `'dark'` / `'system'` |
| createdAt | TIMESTAMP | NOT NULL, default `now()` | |
| updatedAt | TIMESTAMP | NOT NULL | Updated via trigger |

#### sessions

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| expiresAt | TIMESTAMP | NOT NULL | Session expiration |
| token | TEXT | UNIQUE, NOT NULL | Secure session token |
| userId | UUID | FK → users.id, NOT NULL, ON DELETE CASCADE | |

**Index**: `idx_sessions_token` on `token` for fast lookup.

**Index**: `idx_sessions_userId` on `userId` for user session management.

#### accounts (OAuth)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| userId | UUID | FK → users.id, NOT NULL, ON DELETE CASCADE | |
| providerId | TEXT | NOT NULL | e.g., `'google'` |
| accountId | TEXT | NOT NULL | Provider's user ID |

**Unique constraint**: `(providerId, accountId)` - one account per provider.

#### schedules

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| userId | UUID | FK → users.id, NOT NULL, ON DELETE CASCADE | |
| title | TEXT | NOT NULL | e.g., `'Fall 2026 Schedule'` |
| semester | TEXT | NULLABLE | e.g., `'Fall'`, `'Spring'` |
| academicYear | TEXT | NULLABLE | e.g., `'2026-2027'` |
| isActive | BOOLEAN | NOT NULL, default `true` | Only one active per user |
| createdAt | TIMESTAMP | NOT NULL, default `now()` | |
| updatedAt | TIMESTAMP | NOT NULL | |

#### classes

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| scheduleId | UUID | FK → schedules.id, NOT NULL, ON DELETE CASCADE | |
| subject | TEXT | NOT NULL | e.g., `'Calculus II'` |
| code | TEXT | NULLABLE | e.g., `'MATH 201'` |
| instructor | TEXT | NULLABLE | e.g., `'Dr. Smith'` |
| room | TEXT | NULLABLE | e.g., `'Room 301, Building A'` |
| section | TEXT | NULLABLE | e.g., `'Section 01'` |
| color | TEXT | NOT NULL, default `'#3b82f6'` | Hex color for timetable |
| startTime | TIME | NOT NULL | e.g., `'09:00'` |
| endTime | TIME | NOT NULL | e.g., `'10:30'` |
| days | day_of_week[] | NOT NULL | PostgreSQL array: `{monday,wednesday,friday}` |
| createdAt | TIMESTAMP | NOT NULL, default `now()` | |
| updatedAt | TIMESTAMP | NOT NULL | |

**Check constraint**: `endTime > startTime`

**Index**: `idx_classes_scheduleId` on `scheduleId`

#### reminders

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| classId | UUID | FK → classes.id, NOT NULL, ON DELETE CASCADE | |
| userId | UUID | FK → users.id, NOT NULL, ON DELETE CASCADE | |
| minutesBefore | INTEGER | NOT NULL, default `15` | |
| isActive | BOOLEAN | NOT NULL, default `true` | |
| createdAt | TIMESTAMP | NOT NULL, default `now()` | |

#### uploads

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| userId | UUID | FK → users.id, NOT NULL, ON DELETE CASCADE | |
| scheduleId | UUID | FK → schedules.id, NULLABLE | Set after successful processing |
| fileUrl | TEXT | NOT NULL | UploadThing CDN URL |
| fileName | TEXT | NOT NULL | Original filename |
| fileSize | INTEGER | NOT NULL | Bytes |
| mimeType | TEXT | NOT NULL | e.g., `'image/jpeg'` |
| status | upload_status | NOT NULL, default `'pending'` | Processing status |
| aiResult | JSONB | NULLABLE | Raw AI extraction for debugging |
| errorMessage | TEXT | NULLABLE | Error details if processing failed |
| createdAt | TIMESTAMP | NOT NULL, default `now()` | |

#### notifications

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| userId | UUID | FK → users.id, NOT NULL, ON DELETE CASCADE | |
| type | notification_type | NOT NULL | |
| title | TEXT | NOT NULL | |
| body | TEXT | NOT NULL | |
| read | BOOLEAN | NOT NULL, default `false` | |
| scheduledAt | TIMESTAMP | NULLABLE | For future delivery |
| createdAt | TIMESTAMP | NOT NULL, default `now()` | |

### 2.4 Key Relationships

- **users → schedules**: One-to-many. A user has many schedules (e.g., Fall 2026, Spring 2027).
- **schedules → classes**: One-to-many. A schedule contains many classes.
- **classes → reminders**: One-to-many. Each class can have multiple reminders.
- **users → reminders**: One-to-many (denormalized via `userId` on reminders for fast querying).
- **users → uploads**: One-to-many. Track all uploaded images.
- **uploads → schedules**: One-to-one (nullable). Links upload to the schedule it produced.
- **users → sessions**: One-to-many. Multiple active sessions allowed.
- **users → accounts**: One-to-many. Multiple OAuth providers.

### 2.5 Prisma Schema (excerpt)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum DayOfWeek {
  monday
  tuesday
  wednesday
  thursday
  friday
  saturday
  sunday
}

enum UploadStatus {
  pending
  uploading
  processing
  completed
  failed
}

enum NotificationType {
  class_reminder
  schedule_update
  system
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String
  avatarUrl String?  @map("avatar_url")
  school    String?
  course    String?
  year      Int?
  timezone  String   @default("UTC")
  theme     String   @default("system")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  sessions   Session[]
  accounts   Account[]
  schedules  Schedule[]
  reminders  Reminder[]
  uploads    Upload[]
  notifications Notification[]

  @@map("users")
}

model Session {
  id        String   @id
  expiresAt DateTime @map("expires_at")
  token     String   @unique
  userId    String   @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([token])
  @@index([userId])
  @@map("sessions")
}

model Account {
  id         String @id @default(uuid())
  userId     String @map("user_id")
  providerId String @map("provider_id")
  accountId  String @map("account_id")
  user       User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([providerId, accountId])
  @@map("accounts")
}

model Schedule {
  id           String   @id @default(uuid())
  userId       String   @map("user_id")
  title        String
  semester     String?
  academicYear String?  @map("academic_year")
  isActive     Boolean  @default(true) @map("is_active")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  classes  Class[]
  uploads  Upload[]

  @@index([userId])
  @@map("schedules")
}

model Class {
  id         String      @id @default(uuid())
  scheduleId String      @map("schedule_id")
  subject    String
  code       String?
  instructor String?
  room       String?
  section    String?
  color      String      @default("#3b82f6")
  startTime  DateTime    @map("start_time")
  endTime    DateTime    @map("end_time")
  days       DayOfWeek[]
  createdAt  DateTime    @default(now()) @map("created_at")
  updatedAt  DateTime    @updatedAt @map("updated_at")

  schedule  Schedule   @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  reminders Reminder[]

  @@index([scheduleId])
  @@map("classes")
}

model Reminder {
  id            String   @id @default(uuid())
  classId       String   @map("class_id")
  userId        String   @map("user_id")
  minutesBefore Int      @default(15) @map("minutes_before")
  isActive      Boolean  @default(true) @map("is_active")
  createdAt     DateTime @default(now()) @map("created_at")

  class Class @relation(fields: [classId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([classId])
  @@index([userId])
  @@map("reminders")
}

model Upload {
  id           String       @id @default(uuid())
  userId       String       @map("user_id")
  scheduleId   String?      @map("schedule_id")
  fileUrl      String       @map("file_url")
  fileName     String       @map("file_name")
  fileSize     Int          @map("file_size")
  mimeType     String       @map("mime_type")
  status       UploadStatus @default("pending")
  aiResult     Json?        @map("ai_result")
  errorMessage String?      @map("error_message")
  createdAt    DateTime     @default(now()) @map("created_at")

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  schedule Schedule? @relation(fields: [scheduleId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@map("uploads")
}

model Notification {
  id          String           @id @default(uuid())
  userId      String           @map("user_id")
  type        NotificationType
  title       String
  body        String
  read        Boolean          @default(false)
  scheduledAt DateTime?        @map("scheduled_at")
  createdAt   DateTime         @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, read])
  @@map("notifications")
}
```

---

## 3. Authentication

### 3.1 Implementation

**Better Auth** with email/password + Google OAuth.

### 3.2 Flow

```
Register:
  1. User submits email + password
  2. Server validates input (Zod)
  3. Server hashes password (bcrypt, 12 rounds)
  4. Insert user into `users` table
  5. Create session, set HTTP-only cookie
  6. Redirect to onboarding

Login:
  1. User submits email + password
  2. Server looks up user by email
  3. Server verifies password hash
  4. Create session, set HTTP-only cookie
  5. Redirect to dashboard

OAuth (Google):
  1. User clicks "Sign in with Google"
  2. Redirect to Google OAuth consent screen
  3. Google redirects back with authorization code
  4. Server exchanges code for tokens
  5. Server fetches user profile from Google
  6. Find or create user in database
  7. Find or create account link
  8. Create session, set HTTP-only cookie
  9. Redirect to dashboard

Session Management:
  - Sessions stored in `sessions` table with expiration
  - HTTP-only, Secure, SameSite=Lax cookies
  - Session refreshed on activity (sliding window)
  - Middleware checks session on every request
  - Invalid/expired sessions → redirect to login
```

### 3.3 Security Measures

- Passwords hashed with bcrypt (12 salt rounds).
- Session tokens are cryptographically random (32 bytes).
- Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
- CSRF protection via SameSite cookies + custom header validation.
- Rate limiting on auth endpoints: 5 attempts per minute per IP.
- Account lockout after 10 failed attempts.
- Email verification required before full access (optional, configurable).

### 3.4 Middleware

```typescript
// middleware.ts - runs on every request
// 1. Check if route is public (/, /login, /register, /api/auth/*)
// 2. If not public, validate session from cookie
// 3. If session invalid → redirect to /login
// 4. If valid, attach user to request context
// 5. Check route-level authorization (admin routes, etc.)
```

---

## 4. File Storage

### 4.1 UploadThing Configuration

```typescript
// Server-side router
const uploadRouter = {
  scheduleImage: f({
    image: {
      maxFileSize: "10MB",
      maxFileCount: 1,
      acceptedFileTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
    },
  })
    .middleware(async ({ req }) => {
      // Verify authentication
      const session = await getSession(req);
      if (!session) throw new UnauthenticatedError();
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // Trigger AI processing pipeline
      await processScheduleImage(metadata.userId, file.url, file.key);
    }),
};
```

### 4.2 Upload Flow

```
1. Client requests presigned URL from /api/uploadthing
2. UploadThing returns presigned URL + upload token
3. Client uploads image directly to UploadThing CDN
4. UploadThing calls onUploadComplete webhook
5. Server triggers AI processing pipeline
6. Client polls for processing status via SSE or polling
7. On completion, redirect to schedule view
```

### 4.3 Client-Side Compression

Before upload, compress images client-side to reduce upload time and bandwidth:

- Use `browser-image-compression` library.
- Target: Max 1920px on longest side, quality 0.8, output JPEG/WebP.
- Show compression progress in UI.
- Original image preserved on device until upload confirms.

---

## 5. AI Processing Pipeline

### 5.1 Overview

```
Image Upload
    ↓
[1] Storage (UploadThing CDN)
    ↓
[2] Image Download (server-side, for API call)
    ↓
[3] Pre-processing (resize, optimize for vision model)
    ↓
[4] OpenRouter Vision API call
    ↓
[5] Raw response parsing
    ↓
[6] Zod schema validation
    ↓
[7] Manual validation rules (overlap, duplicates, etc.)
    ↓
[8] Database storage (schedule + classes)
    ↓
[9] UI rendering (redirect to timetable)
```

### 5.2 OpenRouter Vision API

**Endpoint**: `https://openrouter.ai/api/v1/chat/completions`

**Model**: `google/gemini-2.0-flash-001` (fast, accurate, cost-effective for structured extraction)

**System Prompt**:

```
You are a schedule extraction AI. Analyze the provided image of a class schedule
and extract all classes into structured JSON.

For each class, extract:
- subject: The full name of the subject/course
- code: The course code (e.g., "MATH 201")
- instructor: The instructor's name
- room: The room number or location
- section: The section number or identifier
- days: Array of days ["monday", "tuesday", ...]
- startTime: 24-hour format "HH:MM"
- endTime: 24-hour format "HH:MM"

Return ONLY valid JSON in this exact format:
{
  "classes": [
    {
      "subject": "...",
      "code": "...",
      "instructor": "...",
      "room": "...",
      "section": "...",
      "days": ["monday", "wednesday", "friday"],
      "startTime": "09:00",
      "endTime": "10:30"
    }
  ],
  "metadata": {
    "totalClasses": 1,
    "confidence": 0.95,
    "notes": "Any observations about the schedule"
  }
}

Rules:
- Use lowercase for days
- Use 24-hour time format
- If a field is not visible, set it to null
- If the image is not a schedule, return {"classes": [], "metadata": {"error": "not_a_schedule"}}
- Extract ALL visible classes, even if partially visible
```

### 5.3 Response Schema (Zod)

```typescript
const extractedClassSchema = z.object({
  subject: z.string().min(1),
  code: z.string().nullable(),
  instructor: z.string().nullable(),
  room: z.string().nullable(),
  section: z.string().nullable(),
  days: z.array(z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])).min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

const extractionResultSchema = z.object({
  classes: z.array(extractedClassSchema),
  metadata: z.object({
    totalClasses: z.number(),
    confidence: z.number().min(0).max(1),
    notes: z.string().nullable(),
    error: z.string().optional(),
  }),
});
```

### 5.4 Validation Rules

After AI extraction, run validation:

| Rule | Check | Action |
|------|-------|--------|
| Overlap detection | Any two classes on the same day with overlapping times | Flag for user review |
| Invalid times | `endTime <= startTime`, times outside 00:00-23:59 | Auto-correct or flag |
| Duplicate detection | Same subject + code + section + days | Merge or flag |
| Missing fields | Required fields are null/empty | Prompt user to fill |
| Time format | Matches HH:MM regex | Reject if invalid |
| Day validity | Valid day names | Map common variations |

### 5.5 Error Handling & Retries

```
Retry strategy:
  - Attempt 1: Direct API call
  - Attempt 2: Retry after 2s (transient failures)
  - Attempt 3: Retry after 5s with exponential backoff
  - Attempt 4: Retry after 15s
  - After 4 failures: Mark upload as "failed", notify user

Error types:
  - 429 (Rate limit): Retry after Retry-After header
  - 500 (Server error): Retry with backoff
  - 400 (Bad request): Log and fail (don't retry)
  - 413 (Image too large): Compress and retry once
  - Timeout: Retry up to 3 times
  - Invalid JSON response: Retry with stricter prompt
  - Validation failure: Return partial results for user correction

Rate limiting:
  - Max 10 AI requests per user per hour
  - Max 100 AI requests per IP per hour
  - Implement token bucket algorithm
  - Return 429 with Retry-After header
```

### 5.6 Processing Status Updates

Use polling (SSE in future) to update client on processing status:

```
pending → uploading → processing → validating → completed
                                              → failed
```

Each status transition updates the `uploads.status` field and can be polled by the client.

### 5.7 AI Cost Management

- **Model choice**: `google/gemini-2.0-flash-001` is fast and cheap (~$0.0001/image).
- **Image optimization**: Compress before sending to reduce token count.
- **Caching**: If same image is uploaded twice, return cached result.
- **Daily limits**: 50 free AI processing per user per day (configurable).
- **Budget alerts**: Track API spend, alert at $50/month.

---

## 6. API Design

### 6.1 Server Actions (Mutations)

```typescript
// actions/schedule.actions.ts
"use server";

export async function createSchedule(input: CreateScheduleInput) {
  // 1. Validate session
  // 2. Validate input with Zod
  // 3. Call ScheduleService.create()
  // 4. Return Result<Schedule, AppError>
}

export async function updateSchedule(id: string, input: UpdateScheduleInput) { ... }
export async function deleteSchedule(id: string) { ... }
export async function setActiveSchedule(id: string) { ... }

export async function updateClass(id: string, input: UpdateClassInput) { ... }
export async function deleteClass(id: string) { ... }
export async function reorderClasses(scheduleId: string, classIds: string[]) { ... }

export async function updateProfile(input: UpdateProfileInput) { ... }
export async function updateTheme(theme: "light" | "dark" | "system") { ... }
```

### 6.2 Route Handlers (Queries, External)

```typescript
// app/api/uploadthing/route.ts       → UploadThing webhook handler
// app/api/health/route.ts            → GET /api/health
// app/api/schedules/[id]/route.ts    → GET /api/schedules/:id (for external use)
// app/api/schedules/[id]/classes/route.ts → GET /api/schedules/:id/classes
// app/api/notifications/route.ts     → GET /api/notifications
```

### 6.3 Response Format

All API responses follow a consistent format:

```typescript
// Success
{ data: T }

// Error
{ error: { code: string; message: string; details?: Record<string, string[]> } }
```

### 6.4 Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid input |
| `CONFLICT` | 409 | Resource conflict (duplicate) |
| `RATE_LIMITED` | 429 | Too many requests |
| `AI_PROCESSING_FAILED` | 500 | AI service error |
| `UPLOAD_FAILED` | 500 | File upload error |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## 7. State Management

### 7.1 Server State (TanStack Query)

```typescript
// Hooks for server data
useSchedule(scheduleId)          // GET schedule with classes
useActiveSchedule()              // GET user's active schedule
useSchedules()                   // GET all user schedules
useNotifications()               // GET user notifications
useUpload(uploadId)              // GET upload status (for polling)
useUpcomingClasses()             // GET next N classes from now
```

**Query keys**: Structured as arrays for automatic invalidation:
```
["schedules"]
["schedules", scheduleId]
["schedules", scheduleId, "classes"]
["notifications"]
["uploads", uploadId]
```

**Mutations**: Invalidate relevant queries on success:
```
createSchedule  → invalidate ["schedules"]
updateClass     → invalidate ["schedules", scheduleId]
deleteSchedule  → invalidate ["schedules"], redirect to /
```

### 7.2 Client State (Zustand)

```typescript
// stores/ui.store.ts
interface UIStore {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

// stores/timetable.store.ts
interface TimetableStore {
  viewMode: "week" | "day";
  selectedDay: DayOfWeek;
  setViewMode: (mode: "week" | "day") => void;
  setSelectedDay: (day: DayOfWeek) => void;
}
```

### 7.3 Why NOT Redux

Redux Toolkit is excellent for complex apps with deeply nested state and many interacting reducers. Schedly's client state is minimal (UI preferences, view mode). Redux would add ~25KB of bundle for state we could manage in 5 lines of Zustand. TanStack Query handles all the complex state (server data caching, optimistic updates, refetching).

---

## 8. UI Architecture

### 8.1 Component Library

**Decision: shadcn/ui + Tailwind CSS**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| shadcn/ui | Copy-paste components, full control, Tailwind-native, accessible, customizable | Not a package (components live in your codebase), requires manual updates | **Winner** |
| Radix UI + Tailhead | Headless, accessible | Requires building every component from scratch | Partial - shadcn uses Radix |
| MUI (Material UI) | Comprehensive, ready-to-use | Heavy bundle (~300KB), opinionated styling, hard to customize | Rejected |
| Chakra UI | Good DX, accessible | Performance issues, heavy, declining adoption | Rejected |
| Ant Design | Enterprise features | Heavy, opinionated, not Tailwind-native | Rejected |

**Why shadcn/ui:**
- **Components are yours**: Copy into your project. Full control. No dependency updates breaking your UI.
- **Based on Radix UI**: Every component is accessible (WAI-ARIA compliant) out of the box.
- **Tailwind CSS native**: All styling via Tailwind. No CSS-in-JS overhead.
- **Bundle size**: Only the components you copy. No unused code.
- **Customizable**: Modify any component to match your design system.
- **Beautiful defaults**: Professional design that looks great without customization.

### 8.2 Styling

**Tailwind CSS v4** with a custom design token system:

```css
/* app/globals.css */
@theme {
  --color-primary: oklch(0.5 0.2 250);
  --color-background: oklch(0.98 0 0);
  --color-foreground: oklch(0.15 0 0);
  /* Subject colors for timetable */
  --color-subject-1: oklch(0.7 0.15 250);  /* Blue */
  --color-subject-2: oklch(0.7 0.15 150);  /* Green */
  --color-subject-3: oklch(0.7 0.15 30);   /* Orange */
  --color-subject-4: oklch(0.7 0.15 330);  /* Pink */
  --color-subject-5: oklch(0.7 0.15 80);   /* Yellow */
  --color-subject-6: oklch(0.7 0.15 280);  /* Purple */
}
```

### 8.3 Animations

**Decision: Framer Motion + Tailwind CSS animations**

- **Framer Motion**: Page transitions, modal animations, list reordering, timetable cell hover effects.
- **Tailwind `animate-*`**: Simple animations (fade-in, slide-up, spin for loading).
- **Not CSS animations**: Framer Motion provides gesture support, layout animations, and AnimatePresence for mount/unmount.

### 8.4 Charts

**Decision: Recharts** (when study analytics is built)

- Lightweight, React-native, SVG-based.
- Good for simple charts (bar, line, pie).
- Alternatives considered: Victory (too heavy), Chart.js (not React-native).

### 8.5 Icons

**Decision: Lucide React**

- Consistent design language.
- Tree-shakeable (import only used icons).
- Used by shadcn/ui natively.
- 1500+ icons covering all needs.

### 8.6 Responsive Design

**Breakpoint strategy (Tailwind defaults):**

| Breakpoint | Width | Target |
|------------|-------|--------|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablet |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Large desktop |
| `2xl` | 1536px | Ultra-wide |

**Timetable responsive behavior:**
- **Mobile**: Day view only. Swipe between days. Classes stacked vertically.
- **Tablet**: Week view with compact cards. Scroll horizontally.
- **Desktop**: Full week view. Side panel for class details.
- **Ultra-wide**: Week view + sidebar with upcoming classes.

### 8.7 Dark Mode

- System preference detection via `prefers-color-scheme`.
- Manual toggle in settings (stored in user profile + localStorage).
- Theme applied via CSS variables on `<html>` element.
- All components use semantic colors (`bg-background`, `text-foreground`), not hard-coded values.
- Tailwind `dark:` prefix for dark-specific overrides.

### 8.8 Accessibility

- **Keyboard navigation**: Full timetable navigation via arrow keys.
- **Screen readers**: ARIA labels on all interactive elements. Timetable uses `role="grid"`.
- **Focus management**: Visible focus rings, logical tab order.
- **Color contrast**: WCAG AA minimum for all text.
- **Reduced motion**: Respect `prefers-reduced-motion` - disable animations.
- **Alt text**: Schedule images have descriptive alt text.
- **Semantic HTML**: `<nav>`, `<main>`, `<header>`, `<section>`, `<article>`.

---

## 9. Project Structure

```
project-schedly/
├── prisma/
│   ├── schema.prisma              # Database schema
│   ├── seed.ts                    # Seed script (dev data)
│   └── migrations/                # Auto-generated migrations
│
├── public/
│   ├── favicon.ico
│   └── og-image.png               # Open Graph image
│
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── (auth)/                # Route group: auth pages (no layout)
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── register/
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx         # Auth layout (centered card)
│   │   │
│   │   ├── (dashboard)/           # Route group: authenticated pages
│   │   │   ├── schedule/
│   │   │   │   ├── page.tsx       # Schedule view (weekly timetable)
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx   # Specific schedule view
│   │   │   ├── upload/
│   │   │   │   └── page.tsx       # Upload/capture image
│   │   │   ├── settings/
│   │   │   │   └── page.tsx       # Settings page
│   │   │   ├── notifications/
│   │   │   │   └── page.tsx       # Notifications list
│   │   │   └── layout.tsx         # Dashboard layout (sidebar + header)
│   │   │
│   │   ├── api/
│   │   │   ├── uploadthing/
│   │   │   │   └── [...uploadthing]/
│   │   │   │       └── route.ts   # UploadThing handler
│   │   │   ├── health/
│   │   │   │   └── route.ts       # Health check endpoint
│   │   │   └── cron/
│   │   │       └── reminders/
│   │   │           └── route.ts   # Cron: send reminders
│   │   │
│   │   ├── layout.tsx             # Root layout (html, body, providers)
│   │   ├── page.tsx               # Landing page / redirect
│   │   ├── not-found.tsx          # 404 page
│   │   └── error.tsx              # Global error boundary
│   │
│   ├── server/                    # Server-side code (never imported by client)
│   │   ├── db/
│   │   │   ├── client.ts          # Prisma client singleton
│   │   │   └── index.ts           # Re-exports
│   │   │
│   │   ├── services/              # Business logic (pure functions, no HTTP)
│   │   │   ├── auth.service.ts    # Auth logic (register, login, session)
│   │   │   ├── schedule.service.ts # Schedule CRUD + business rules
│   │   │   ├── class.service.ts   # Class CRUD + validation
│   │   │   ├── upload.service.ts  # Upload management + status tracking
│   │   │   ├── ai.service.ts      # AI processing pipeline
│   │   │   ├── reminder.service.ts # Reminder creation + scheduling
│   │   │   └── notification.service.ts # Notification CRUD
│   │   │
│   │   ├── repositories/          # Data access layer (Prisma queries)
│   │   │   ├── user.repository.ts
│   │   │   ├── schedule.repository.ts
│   │   │   ├── class.repository.ts
│   │   │   ├── upload.repository.ts
│   │   │   ├── reminder.repository.ts
│   │   │   └── notification.repository.ts
│   │   │
│   │   ├── actions/               # Server Actions (thin wrappers)
│   │   │   ├── auth.actions.ts
│   │   │   ├── schedule.actions.ts
│   │   │   ├── class.actions.ts
│   │   │   ├── profile.actions.ts
│   │   │   └── upload.actions.ts
│   │   │
│   │   ├── lib/                   # Server utilities
│   │   │   ├── auth.ts            # Better Auth configuration
│   │   │   ├── openrouter.ts      # OpenRouter API client
│   │   │   ├── rate-limiter.ts    # Rate limiting utility
│   │   │   ├── email.ts           # Email sending (future)
│   │   │   └── errors.ts          # AppError types + helpers
│   │   │
│   │   └── validators/            # Zod schemas (server-side)
│   │       ├── auth.schema.ts
│   │       ├── schedule.schema.ts
│   │       ├── class.schema.ts
│   │       ├── profile.schema.ts
│   │       └── ai.schema.ts       # AI extraction response schema
│   │
│   ├── features/                  # Feature modules (colocated)
│   │   ├── auth/
│   │   │   ├── components/
│   │   │   │   ├── login-form.tsx
│   │   │   │   ├── register-form.tsx
│   │   │   │   ├── oauth-buttons.tsx
│   │   │   │   └── auth-guard.tsx
│   │   │   ├── hooks/
│   │   │   │   └── use-auth.ts
│   │   │   └── index.ts           # Barrel export
│   │   │
│   │   ├── schedule/
│   │   │   ├── components/
│   │   │   │   ├── timetable/
│   │   │   │   │   ├── week-view.tsx
│   │   │   │   │   ├── day-view.tsx
│   │   │   │   │   ├── class-card.tsx
│   │   │   │   │   ├── time-column.tsx
│   │   │   │   │   └── current-class-indicator.tsx
│   │   │   │   ├── schedule-header.tsx
│   │   │   │   ├── schedule-list.tsx
│   │   │   │   ├── class-detail-sheet.tsx
│   │   │   │   ├── class-form-dialog.tsx
│   │   │   │   └── empty-state.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── use-schedule.ts
│   │   │   │   ├── use-current-class.ts
│   │   │   │   └── use-timetable.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── upload/
│   │   │   ├── components/
│   │   │   │   ├── upload-dropzone.tsx
│   │   │   │   ├── image-preview.tsx
│   │   │   │   ├── processing-status.tsx
│   │   │   │   └── validation-review.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── use-upload.ts
│   │   │   │   └── use-processing-status.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── profile/
│   │   │   ├── components/
│   │   │   │   ├── profile-form.tsx
│   │   │   │   ├── avatar-upload.tsx
│   │   │   │   └── timezone-picker.tsx
│   │   │   ├── hooks/
│   │   │   │   └── use-profile.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── notifications/
│   │   │   ├── components/
│   │   │   │   ├── notification-list.tsx
│   │   │   │   ├── notification-item.tsx
│   │   │   │   ├── notification-bell.tsx
│   │   │   │   └── notification-preferences.tsx
│   │   │   ├── hooks/
│   │   │   │   └── use-notifications.ts
│   │   │   └── index.ts
│   │   │
│   │   └── settings/
│   │       ├── components/
│   │       │   ├── theme-toggle.tsx
│   │       │   ├── notification-settings.tsx
│   │       │   └── account-settings.tsx
│   │       └── index.ts
│   │
│   ├── components/                # Shared/generic components
│   │   ├── ui/                    # shadcn/ui components (auto-generated)
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── input.tsx
│   │   │   ├── form.tsx
│   │   │   ├── select.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── skeleton.tsx
│   │   │   └── ...                # Other shadcn components
│   │   │
│   │   ├── layout/                # Layout components
│   │   │   ├── sidebar.tsx
│   │   │   ├── header.tsx
│   │   │   ├── mobile-nav.tsx
│   │   │   ├── footer.tsx
│   │   │   └── page-header.tsx
│   │   │
│   │   └── shared/                # App-specific shared components
│   │       ├── confirm-dialog.tsx
│   │       ├── empty-state.tsx
│   │       ├── error-boundary.tsx
│   │       ├── loading-spinner.tsx
│   │       ├── color-picker.tsx
│   │       └── day-badge.tsx
│   │
│   ├── hooks/                     # Shared custom hooks
│   │   ├── use-debounce.ts
│   │   ├── use-media-query.ts
│   │   ├── use-local-storage.ts
│   │   ├── use-clipboard.ts
│   │   └── use-online-status.ts
│   │
│   ├── stores/                    # Zustand stores
│   │   ├── ui.store.ts
│   │   └── timetable.store.ts
│   │
│   ├── lib/                       # Shared utilities
│   │   ├── constants.ts           # App constants (colors, days, etc.)
│   │   ├── utils.ts               # cn() helper, formatters
│   │   ├── time.ts                # Time manipulation utilities
│   │   ├── colors.ts              # Subject color assignment
│   │   └── validators.ts          # Shared Zod schemas (if needed client+server)
│   │
│   ├── types/                     # Shared TypeScript types
│   │   ├── index.ts
│   │   ├── schedule.ts            # Schedule-related types
│   │   ├── class.ts               # Class-related types
│   │   └── api.ts                 # API response types
│   │
│   └── config/                    # Configuration constants
│       ├── site.ts                # Site metadata (name, description, URLs)
│       ├── navigation.ts          # Sidebar/navigation items
│       └── subjects.ts            # Default subject colors, icons
│
├── docker-compose.yml             # Local dev infrastructure (PostgreSQL)
├── .env.example                   # Environment variables template
├── .env.local                     # Local environment (gitignored)
├── .eslintrc.json                 # ESLint config
├── .prettierrc                    # Prettier config
├── .gitignore
├── architecture.md                # This file
├── components.json                # shadcn/ui config
├── next.config.ts                 # Next.js configuration
├── package.json
├── postcss.config.js              # PostCSS config (for Tailwind)
├── tailwind.config.ts             # Tailwind configuration
├── tsconfig.json                  # TypeScript configuration
└── vitest.config.ts               # Vitest configuration
```

### 9.1 Folder Descriptions

| Folder | Purpose | Imported By |
|--------|---------|-------------|
| `prisma/` | Database schema, migrations, seed data | Server only |
| `src/app/` | Next.js routes, layouts, pages, API endpoints | Next.js router |
| `src/server/db/` | Database client singleton and connection management | Repositories |
| `src/server/services/` | Business logic. Orchestrate repositories, call external APIs, enforce rules. Never import from `app/` or `features/`. | Actions, other services |
| `src/server/repositories/` | Data access. Only Prisma calls. No business logic. | Services |
| `src/server/actions/` | Server Actions. Thin wrappers: validate input → call service → return result. | Client components (via `"use server"`) |
| `src/server/lib/` | Server-only utilities (auth config, API clients, error types) | Services, actions, middleware |
| `src/server/validators/` | Zod schemas for server-side validation | Actions, services |
| `src/features/` | Feature modules. Each feature contains its own components, hooks, and barrel export. Features import from `server/` but never from other features directly. | Pages, layouts |
| `src/components/ui/` | shadcn/ui base components. Generic, stateless, accessible. | Features, other components |
| `src/components/layout/` | Layout components (sidebar, header). Used by route group layouts. | Layout files |
| `src/components/shared/` | App-specific shared components used across multiple features. | Features |
| `src/hooks/` | Generic custom hooks with no business logic. | Features, components |
| `src/stores/` | Zustand stores for client-side state. | Features, components |
| `src/lib/` | Shared utilities. Pure functions. No side effects. No Prisma. | Everywhere |
| `src/types/` | Shared TypeScript type definitions. | Everywhere |
| `src/config/` | Configuration constants. No logic, just data. | Everywhere |

### 9.2 Import Rules

```
# Allowed imports:
app/        → features/, components/, server/actions/, lib/, types/, config/
features/   → server/ (services, actions), components/, lib/, types/, config/
components/ → lib/, types/, config/, hooks/
hooks/      → lib/, types/
stores/     → lib/, types/
lib/        → types/, config/
server/     → server/ (within layer), lib/, types/, validators/

# Forbidden imports:
features/   → other features/ (use composition at page level)
components/ → features/, server/
lib/        → server/, features/, components/
hooks/      → features/, server/, components/
```

---

## 10. Code Style & Conventions

### 10.1 TypeScript

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@server/*": ["./src/server/*"],
      "@features/*": ["./src/features/*"],
      "@components/*": ["./src/components/*"],
      "@lib/*": ["./src/lib/*"],
      "@types/*": ["./src/types/*"],
      "@config/*": ["./src/config/*"]
    }
  }
}
```

### 10.2 Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Files (components) | kebab-case | `class-card.tsx` |
| Files (non-components) | kebab-case | `schedule.service.ts` |
| Components | PascalCase | `ClassCard` |
| Functions | camelCase | `getScheduleById` |
| Services | camelCase (class-like) | `ScheduleService` |
| Repositories | camelCase (class-like) | `ScheduleRepository` |
| Hooks | camelCase, `use` prefix | `useSchedule` |
| Stores | camelCase, `use` prefix | `useUIStore` |
| Types/Interfaces | PascalCase | `Schedule`, `ExtractedClass` |
| Zod Schemas | camelCase | `createScheduleSchema` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_UPLOAD_SIZE` |
| Database columns | snake_case (mapped) | `created_at` |
| CSS classes | Tailwind utilities | `bg-primary text-white` |

### 10.3 ESLint Rules

```json
{
  "extends": [
    "next/core-web-vitals",
    "next/typescript",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/consistent-type-imports": "error",
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  }
}
```

### 10.4 Prettier

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

### 10.5 SOLID Application

- **S** (Single Responsibility): Services handle one domain. Repositories handle one entity. Components render one thing.
- **O** (Open/Closed): New schedule features extend services, don't modify existing ones.
- **L** (Liskov Substitution): Not directly applicable (no inheritance hierarchies).
- **I** (Interface Segregation): Separate repository interfaces per entity. No god repository.
- **D** (Dependency Inversion): Services depend on repository interfaces, not Prisma directly. Enables testing with mocks.

---

## 11. Security

### 11.1 Protection Measures

| Threat | Mitigation |
|--------|-----------|
| XSS | React auto-escapes. No `dangerouslySetInnerHTML`. CSP headers via `next.config.ts`. |
| CSRF | SameSite cookies. Server Actions include CSRF tokens. Origin header validation. |
| SQL Injection | Prisma parameterizes all queries. No raw SQL with user input. |
| Rate Limiting | IP-based rate limiting on auth endpoints (5/min). User-based on AI (10/hour). |
| Image Validation | Server-side MIME type checking. File size limits. Image dimension limits. |
| Input Validation | Zod schemas on ALL server inputs. No trust in client data. |
| Authentication | HTTP-only cookies. Secure flag. Session rotation on privilege change. |
| Authorization | Row-Level Security (Supabase RLS). Ownership checks in services. |
| Environment | Zod validation at startup. No secrets in client bundle. `.env` gitignored. |
| Headers | `X-Content-Type-Options: nosniff`. `X-Frame-Options: DENY`. `Referrer-Policy: strict-origin-when-cross-origin`. |
| Dependencies | `npm audit` in CI. Dependabot alerts. Regular updates. |

### 11.2 Security Headers (next.config.ts)

```typescript
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: "..." }, // Tight CSP
];
```

### 11.3 Data Privacy

- User data never shared with third parties.
- AI images processed in-memory, not stored by AI provider (OpenRouter).
- Users can delete their account and all data (GDPR compliance).
- Schedule data is private by default - no sharing without explicit opt-in.
- All PII encrypted at rest (PostgreSQL TDE via Supabase).

---

## 12. Deployment

### 12.1 Local Development Infrastructure (Docker)

Docker is used **only** for local development infrastructure — not for the application itself. This ensures every developer gets an identical PostgreSQL instance without installing anything globally.

**`docker-compose.yml`**:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: schedly-db
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: schedly
      POSTGRES_PASSWORD: schedly_dev
      POSTGRES_DB: schedly
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U schedly -d schedly"]
      interval: 5s
      timeout: 5s
      retries: 5

  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: schedly-pgadmin
    restart: unless-stopped
    ports:
      - "5050:80"
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@schedly.dev
      PGADMIN_DEFAULT_PASSWORD: admin
    volumes:
      - pgadmin_data:/var/lib/pgadmin
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
  pgadmin_data:
```

**Usage**:

```bash
# Start local database
docker compose up -d

# Stop (data persists in volume)
docker compose down

# Stop and wipe all data
docker compose down -v

# View logs
docker compose logs -f postgres

# Check status
docker compose ps
```

**Local `.env.local`**:

```bash
DATABASE_URL="postgresql://schedly:schedly_dev@localhost:5432/schedly?schema=public"
```

**Why Docker for dev but not for the app:**
- Vercel runs Next.js natively — containerizing the app adds complexity for zero benefit on Vercel.
- PostgreSQL via Docker gives version-pinned, reproducible databases across all machines.
- pgAdmin provides a visual database browser for debugging during development.
- The `postgres_data` volume persists data across `docker compose down` restarts, so you don't lose work.
- If a new developer clones the project, `docker compose up -d && npm run dev` is the entire local setup.

**Why not Supabase local (supabase CLI):**
- Supabase local dev requires Docker anyway (it runs 6+ containers: Postgres, GoTrue, PostgREST, Realtime, Storage, Kong).
- Overkill for local development when we only need PostgreSQL.
- Supabase CLI is great for testing RLS policies, but adds significant resource overhead (2GB+ RAM).

**Why not a local PostgreSQL install:**
- Version drift between developers (one has PG 14, another has PG 16).
- Requires system-level installation and service management.
- Harder to reset/wipe the database.
- Docker isolates it completely — no conflicts with other projects.

### 12.2 Stack

| Service | Provider | Purpose |
|---------|----------|---------|
| Application | Vercel | Next.js hosting, edge functions, preview deploys |
| Database | Supabase (free tier → Pro) | PostgreSQL, connection pooling, dashboard |
| File Storage | UploadThing | Image uploads, CDN |
| AI API | OpenRouter | Vision model access |
| Error Tracking | Sentry (free tier) | Error monitoring, performance |
| Analytics | Vercel Analytics | Core Web Vitals |
| Domain | Cloudflare (or Vercel) | DNS, DDoS protection |
| Email | Resend (future) | Transactional emails |

### 12.3 CI/CD Pipeline

```
Push to main
    ↓
GitHub Actions
    ├── Lint (ESLint)
    ├── Type check (tsc --noEmit)
    ├── Unit tests (Vitest)
    ├── Build (next build)
    └── E2E tests (Playwright) [optional, can be on PR only]
    ↓
Vercel auto-deploys
    ├── Production build
    ├── Edge functions deployed
    └── Preview deploy for PR
```

### 12.4 Environment Tiers

| Tier | Branch | URL | Database |
|------|--------|-----|----------|
| Development | feature branches | localhost:3000 | Local PostgreSQL (Docker) |
| Preview | PR branches | *.vercel.app | Supabase staging project |
| Production | main | schedly.app | Supabase production project |

### 12.5 Database Management

- **Development**: `prisma migrate dev` (creates migration, applies to local DB)
- **Staging**: `prisma migrate deploy` (applies pending migrations on Vercel build)
- **Production**: `prisma migrate deploy` (same, applied during production deploy)
- **Seeding**: `prisma db seed` (populates dev database with test data)

---

## 13. Roadmap

### Phase 1: Project Setup

**Goals**: Initialize project, configure tooling, establish conventions.

**Tasks**:
- Initialize Next.js 15 project with TypeScript
- Set up Docker Compose (PostgreSQL + pgAdmin)
- Configure Tailwind CSS v4 + shadcn/ui
- Set up ESLint + Prettier
- Configure path aliases
- Set up Prisma with PostgreSQL schema
- Create `.env.example` with all required variables
- Set up folder structure (empty files/folders)
- Configure Vitest

**Files to create**:
- `package.json`, `tsconfig.json`, `next.config.ts`
- `tailwind.config.ts`, `postcss.config.js`
- `.eslintrc.json`, `.prettierrc`
- `docker-compose.yml`
- `prisma/schema.prisma`
- `src/app/layout.tsx`, `src/app/page.tsx`
- `src/lib/utils.ts`, `src/lib/constants.ts`
- `src/server/db/client.ts`
- `src/config/site.ts`
- `.env.example`, `.gitignore`

**Dependencies**: Next.js, React, TypeScript, Tailwind CSS, Prisma, shadcn/ui CLI, Docker Desktop

**Expected outcome**: `docker compose up -d` starts PostgreSQL + pgAdmin. `npm run dev` starts the app. All tools configured. Folder structure ready for features.

---

### Phase 2: Authentication

**Goals**: Working email/password registration, login, session management.

**Tasks**:
- Set up Better Auth with Prisma adapter
- Configure session strategy (cookies)
- Create auth service (register, login, logout, session)
- Create auth server actions
- Build login page with form
- Build register page with form
- Implement auth middleware (protect dashboard routes)
- Add form validation with Zod
- Handle error states (invalid credentials, duplicate email)

**Files to create**:
- `src/server/lib/auth.ts` (Better Auth config)
- `src/server/services/auth.service.ts`
- `src/server/actions/auth.actions.ts`
- `src/server/validators/auth.schema.ts`
- `src/features/auth/components/login-form.tsx`
- `src/features/auth/components/register-form.tsx`
- `src/features/auth/components/auth-guard.tsx`
- `src/features/auth/hooks/use-auth.ts`
- `src/features/auth/index.ts`
- `src/app/(auth)/layout.tsx`
- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/register/page.tsx`
- `src/middleware.ts`

**Files to modify**: `prisma/schema.prisma` (add User, Session, Account models)

**Dependencies**: Better Auth, bcrypt

**Expected outcome**: User can register, login, logout. Dashboard routes protected. Sessions persist across refreshes.

---

### Phase 3: Database & Profile

**Goals**: Full database schema, user profile management.

**Tasks**:
- Complete Prisma schema (all models from design)
- Generate and apply migration
- Create repository layer for all entities
- Create profile page with form
- Implement avatar upload (basic)
- Timezone picker
- Theme toggle (dark/light/system)
- Seed script for development

**Files to create**:
- `src/server/repositories/user.repository.ts`
- `src/server/repositories/schedule.repository.ts`
- `src/server/repositories/class.repository.ts`
- `src/server/repositories/upload.repository.ts`
- `src/server/repositories/reminder.repository.ts`
- `src/server/repositories/notification.repository.ts`
- `src/server/services/profile.service.ts`
- `src/server/actions/profile.actions.ts`
- `src/server/validators/profile.schema.ts`
- `src/features/profile/components/profile-form.tsx`
- `src/features/profile/components/avatar-upload.tsx`
- `src/features/profile/components/timezone-picker.tsx`
- `src/features/settings/components/theme-toggle.tsx`
- `src/app/(dashboard)/settings/page.tsx`
- `src/stores/ui.store.ts`
- `prisma/seed.ts`

**Files to modify**: `prisma/schema.prisma` (add remaining models)

**Dependencies**: date-fns-tz (timezone handling)

**Expected outcome**: Full database operational. User can edit profile, upload avatar, change theme/timezone.

---

### Phase 4: File Storage & Upload UI

**Goals**: Image upload flow with compression and progress.

**Tasks**:
- Set up UploadThing router and configuration
- Build upload dropzone component (drag & drop + click)
- Client-side image compression
- Image preview with zoom
- Upload progress indicator
- Upload status tracking (polling)
- Store upload record in database

**Files to create**:
- `src/app/api/uploadthing/[...uploadthing]/route.ts`
- `src/features/upload/components/upload-dropzone.tsx`
- `src/features/upload/components/image-preview.tsx`
- `src/features/upload/components/processing-status.tsx`
- `src/features/upload/hooks/use-upload.ts`
- `src/features/upload/hooks/use-processing-status.ts`
- `src/features/upload/index.ts`
- `src/server/services/upload.service.ts`
- `src/server/actions/upload.actions.ts`
- `src/app/(dashboard)/upload/page.tsx`

**Dependencies**: UploadThing, `@uploadthing/react`, `browser-image-compression`

**Expected outcome**: User can upload schedule image via drag-and-drop or file picker. Image compressed, uploaded, preview shown.

---

### Phase 5: AI Pipeline

**Goals**: Extract schedule data from uploaded images.

**Tasks**:
- Set up OpenRouter API client
- Design and test extraction prompt
- Implement image pre-processing (resize for API)
- Implement API call with retry logic
- Parse and validate AI response with Zod
- Run validation rules (overlaps, duplicates, invalid times)
- Save extracted classes to database
- Build validation review UI (user corrects AI mistakes)
- Handle AI errors gracefully
- Rate limiting for AI calls

**Files to create**:
- `src/server/lib/openrouter.ts`
- `src/server/services/ai.service.ts`
- `src/server/validators/ai.schema.ts`
- `src/features/upload/components/validation-review.tsx`
- `src/lib/time.ts` (time parsing, overlap detection)

**Files to modify**:
- `src/features/upload/hooks/use-processing-status.ts` (poll AI status)
- `src/server/services/upload.service.ts` (trigger AI on upload complete)

**Dependencies**: OpenRouter API key

**Expected outcome**: User uploads image → AI extracts classes → User reviews/corrects → Schedule saved to database.

---

### Phase 6: Schedule UI

**Goals**: Interactive timetable display.

**Tasks**:
- Weekly timetable grid component
- Daily timetable view
- Class cards with color coding
- Time column with hour markers
- Current class indicator (live)
- Next class indicator
- Class detail sheet (slide-out panel)
- Edit class dialog
- Delete class with confirmation
- Add class manually
- Subject color assignment algorithm
- Responsive design (mobile day view, desktop week view)
- Empty state for no schedule

**Files to create**:
- `src/features/schedule/components/timetable/week-view.tsx`
- `src/features/schedule/components/timetable/day-view.tsx`
- `src/features/schedule/components/timetable/class-card.tsx`
- `src/features/schedule/components/timetable/time-column.tsx`
- `src/features/schedule/components/timetable/current-class-indicator.tsx`
- `src/features/schedule/components/schedule-header.tsx`
- `src/features/schedule/components/schedule-list.tsx`
- `src/features/schedule/components/class-detail-sheet.tsx`
- `src/features/schedule/components/class-form-dialog.tsx`
- `src/features/schedule/components/empty-state.tsx`
- `src/features/schedule/hooks/use-schedule.ts`
- `src/features/schedule/hooks/use-current-class.ts`
- `src/features/schedule/hooks/use-timetable.ts`
- `src/features/schedule/index.ts`
- `src/server/services/schedule.service.ts`
- `src/server/services/class.service.ts`
- `src/server/actions/schedule.actions.ts`
- `src/server/actions/class.actions.ts`
- `src/server/validators/schedule.schema.ts`
- `src/server/validators/class.schema.ts`
- `src/app/(dashboard)/schedule/page.tsx`
- `src/app/(dashboard)/schedule/[id]/page.tsx`
- `src/stores/timetable.store.ts`
- `src/lib/colors.ts`
- `src/types/schedule.ts`
- `src/types/class.ts`
- `src/components/layout/sidebar.tsx`
- `src/components/layout/header.tsx`
- `src/components/layout/mobile-nav.tsx`

**Dependencies**: Framer Motion (for animations)

**Expected outcome**: Full interactive timetable. Users can view, add, edit, delete classes. Responsive across all devices.

---

### Phase 7: Notifications

**Goals**: Browser notifications for class reminders.

**Tasks**:
- Request browser notification permission
- Create reminder management UI
- Server-side reminder scheduling (cron)
- Notification delivery via Service Worker
- In-app notification center (list, mark as read)
- Notification bell with badge count
- Notification preferences

**Files to create**:
- `src/features/notifications/components/notification-list.tsx`
- `src/features/notifications/components/notification-item.tsx`
- `src/features/notifications/components/notification-bell.tsx`
- `src/features/notifications/components/notification-preferences.tsx`
- `src/features/notifications/hooks/use-notifications.ts`
- `src/features/notifications/index.ts`
- `src/server/services/reminder.service.ts`
- `src/server/services/notification.service.ts`
- `src/server/actions/reminder.actions.ts`
- `src/app/api/cron/reminders/route.ts`
- `src/app/(dashboard)/notifications/page.tsx`
- `public/sw.js` (Service Worker)
- `src/features/schedule/components/timetable/class-card.tsx` (modify - add reminder toggle)

**Dependencies**: `web-push` (for push notification support)

**Expected outcome**: Users receive browser notifications before each class. In-app notification center for history.

---

### Phase 8: Settings & Polish

**Goals**: Complete settings page, UX polish, accessibility audit.

**Tasks**:
- Notification settings page
- Account settings (change email, password)
- Delete account (with confirmation)
- Privacy settings
- Keyboard shortcuts
- Loading states (skeletons)
- Error states (error boundaries)
- Empty states
- Responsive audit
- Accessibility audit (axe-core)
- Animation polish
- 404 page
- About/help page

**Files to create/modify**:
- `src/features/settings/components/account-settings.tsx`
- `src/features/settings/components/notification-settings.tsx`
- `src/components/shared/confirm-dialog.tsx`
- `src/components/shared/error-boundary.tsx`
- `src/components/shared/loading-spinner.tsx`
- `src/app/not-found.tsx`
- `src/app/error.tsx`

**Expected outcome**: Polished, accessible, responsive application ready for real users.

---

### Phase 9: Optimization

**Goals**: Performance optimization, code quality, testing.

**Tasks**:
- Bundle analysis and optimization
- Image optimization (next/image everywhere)
- Font optimization (next/font)
- Prefetching strategy
- Database query optimization (indexes, query analysis)
- API response caching
- Lighthouse audit (target: 90+ on all metrics)
- Unit tests for services and repositories
- Integration tests for server actions
- E2E tests for critical flows (upload → AI → timetable)
- Error monitoring setup (Sentry)
- Analytics setup (Vercel Analytics)

**Files to create**:
- `vitest.config.ts`
- `src/**/*.test.ts` (unit tests)
- `e2e/*.spec.ts` (E2E tests)
- `playwright.config.ts`

**Dependencies**: Vitest, Testing Library, Playwright, Sentry

**Expected outcome**: High-performance, well-tested application. Lighthouse score 90+. Monitoring in place.

---

### Phase 10: Deployment

**Goals**: Production deployment, monitoring, launch.

**Tasks**:
- Set up Supabase production project
- Configure Vercel project
- Set up domain and SSL
- Configure environment variables
- Set up CI/CD pipeline (GitHub Actions)
- Configure Sentry for production
- Set up Vercel Analytics
- Load testing (simulate 100 concurrent users)
- Security audit
- Documentation (README, API docs)
- Launch checklist review
- Deploy to production
- Monitor for 48 hours

**Files to create**:
- `.github/workflows/ci.yml`
- `README.md` (only if requested)
- `VERCEL.json` (if custom config needed)

**Expected outcome**: Schedly deployed to production. Accessible via custom domain. Monitoring active. Ready for users.

---

## Appendix A: Technology Version Matrix

| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 15.x | Framework |
| React | 19.x | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Styling |
| Prisma | 6.x | ORM |
| PostgreSQL | 16.x | Database |
| Better Auth | latest | Authentication |
| UploadThing | latest | File uploads |
| Zustand | latest | Client state |
| TanStack Query | 5.x | Server state |
| Zod | 3.x | Validation |
| shadcn/ui | latest | Component library |
| Framer Motion | latest | Animations |
| Vitest | latest | Unit testing |
| Playwright | latest | E2E testing |
| Sentry | latest | Error tracking |
| Pino | latest | Logging |

## Appendix B: Cost Estimation (Monthly)

| Service | Free Tier | Paid Tier |
|---------|-----------|-----------|
| Vercel | $0 (hobby) | $20/month (pro) |
| Supabase | $0 (2 projects) | $25/month (pro) |
| UploadThing | $0 (2GB) | $30/month |
| OpenRouter | Pay-per-use (~$0.0001/image) | ~$10/month at 100K images |
| Sentry | $0 (5K errors) | $26/month (team) |
| Domain | - | ~$12/year |
| **Total (startup)** | **~$0/month** | **~$115/month** |
| **Total (100K users)** | - | **~$200-500/month** |
