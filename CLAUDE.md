# GlowLoop — Claude Code Project Instructions

This file is read automatically at the start of every Claude Code session.
Follow all instructions here without being asked.

---

## Session startup — always do this first

1. Read this file completely before doing anything else
2. Run `git log --oneline -10` to see what was last worked on
3. Check which prompt file was most recently applied by scanning recent commit messages or asking: "What version are we on?"
4. Resume from where the last session ended — do not ask the user to re-explain the project
5. If context is unclear, check `/mnt/user-data/outputs/` for prompt files (named `glowtracker_v*.md`) or ask the user which version to reference
6. Confirm readiness with a one-line status: "Resuming from v[X.X] — last worked on [feature]. Ready."

---

## Project overview

**App name:** GlowLoop (formerly GlowTracker)
**Stack:** Next.js (App Router) + Supabase + Tailwind CSS
**Purpose:** A self-maintenance ritual tracker — recurring beauty, grooming, and wellness tasks with scheduling, conflict detection, product tracking, and cost management.
**User-facing language:** Calm, editorial, "quiet luxury" — not a beauty influencer app.

---

## Architecture

```
/app                  Next.js App Router pages
  /today              Dashboard / Today page (default route)
  /horizon            All upcoming instances — flat list
  /tasks              Ritual (task) list
  /tasks/[id]         Ritual detail / instance detail
  /tasks/new          Create new ritual (4-section form)
  /routines           Routine (group) list + template tiles
  /routines/[id]      Routine detail (conflict rules, timing rules, timeline)
  /routines/new       Create routine
  /shelf              Product inventory
/components           Shared UI components
/lib                  Business logic
  conflictDetection.ts
  conflictResolution.ts
  costCalculations.ts
  categoryColors.ts
  suggestions.ts
/supabase/migrations  SQL migration files
/supabase/seeds       Seed data SQL files
styles/tokens.css     Design tokens — source of truth for all colors
```

---

## Database — key tables

