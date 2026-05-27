# GlowLoop Pre-Launch Audit Log

**Started:** 2026-05-26  
**Auditor:** Claude (claude-sonnet-4-6)  
**Format:** Each entry = planned change → outcome  

---

## Section 1: Security

### 1.1 RLS Policy Review

**Reviewed tables (16 total):** profiles, categories, products, tasks, instances, task_products, prep_steps, linked_tasks, link_resolution_rules, service_providers, routines, routine_task_pairs, routine_conflicts, common_tasks, common_task_relationships, user_suggestion_dismissals

**Result:** All 16 tables have RLS enabled with appropriate policies.
- User-owned tables: `user_id = auth.uid()` FOR ALL ✓
- System templates: read-only SELECT for all authenticated users ✓
- `routine_task_pairs` / `routine_conflicts`: subquery `routine_id IN (SELECT id FROM routines WHERE user_id = auth.uid())` — stronger than user_id check alone ✓
- `common_tasks` / `common_task_relationships`: SELECT-only for authenticated (reference data pattern) ✓
- `profiles`: no INSERT policy (trigger handles it, SECURITY DEFINER), DELETE cascades from auth.users ✓

**Status:** PASS — no changes needed

---

### 1.2 Admin Role

No admin role system needed. System templates managed via Supabase dashboard. No admin-only API routes. Acceptable for launch.

**Status:** PASS

---

### 1.3 Auth Hardening — Proxy (Next.js 16 Middleware)

In Next.js 16, `middleware.ts` was renamed to `proxy.ts` with export `proxy`. The existing `proxy.ts` at project root is correctly named, correctly exports `proxy`, and calls `updateSession()` on every request. Build output confirms: `ƒ Proxy (Middleware)`.

**Status:** PASS — proxy.ts correctly configured

---

### 1.4 Security Headers

**Finding:** No HTTP security headers configured.

**Fix:** Added `async headers()` to `next.config.ts` with: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

**Status:** FIXED ✅

---

### 1.5 Input Sanitization

- All DB writes go through Supabase JS SDK (parameterized queries — no SQL injection) ✓
- No `dangerouslySetInnerHTML` anywhere in codebase ✓
- User text rendered as React text nodes (no XSS vector) ✓
- `product_url` / `website_url` stored but not yet rendered as `<a href>` links (no XSS risk currently) ✓
- Note for future: when rendering user-provided URLs as links, sanitize to `https:` / `http:` scheme only

**Status:** PASS

---

