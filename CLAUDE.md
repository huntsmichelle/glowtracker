# GlowLoop — Claude Code Project Instructions

This file is read automatically at the start of every Claude Code session.
Follow all instructions here without being asked.

---

## Session startup — always do this first

1. Read this file completely before doing anything else
2. Run `git log --oneline -10` to see what was last worked on
3. Check which prompt file was most recently applied by scanning recent commit messages or asking: "What version are we on?"
4. Resume from where the last session ended — do not ask the user to re-explain the project
5. If context is unclear, check the project root for `AUDIT_LOG.md` or ask the user which version to reference
6. Confirm readiness with a one-line status: "Resuming from v[X.X] — last worked on [feature]. Ready."

---

## Project overview

**App name:** GlowLoop (formerly GlowTracker)
**Stack:** Next.js (App Router) + Supabase + Tailwind CSS
**Deployed:** Vercel
**Purpose:** A self-maintenance ritual tracker — recurring beauty, grooming, and wellness tasks with scheduling, conflict detection, product tracking, and cost management.
**User-facing language:** Calm, editorial, "quiet luxury" — not a beauty influencer app.

---

## Architecture

```
/app
  /today              Dashboard / Today page (default route)
  /horizon            All upcoming instances — flat list, one per task
  /tasks              Rituals — category card landing, drills to list
  /tasks/new          Create new ritual (4-section form)
  /routines           Routine list + template atrium tiles
  /routines/[id]      Routine detail (conflict rules, timing rules)
  /routines/new       Create routine
  /shelf              Product inventory — category grouped
  /settings           User settings + re-trigger onboarding
  /onboarding         First-run flow (overlay, not a separate page)
  /auth/callback      OAuth callback handler
/components
  DepletionBar.tsx    Reusable battery-style depletion bar
  SpendBar.tsx        Actual vs projected spend bar
  ClockPicker.tsx     Analog clock time picker (12hr + AM/PM)
/lib
  instanceEngine.ts   Instance generation (canonical)
  conflictDetection.ts
  conflictResolution.ts
  costCalculations.ts
  categoryColors.ts   Imports from colors.ts
  colors.ts           Single source of truth for ALL colors
  productTracking.ts  Usage depletion, alerts, restock logic
  suggestions.ts
/supabase/migrations
/supabase/seeds
styles/tokens.css     CSS custom properties — always use these
AUDIT_LOG.md          Phase 3 audit log
```

**Dead code — safe to delete:**
- `lib/occurrenceEngine.ts` — deprecated stub
- `lib/taskEngine.ts` — deprecated stub
- `components/RoutineFromTemplateClient.tsx` — superseded, keep until replacement confirmed

---

## Database — key tables

| Table | Purpose |
|-------|---------|
| `tasks` | Recurring ritual series |
| `instances` | Individual scheduled occurrences |
| `routines` | Named groups of related tasks |
| `routine_task_pairs` | Per-pair conflict/timing rules |
| `routine_conflicts` | Detected overlaps |
| `categories` | Task categories |
| `profiles` | User profiles, app_role, onboarding state |
| `products` | Product inventory (shelf) |
| `task_products` | Products linked to tasks with usage tracking |
| `product_categories` | Three-level product category tree |
| `product_alerts` | Depletion and expiration alerts |
| `product_usage_log` | Immutable usage event log |
| `service_providers` | Stylist/provider records |
| `service_types` | Seed service type options |
| `linked_tasks` | Cross-task relationships (conflict/together/every-N) |
| `link_resolution_rules` | Rules for linked task conflicts |
| `common_tasks` | Reference database |
| `common_task_relationships` | Known conflict/sync pairs |
| `user_suggestion_dismissals` | Dismissed suggestions |

### Key column notes
- `tasks.category_id` — UUID FK to `categories` (NOT text)
- `tasks.frequency_type` — `'interval'` | `'daily'` | `'twice_daily'`
- `tasks.mode` — `'recurring'` | `'countdown'`
- `tasks.autocomplete_enabled` — UI label: "Make this a habit"
- `instances.status` — `'upcoming'` | `'projected'` | `'completed'` | `'skipped'` | `'ready_for_refresh'`
- `instances.archived` — BOOLEAN default FALSE. ALL queries must filter `.eq('archived', false)`
- `instances.generated_by_link_id` — UUID, set when instance auto-generated via linked task
- `instances.auto_completed` — BOOLEAN, set when autocomplete fires
- `routines.conflict_intent` — `'unset'` | `'independent'` | `'managed'`
- `routines.is_system_template` — TRUE for built-in templates
- `profiles.app_role` — `'user'` | `'admin'`
- `profiles.display_name` — user's first name, set during onboarding
- `profiles.onboarding_completed` — BOOLEAN
- `profiles.onboarding_intent` — `'event'` | `'tracking'`
- `profiles.onboarding_event_date` — DATE, set if intent = 'event'
- `products.reorder_url` — optional URL for reordering
- `products.expires_at` — DATE, month/year precision
- `products.remaining_amount` — current remaining (same unit as total_size_amount)
- `task_products.use_amount_override` — per-task override of default_use_amount
- `linked_tasks.link_type` — `'conflict'` | `'always_together'` | `'every_n_occurrences'`
- `linked_tasks.occurrence_interval` — default 2, used for every_n_occurrences
- `linked_tasks.primary_task_id` — anchor task for every_n_occurrences
- System template / admin user ID: `db24c2d7-e677-45af-add3-a155a87c75e0`