| Table | Purpose |
|-------|---------|
| `tasks` | Recurring ritual series (user's rituals) |
| `instances` | Individual scheduled occurrences of a task |
| `routines` | Named groups of related tasks |
| `routine_task_pairs` | Per-pair conflict rules within a routine |
| `routine_conflicts` | Detected overlaps between task instances |
| `categories` | Task categories (Skin, Hair, Nails, etc.) |
| `common_tasks` | Reference database of known tasks + cadences |
| `common_task_relationships` | Known conflict/sync pairs between common tasks |
| `user_suggestion_dismissals` | Tracks dismissed suggestion prompts |

### Key column notes
- `tasks.category_id` — UUID FK to `categories`, NOT a text `category` column
- `tasks.frequency_type` — `'interval'` | `'daily'` | `'twice_daily'`
- `tasks.mode` — `'recurring'` | `'countdown'`
- `instances.status` — `'upcoming'` | `'projected'` | `'completed'` | `'skipped'` | `'ready_for_refresh'`
- `routines.conflict_intent` — `'unset'` | `'independent'` | `'managed'`
- `routines.is_system_template` — TRUE for built-in templates owned by Michelle's user ID
- System template user ID: `db24c2d7-e677-45af-add3-a155a87c75e0`

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
--taupe:       #b5a89a   /* alternate accent */
--refresh:     #c08a6e   /* ready for refresh — never red */
```

**Rules:**
- One accent color at a time — never combine sage + bluegrey + taupe
- No red anywhere. `--refresh` (terracotta) replaces red for all alerts
- No pure black — use `--ink` (`#2b2823`)
- No white — use `--paper-soft` for cards, `--cream` for page backgrounds
- No bright Tailwind defaults (`bg-pink-*`, `bg-blue-*`, `bg-purple-*`, etc.)

---

## Typography

```
Headings (h1, h2):    EB Garamond — display serif, source of brand feel
Body / UI:            Inter — clean, neutral
Overline / kicker:    Inter, 10px, weight 600, letter-spacing 0.18em, uppercase, --ink-faint
Margin notes only:    Caveat (handwritten)
```

Hero heading size: 40–48px, line-height 1.05
Section headings inside cards: overline kicker only — no large charcoal heading

---

## UI conventions

### Buttons — one solid per page maximum
| Type | Style |
|------|-------|
| Primary (one per page) | `bg-[--ink] text-[--cream]` rounded-pill |
| Ghost / secondary | `border 1px --ink, transparent fill, --ink text` rounded-pill |
| Text link | No border, no fill, `--ink-soft` color |
| Destructive | Text only, `--ink-soft`, confirm in modal |
| Row actions | Small text, no background, `--ink-soft`, appear on hover |

### Category colors — always use `getCategoryColor()` from `lib/categoryColors.ts`
Never assign Tailwind color classes to category elements. All category dots, pills, and tints come from the centralized color map.

### Cards
- Background: `--paper-soft`
- Border: `1px solid --divider`
- Border-radius: 16px
- Shadow: `0 1px 3px rgba(43,40,35,0.06)`
- Hover: `0 4px 12px rgba(43,40,35,0.08)`, `translateY(-1px)`

### Empty states — always use this template
```
[Italic serif phrase ~22px]
[40px hairline rule, --divider]
[Small caps text link, --ink-faint]
```
Never a floating button alone in an empty card.

### Row actions — progressive disclosure
Default row: name + one primary action visible
Hover/expand: secondary actions (Pass, Defer, Adjust for event, Delete) appear

---

## User-facing terminology (UI strings only — do not rename code variables)

| Internal (code) | User-facing (UI) |
|----------------|-----------------|
| task | ritual |
| instance | (not shown directly) |
| overdue | ready for refresh |
| reminder | prompt |
| mark complete / done | mark kept |
| snooze / nudge | defer |
| skip | pass |
| conflict | overlap |
| dashboard | today |

---

## Standing rules — always follow, never deviate

1. **Never change logic, routing, or schema unless explicitly asked** — UI passes touch styling only
2. **Always use design tokens** — no hardcoded hex values in components (exception: inline styles that reference token values directly)
3. **Never silently swallow Supabase errors** — always catch, log, and surface errors to the user
4. **Upserts use explicit `onConflict` targets** — never plain inserts where a record might already exist
5. **Date comparisons use local dates** — never UTC when grouping or displaying dates to the user. Use `parseLocalDate()` pattern
6. **RLS must be verified** for any new table — every table needs policies for authenticated users
7. **One batch upsert over multiple sequential upserts** — never loop individual saves (race conditions)
8. **System templates are read-only** — never modify `is_system_template = TRUE` records. Copies only
9. **No red** — conflict badges use `--refresh` terracotta tint, not red
10. **No Tailwind color defaults on category or status elements** — always `getCategoryColor()`

---

## Conflict system summary

- **No Conflict** — both tasks happen, no cadence change
- **Ask Me Each Time** — prompt user on each overlap
- **Auto-Adjust** — move one task forward (Delay) or back (Advance) by X days, with optional snap-back
- **Skip One** — one task skips, both reanchor to conflict date
- Detection runs on: task added to routine, instance marked done, instance rescheduled
- `conflict_intent = 'independent'` → auto-resolve all conflicts silently, no badge
- `conflict_intent = 'managed'` → run detection, show pending conflicts
- Save All Rules → marks ALL pending conflicts resolved unconditionally

---

## Version history (prompt files)

| Version | Key features |
|---------|-------------|
| Phase 2 | Routines, conflict detection, templates |
| v2.1 | Inline task creation in routine, dashboard grouping |
| v2.2 | Conflict resolution rename (No Conflict, Skip One, Auto-Adjust) |
| v2.3 | Conflict rules persistence, calendar/expense fixes |
| v2.4 | Conflict badge fix, Save All |
| v2.5 | Time of day, twice-daily tasks, order of operations |
| v2.6 | Seed data (common tasks + relationships), suggestions engine |
| v2.7 | Conflict intent layer, badge fixes |
| v2.8 | Proximity timing rules, category color fix |
| v2.9 | Today page redesign, mobile atrium, template SQL |
| v2.10 | Horizon page, four-column Today layout |
| v2.11 | Task form restructure, cost model, autocomplete, stub period |
| v2.12 | UI refinement pass (partially reverted) |
| v2.13 | Today rollback, Horizon date headers, checkmark/X actions |
| v2.13b | Rhythm calendar revert to full month grid |
| v2.13 fixes | Defer, analog clock, toggle fix, collapsible form sections, atrium template tiles |
| Template flow | Use template → rename → countdown → create routine |

---

## Current known state

- System templates exist in DB owned by `db24c2d7-e677-45af-add3-a155a87c75e0`
- Template task `category_id` values mapped to real category UUIDs
- Conflict rules save via single batch upsert on "Save All Rules"
- Today page: three-column layout (In Sequence / Rhythm / Shelf)
- Horizon: flat list, one instance per task, date group headers in EB Garamond black
- Shelf card on Today: "Product tracking coming soon." placeholder
- Sidebar: "GlowLoop" + "Your routine, on your schedule." tagline, no "RITUAL TRACKER"
- Action icons on Today rows: ✓ circle (kept) + ✕ (pass) — no text labels