### 1.6 Environment Variables

Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`. Both correctly prefixed as public values. No service_role key or JWT secret present. `.gitignore` covers `.env*` pattern.

**Status:** PASS

---

### 1.7 Dependencies

`npm audit` reports 2 moderate vulnerabilities: `postcss@8.4.31` inside `next@16.2.6` (GHSA-qx2v-qp2m-jg93: XSS via `</style>` in CSS Stringify). This is Next.js's internal postcss, not user-facing. `@tailwindcss/postcss` ships patched `postcss@8.5.15`. Real-world exploitability requires malicious developer-authored CSS, not end-user input.

**Recommended:** `npm install next@latest` when a patched stable release is available. Do not use `npm audit fix --force` (suggests broken downgrade to Next.js 9).

**Status:** NOTED — deferred until patched Next.js stable release

---

### 1.8 Google OAuth

Not wired up. Auth uses Supabase email/password. N/A for launch.

**Status:** PASS

---

## Section 2: Database Performance

### 2.1 Indexes

**Existing coverage is good.** The most important composite indexes exist: `instances_user_date_status_idx (user_id, due_date_start, status)`, `routine_conflicts_user_status_idx (user_id, status)`, partial index on projected instances.

**Missing indexes identified and added in migration 017:**
- `instances_task_date_idx ON instances(task_id, due_date_start)` — non-partial version for routine timeline query
- `routine_conflicts_routine_status_idx ON routine_conflicts(routine_id, status)` — for conflict count queries in dashboard and routines page
- `tasks_routine_active_idx ON tasks(routine_id, is_active)` — for task count aggregation in routines page

**Status:** FIXED ✅ — migration `017_performance_indexes.sql` created

---

### 2.2 N+1 Queries

**Found:** `autoCompleteInstances` issued one UPDATE per instance (N round trips). Fixed by grouping instances by `due_date_start` and batching into one UPDATE per unique date (typically 1 round trip).

No other N+1 patterns found. All server pages use `Promise.all()` for parallel fetches.

**Status:** FIXED ✅ — `lib/autoComplete.ts` updated

---

### 2.3 Pagination

No pagination on task list, instance history, horizon view. Acceptable for launch (typical users: <50 tasks, <500 instances). Monitor at scale.

**Status:** NOTED — acceptable for launch

---

### 2.4 Column Selection

Several queries use `SELECT *` on instances (30+ columns) where a subset would suffice. Dashboard heatmap query correctly selects `actual_completion_date` only. Low priority for launch data volumes.

**Status:** NOTED — low priority

---

## Section 3: Frontend Performance

### 3.1 Calendar Data Fetching

**Found:** `fetchCalendar` in `DashboardClient.tsx` ran two sequential Supabase queries (scheduled instances then completed instances). Parallelized into `Promise.all()`.

**Status:** FIXED ✅

### 3.2 Re-renders and Memoization

`useCallback` in DashboardClient for `fetchCalendar` is correctly used (empty deps, receives params). `useMemo` in RoutineTimeline for date calculations is appropriate. No problematic re-render patterns found.

**Status:** PASS

### 3.3 Images

No image files in `public/`. `before_photo_url` / `after_photo_url` stored in DB but not rendered. When photo display is implemented, use `next/image` for optimization.

**Status:** PASS

---

## Section 4: Code Quality

### 4.1 TypeScript Strictness

`"strict": true` is set in tsconfig.json. Build clean. TypeScript check clean.

**Status:** PASS

### 4.2 Type Gaps Fixed

- **`reminder_unit` missing `'minutes'`**: Type in `Task` interface and `TaskFormValues` said `'hours' | 'days' | 'weeks'` but form allowed and saved `'minutes'`. Fixed to include `'minutes'` in both.
- **`default_reminder_days` calculation**: Didn't handle `'minutes'` (fell to 0) or `'weeks'`. Fixed to handle all units.
- **`as never` casts**: Routine detail page passed `pairs` and `conflicts` props as `as never`. Exported `PairWithTasks` from RoutineDetailClient, imported `ConflictWithJoins` from ConflictModal. Replaced `as never` with `as unknown as PairWithTasks[]` and `as unknown as ConflictWithJoins[]`.

**Status:** FIXED ✅

### 4.3 Error Handling and Loading States

**Finding:** No `error.tsx` or `loading.tsx` files in the app directory. Unhandled server errors show generic Next.js error page; no loading skeleton shown during navigation.

**Fix:** Created `app/(app)/error.tsx` (styled error boundary with retry button) and `app/(app)/loading.tsx` (minimal loading indicator).

**Status:** FIXED ✅

### 4.4 Dead Code

Files that are defined but not imported anywhere:
- `lib/occurrenceEngine.ts` — legacy, superseded by `instanceEngine.ts`
- `lib/taskEngine.ts` — empty or unused
- `components/RoutineFromTemplateClient.tsx` — replaced by `UseTemplateFlow.tsx`

Cannot delete files via available tools. Recommend manual removal before launch to reduce bundle surface.

**Status:** NOTED — manual cleanup recommended

### 4.5 `eslint-disable @typescript-eslint/no-explicit-any`

7 occurrences, all in justified contexts (Supabase join type narrowing, dynamic data shapes). Acceptable at this stage.

**Status:** NOTED — acceptable

---

## Section 5: Supabase-Specific

### 5.1 Connection Pooling

Supabase uses PostgREST which manages connection pooling server-side. No app-level pooling needed.

**Status:** PASS

### 5.2 Realtime Subscriptions

No `supabase.channel()` or realtime subscriptions anywhere. No open WebSocket resource leaks. Data is fetched on demand.

**Status:** PASS

### 5.3 Client Instantiation

`instanceEngine.ts` uses a lazy singleton pattern (`_client`). Client components create the browser client inside event handlers (acceptable — `createBrowserClient` handles deduplication internally). `LinkRulesPanel.tsx` creates at module level (fine for client component).

**Status:** PASS

### 5.4 Rate Limiting

Supabase anon key has infrastructure-level rate limiting. App-level rate limiting not needed for a personal/low-traffic app at launch.

**Status:** PASS

### 5.5 Security Advisor

Run the Supabase Security Advisor in the dashboard (Database → Security Advisor) before launch to catch any DB-level misconfigurations not visible in migrations.

**Status:** RECOMMENDED — manual step required

---

## Section 6: Scalability

### 6.1 Data Model

UUID primary keys, proper foreign key cascades, denormalized `user_id` on child tables for efficient RLS. Well-designed for multi-user SaaS at scale.

**Status:** PASS

### 6.2 Instance Generation

`generateProjectedInstances` is bounded (n ≤ 100, 6-month cutoff). `calculateCountdownWindows` is bounded (n ≥ 200 guard). Safe for any task configuration.

**Status:** PASS

### 6.3 Storage Projections

No image storage currently (URLs exist in schema but not implemented). When implemented, use Supabase Storage with per-user path prefix (`{user_id}/...`) for proper isolation.

**Status:** NOTED — pre-implementation advice

### 6.4 Instance Volume at Scale

A user with 20 tasks × 10 projected instances each = 200 active instance rows. At 10,000 users = 2M rows. With existing composite indexes, query performance remains O(log n) per user. Acceptable up to millions of total rows.

**Status:** PASS

---

## Section 7: Final Checks

### 7.1 Build Verification

`npm run build` passes cleanly after all changes. TypeScript clean. No type errors.

**Status:** PASS ✅

### 7.2 Changes Summary

| File | Change |
|------|--------|
| `next.config.ts` | Added security headers (5 headers) |
| `supabase/migrations/017_performance_indexes.sql` | 3 new composite indexes |
| `lib/autoComplete.ts` | Batched N+1 UPDATE into per-date groups |
| `components/DashboardClient.tsx` | Calendar queries parallelized with Promise.all() |
| `types/index.ts` | Added `'minutes'` to `reminder_unit` union (×2) |
| `components/forms/TaskForm.tsx` | Fixed `default_reminder_days` for all reminder units |
| `components/RoutineDetailClient.tsx` | Exported `PairWithTasks` type |
| `app/(app)/routines/[id]/page.tsx` | Replaced `as never` with typed casts, fixed imports |
| `app/(app)/error.tsx` | New: app-level error boundary |
| `app/(app)/loading.tsx` | New: app-level loading state |

### 7.3 Manual Steps Required Before Launch

1. **Run `017_performance_indexes.sql`** in Supabase SQL Editor
2. **Run Supabase Security Advisor** (Database → Security Advisor)
3. **Delete dead code files** (optional but recommended):
   - `lib/occurrenceEngine.ts`
   - `lib/taskEngine.ts`
   - `components/RoutineFromTemplateClient.tsx`
4. **Update Next.js** when a version shipping `postcss ≥ 8.5.10` is stable

**Audit complete.**