---

## Design tokens — ALWAYS use these, never hardcode colors

```css
--cream:       #efe9dd   /* page background */
--paper-soft:  #f6f1e6   /* cards, panels */
--ink:         #2b2823   /* primary text, dark actions */
--ink-soft:    #6b665e   /* secondary text */
--ink-faint:   #a8a297   /* tertiary, overlines, placeholders */
--divider:     #cdc6b6   /* borders, hairlines */
--sage:        #8ea394   /* today / active accent */
--bluegrey:    #93a3b1   /* alternate accent */
--refresh:     #c08a6e   /* ready for refresh / depletion — never red */
--dusty-rose:  #c4918a   /* soft pink-red */
--blush:       #d4a8a0   /* lighter warm pink */
--apricot:     #d4a478   /* soft warm orange — mid depletion */
--marigold:    #d4b870   /* muted warm yellow */
```

**Removed from palette:** `--taupe` (#b5a89a) — too close to background. Do not use.

**Rules:**
- One accent at a time — never combine sage + bluegrey + dusty-rose etc.
- No red anywhere — `--refresh` replaces red for all alerts
- No pure black — use `--ink`
- No white — `--paper-soft` for cards, `--cream` for pages
- No bright Tailwind defaults (`bg-pink-*`, `bg-blue-*`, `bg-purple-*`)
- All colors must come from `lib/colors.ts` — never hardcode hex in components

---

## Typography

```
Headings (h1, h2):  EB Garamond — display serif, brand voice
Body / UI:          Inter
Overline / kicker:  Inter, 10px, weight 600, letter-spacing 0.18em, uppercase, --ink-faint
Margin notes only:  Caveat
```

---

## UI conventions

### Buttons — one solid per page maximum
| Type | Style |
|------|-------|
| Primary (one per page) | `bg-[--ink] text-[--cream]` rounded-pill |
| Ghost / secondary | `border 1px --ink, transparent, --ink text` rounded-pill |
| Text link | No border, no fill, `--ink-soft` |
| Destructive | Text only, `--ink-soft`, confirm in modal |
| Row actions | Small text, no background, `--ink-soft`, on hover only |

### Category colors
Always use `getCategoryColor()` from `lib/categoryColors.ts`. Never Tailwind color classes on category elements.

### Depletion bar colors
- > 60%: `--ink`
- 30–60%: `--apricot`
- 10–30%: `--refresh`
- < 10%: `--refresh` with pulse animation

### Depletion alert threshold
Fires when `remaining_amount < default_use_amount` (less than one full use), NOT only at zero.

### Empty states
```
[Italic serif phrase ~22px]
[40px hairline rule, --divider]
[Small caps text link, --ink-faint]
```

### Row actions — progressive disclosure
Default: name + one primary action
Hover/expand: Pass, Defer, Adjust for event, Delete

### Slide-over panels
Width: `min(480px, 90vw)`, sticky header, `overflow-y: auto`, 24px h-padding

---

## User-facing terminology (UI strings only)

| Code | UI |
|------|----|
| task | ritual |
| overdue | ready for refresh |
| reminder | prompt |
| mark complete | mark kept |
| snooze / nudge | defer |
| skip | pass |
| conflict | overlap |
| dashboard | today |
| autocomplete_enabled | make this a habit |
| refresh (stat label) | due |

---

## Today page layout (web)

Four columns: nav sidebar + three equal content cards

**In Sequence card (left):**
- Stats row at top: KEPT % / DAY STREAK / DUE count
- Ritual list below (today + overdue only, one per task)
- ✓ circle (kept) + ✕ (pass) as only row actions in default state

**Rhythm card (center):**
- Full month calendar heatmap with date numbers
- Spend section below calendar: ACTUAL / PROJECTED / TOTAL + SpendBar

**Shelf card (right):**
- Category filter pills
- Products sorted by urgency (depleted → expired → expiring → low → healthy)
- Compact inline battery bar
- Uses remaining display (not percentage)

**Wide "Coming Up This Week" card:**
- Below rhythm card stats
- Next 3–5 upcoming rituals from Horizon
- No footer stats (those live in In Sequence)

---

## Standing rules — never deviate

1. Never change logic, routing, or schema unless explicitly asked
2. All colors from `lib/colors.ts` — no hardcoded hex in components
3. Never silently swallow Supabase errors — catch, log, surface to user
4. Upserts use explicit `onConflict` targets
5. Date comparisons use local dates — never UTC for display/grouping
6. RLS required on every new table, using `(SELECT auth.uid())` pattern
7. One batch upsert over multiple sequential upserts
8. System templates read-only — copies only
9. No red — use `--refresh` terracotta for alerts
10. All instance queries must include `.eq('archived', false)`
11. `auth.uid()` in RLS policies wrapped as `(SELECT auth.uid())`
12. Never duplicate RLS policies on same table/role/action
13. Product tracking failure never blocks marking a ritual kept
14. Always-together linked tasks skip conflict detection
15. `processInstanceKept()` must run after instance marked kept, not before

---

## Security — Phase 3 complete (May 2026)

- RLS enabled and optimized on all tables
- Admin role: `profiles.app_role`, `is_admin()` function
- New user trigger: `handle_new_user()` auto-creates profile
- Auth middleware protects all routes
- Google OAuth wired behind `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=false`
- OAuth callback at `app/auth/callback/route.ts`
- All foreign keys indexed
- `instances.archived` column in place

**Manual items pending:**
- Update Next.js when PostCSS ≥ 8.5.10 ships
- Set up connection pooling URL in Vercel
- Configure Supabase Auth rate limits
- Enable 2FA on Supabase project owner account

---

## Conflict system

- **No Conflict** — both happen, no cadence change
- **Ask Me Each Time** — prompt on each overlap
- **Auto-Adjust** — Advance (earlier) or Delay (later) by X days, optional snap-back
- **Skip One** — one task skips, both reanchor to conflict date
- **Always Together** — same date, no conflict detection, auto-generates paired instance
- **Every N Occurrences** — paired task fires every Nth occurrence of primary task
- `conflict_intent = 'independent'` → auto-resolve silently, no badge
- Save All Rules → resolves ALL pending conflicts unconditionally
- Proximity detection available per pair with asymmetric direction support

---

## Product tracking

- Usage tracked via `task_products.use_amount_override` or `products.default_use_amount`
- Math link: `total_size_amount ÷ use_amount = uses_per_container`
- Alert fires when `remaining_amount < default_use_amount` (less than 1 full use)
- Display: uses remaining (not %) — "3 of 16 uses left" / "less than 1 use left"
- Restock: pre-populates prior container size, user can override
- Expiration: month/year precision, warns within 30 days
- Reorder URL: optional field, opens in new tab when product is low

---

## Onboarding flow (Phase 5a)

4-step overlay flow on first login:
1. Name → saves to `profiles.display_name`
2. Intent → 'event' (with date) or 'tracking'
3. Setup type → ritual or routine (skippable from here)
4. Template or from scratch → routes to appropriate creation flow

- Skip sets `onboarding_step = 'skipped'`
- Today page shows setup prompt banner for 7 days after skip
- After 7 days: quiet link in Settings
- Re-trigger from Settings re-opens from Step 3 (name/intent already saved)
- `onboarding_completed = TRUE` after first ritual/routine created

---

## Phase roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Core task + instance engine |
| Phase 2 | ✅ Complete | Routines, conflict detection, templates |
| Phase 3 | ✅ Complete | Security, performance, scalability audit |
| Phase 4 | ✅ Complete | Product tracking, shelf, depletion alerts |
| Phase 5a | ✅ Complete | User onboarding flow |
| Phase 5b | 🔜 Next | App experience / mobile optimization |
| Phase 6 | Planned | Reminders & notifications |
| Phase 7 | Planned | Insights & reporting |
| Phase 8 | Planned | Google Calendar integration |
| Phase 9 | Planned | Prep for social layer |

---

## Version history

| Version | Key features |
|---------|-------------|
| Phase 2 | Routines, conflict detection, templates |
| v2.1–v2.4 | Conflict rules persistence, batch save, badge fixes |
| v2.5 | Time of day, twice-daily, order of operations |
| v2.6 | Seed data, suggestions engine |
| v2.7 | Conflict intent layer |
| v2.8 | Proximity timing rules, category colors |
| v2.9 | Today page, mobile atrium, template SQL |
| v2.10 | Horizon page, four-column Today layout |
| v2.11 | Task form restructure, cost model, autocomplete, stub period |
| v2.13 | Today rollback, Horizon dates, ✓/✕ actions, defer rename |
| v2.13 fixes | Analog clock, toggle fix, collapsible form, template tiles |
| Template flow | Three-step use-template → rename → countdown → create |
| Phase 3 | Full security + performance audit, admin role, indexes |
| Phase 4 | Product tracking, DepletionBar, SpendBar, Shelf page |
| v4.1 | Color palette expansion, shelf card, product form fixes |
| v4.2 | Shelf card urgency sort, spend section on Today |
| v4.3 | Shelf card data fix, slide-over width, Sun icon |
| v4.4 | Stats to In Sequence, spend to Rhythm card |
| v4.5 | "Due" label, Sunrise icon for Horizon |
| v4.6 | Uses display, reorder link, category cards on Rituals, linked tasks |
| Phase 5a | Onboarding flow, display_name, Settings page |
