# Google Classroom Integration — Admin-Only Setup

This integration connects a Schedly **admin** account to the official Google
Classroom API (read-only) and syncs courses and coursework into Schedly's
Academic Task store. During this testing phase only Schedly admins
(`user.isAdmin === true`) can use it, and the feature must be explicitly
enabled with an environment variable.

> Security: this is a **read-only** integration. Schedly never requests
> write scopes, never touches Gmail/Drive/Calendar, and never asks for your
> Google password.

---

## 1. Google Cloud project setup

1. Go to <https://console.cloud.google.com> and create a project (or reuse one).
2. **Enable the Google Classroom API**
   - Console → APIs & Services → Library
   - Search for **Google Classroom API** → Enable.
3. **Configure the OAuth consent screen**
   - Console → APIs & Services → OAuth consent screen
   - User type: **External** (required for personal/education accounts).
   - Fill in app name, support email, developer contact.
   - **Scopes**: add the following scopes:
     - `openid` and `email` (profile identity)
     - `https://www.googleapis.com/auth/classroom.courses.readonly`
     - `https://www.googleapis.com/auth/classroom.coursework.readonly`
   - **Test users**: add the Google account(s) that will test the
     integration. While the app is in "Testing" status, only listed test
     users can authorize — this is a good safety measure for the admin-only
     phase.
4. **Create an OAuth 2.0 Client ID**
   - Console → APIs & Services → Credentials → **Create credentials** →
     OAuth client ID
   - Application type: **Web application**
   - **Authorized redirect URIs**: add exactly one entry:
     ```
     https://app.schedly.shop/api/integrations/google-classroom/callback
     ```
     (locally use `http://localhost:3000/api/integrations/google-classroom/callback`)
   - Copy the **Client ID** and **Client secret**.

## 2. Environment variables

Add to `.env.local` (or `.env.secret` — never commit real values):

```env
GOOGLE_CLASSROOM_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLASSROOM_CLIENT_SECRET=GOCSPX-xxxxx
GOOGLE_CLASSROOM_REDIRECT_URI=http://localhost:3000/api/integrations/google-classroom/callback
GOOGLE_CLASSROOM_INTEGRATION_ENABLED=true
# Optional dedicated token-encryption key (openssl rand -base64 32).
# Falls back to BETTER_AUTH_SECRET when unset.
# GOOGLE_CLASSROOM_TOKEN_ENCRYPTION_KEY=
```

| Variable | Purpose |
|---|---|
| `GOOGLE_CLASSROOM_CLIENT_ID` | OAuth client ID (public, but kept server-side anyway) |
| `GOOGLE_CLASSROOM_CLIENT_SECRET` | OAuth client secret — **never expose to the browser** |
| `GOOGLE_CLASSROOM_REDIRECT_URI` | Must match the URI registered in Google Cloud exactly |
| `GOOGLE_CLASSROOM_INTEGRATION_ENABLED` | Feature flag. `false` (default) disables the integration entirely |
| `GOOGLE_CLASSROOM_TOKEN_ENCRYPTION_KEY` | Optional 32+ byte key for AES-256-GCM encryption of OAuth tokens at rest |

## 3. Database

Apply the migration (the schema adds `google_classroom_connections` and
`academic_tasks`):

```bash
npm run db:migrate -- --name add_google_classroom_integration
```

If `prisma migrate dev` cannot replay the shadow database (older migrations in
this repo are historical), apply the new migration SQL directly:

```bash
npx prisma db push
```

then regenerate the client (`npm run db:generate`).

## 4. Start the server and test

```bash
npm run dev
```

1. Sign in with a **Schedly admin** account.
2. Open **Settings → Integrations**.
3. Click **Connect Google Classroom** → authorize the Google account.
4. The first sync runs automatically in the background; the card shows
   "Syncing Google Classroom..." and then the course/assignment counts.
5. For deeper checks use **Admin → Google Classroom Integration → Open
   testing page** (`/admin/integrations/google-classroom`) — buttons for
   Test Connection, Sync Courses, Sync Coursework, and Full Sync.

## 5. Security model

- Every endpoint (`connect`, `callback`, `status`, `sync`, `test`,
  `disconnect`) independently enforces:
  authenticated session → admin role → feature flag. Non-admins get
  `401`/`403` even if they call the API directly.
- The OAuth `state` is HMAC-signed, bound to the admin's session user ID,
  and expires after 10 minutes. The callback rejects mismatched/expired
  states.
- Access + refresh tokens are encrypted at rest (AES-256-GCM) and never
  returned through API responses, logged, or included in error messages.
- Mutating endpoints require the `x-csrf-protection: 1` header and are
  rate-limited (DB-backed counters).
- Disconnecting revokes the Google refresh token, deletes the connection
  record, and marks imported tasks as `orphaned` (never deleted).

## 6. Requested scopes (and why)

| Scope | Why it is required |
|---|---|
| `openid`, `email` | Stable Google account ID (`sub`) + the email shown in the UI. No profile data is stored. |
| `classroom.courses.readonly` | Listing the admin's courses. |
| `classroom.coursework.readonly` | Listing coursework per course. A teacher's view requires this scope (the `.me.` variant only returns the user's own student submissions). |

No write, Gmail, Drive, Calendar, or Contacts scopes are requested.

## 7. Rollout plan (future)

Access is gated in one place — `canUseGoogleClassroom()` in
`src/server/integrations/google-classroom/access.ts`. To widen access
later, change that function (e.g. beta-user allowlist, then all users) —
no route, service, or UI changes needed.

| Phase | Access |
|---|---|
| 1 (current) | Feature flag `true` + admins only |
| 2 | Internal beta users |
| 3 | Optional integration for all users |
| 4 | Automatic periodic sync |