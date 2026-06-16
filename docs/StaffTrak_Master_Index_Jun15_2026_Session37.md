# StaffTrak Master Index & Technical Specification

**Created:** February 1, 2026
**Last Updated:** June 15, 2026 (Session 37 — Interactive Evaluation Overhaul: Plan + Phase 0)
**Company:** ScholarPath Systems
**Status:** ✅ BOTH PRODUCTS DEPLOYED TO PRODUCTION
**StaffTrak Live URL:** https://stafftrak.scholarpathsystems.org
**LeaveTrak Live URL:** https://leavetrak.scholarpathsystems.org
**Timeline:** MVP Testing April–May 2026, Full Launch Fall 2026
**Pilot School:** Summit Learning Charter (virtual school)
**Pilot tenant_id:** `09e6e120-bbac-4516-8483-72b8f331bcd7`
**Supabase project:** `fgbigyffgzqzvksrkqxv` (shared StaffTrak + LeaveTrak)

---

## Session 37 Summary (June 15, 2026)

### Overview
Planned a major interactive overhaul of StaffTrak — turning it from a record-keeping tool into a two-way, time-aware evaluation workspace driven by Summit Learning Charter's *2025–2026 Licensed Evaluation Handbook* — and built and verified **Phase 0** (the evaluation-cycle data foundation). Also fixed the email/password login bug from Session 36's open items (see Session 36).

### 1. Interactive Overhaul — Roadmap (13 enhancements)
Full plan in `docs/StaffTrak_Interactive_Overhaul_Roadmap.md`. The thirteen enhancements:

1. Task checklist with due dates (per person, per cycle)
2. Check-off for each task (auto-checks when linked work is completed)
3. Observation calendar
4. Comment → required staff-response loop (blocks the summative until answered)
5. Initial / Mid-Year / Final feedback boxes (evaluator comments + staff response)
6. Goals carry forward into Mid-Year Review and Summative; **staff update goal data before the meeting** (draft → submitted)
7. Live rubric indicators in a side panel while taking observation notes
8. Summative final score derived from the evaluator's end-of-year rubric (same rubric as the staff self-reflection)
9. ⭐ **Continuous evidence collection** — capture evidence of any standard at any time, tag to indicators, build a year-long body of evidence feeding the summative (centerpiece)
10. ⭐ **Flexible observation types** — walk-throughs, mini-observations, peer learning walks (peer = formative only, per Oregon law) (centerpiece)
11. Media & artifact attachments (photos/docs/links via Supabase Storage)
12. Fast-feedback workflow with a 24-hour turnaround target
13. Growth next-steps tied to goals & professional learning (ODE element 5)

**Confirmed decisions:** Hybrid checklist (auto-seed + editable); required-response comments **block** the summative; **escalating email reminders** to staff with outstanding required responses; Email + In-app notifications; #9 and #10 are the priority centerpieces.

**Recorded future feature (multi-tenant productization):** tenants need self-service (a) **annual staff roll-up** — advance the school year, increment years of service, auto-progress Probationary (Yr 1–3) → Permanent (Yr 4+), bulk-create next year's cycles; and (b) **tenant-configurable due dates / templates** UI. Architecture already supports the dates rolling forward automatically (month/day stored, year computed per cycle; templates are tenant-scoped).

### 2. Phase 0 — Evaluation Cycle Foundation ✅ BUILT & VERIFIED IN PRODUCTION DB

Two SQL migrations were run in the Supabase SQL Editor and verified:

**`supabase/migrations/006_evaluation_cycle_phase0.sql`**
- Enums: `eval_track` (probationary/permanent/modified), `eval_cycle_status`, `eval_task_owner` (staff/evaluator/both), `eval_task_status`
- Tables: `evaluation_cycles`, `task_templates`, `cycle_tasks`
- Functions: `eval_due_date()` (computes a concrete date from school_year + month/day; Aug–Dec → first year, Jan–Jul → second), `generate_cycle_tasks()`, `start_evaluation_cycle()`
- Seed: 20 `task_templates` (11 probationary + 9 permanent) with confirmed **2026–27** dates
- RLS: staff see own cycle; evaluators see caseload (via `profiles.evaluator_id`); HR/admin see all; task check-off restricted to the task owner. Uses existing helpers `get_my_tenant_id()` / `get_my_role()` + new `is_admin_hr()` (roles `hr`, `district_admin`, `school_admin`).

**`supabase/migrations/007_reconcile_evaluation_cycles.sql`**
- A pre-existing (empty, app-unused) `evaluation_cycles` table from earlier work used `workflow_type` instead of `track`, so `006`'s `CREATE TABLE IF NOT EXISTS` had skipped it. `007` dropped the empty table (0 rows, safe) and recreated it with the Phase 0 schema **plus** the richer columns preserved from the old design (`rubric_id`, `summative_score`, `summative_rating`, `staff_signature_at`, `evaluator_signature_at`, `completed_at`) for later phases (#8). Re-attached the `cycle_tasks` FK and recreated RLS policies.

**Verification:** `start_evaluation_cycle('72c2a5bd-...','2026-2027','permanent')` inside a rolled-back transaction generated the correct 9-task permanent checklist with correct owners and dates (Self-Reflection Oct 16, 2026 → Summative June 11, 2027). Year-split logic confirmed.

### 3. 2026–27 Due Dates (seeded)

| Task | Probationary (Yr 1–3) | Permanent (Yr 4+) | Owner |
|------|------------------------|--------------------|-------|
| Self-Reflection | Oct 16 | Oct 16 | Staff |
| Goal Setting (2 SLG + 1 PGG) | Oct 16 | Oct 16 | Staff |
| Initial Goals Meeting | Oct 30 | Oct 30 | Both |
| Pre-Observation | Nov 13 | — | Staff |
| Formal Observation | Dec 4 | — | Evaluator |
| Informal Observation | Mar 1, May 3 | Nov 13, Mar 1, May 3 | Evaluator |
| Post-Observation Form & Feedback | Dec 17 | — | Both |
| Mid-Year Goal Review | Jan 29 | Jan 29 | Both |
| End-of-Year Goal Review | May 28 | May 28 | Both |
| Summative | June 11 | June 11 | Evaluator |

(Min observations: 4 probationary / 2 permanent.)

### Key Technical Facts (Session 37)

1. **`evaluation_cycles` now uses `track` (eval_track enum), not the old `workflow_type`.** The old empty table was replaced in `007`.
2. **Due dates auto-advance each year** — templates store month/day; `eval_due_date()` computes the year. No re-seeding needed for the standard calendar.
3. **Hybrid generation:** `start_evaluation_cycle(staff_id, school_year, track)` creates a cycle and seeds `cycle_tasks` from `task_templates`; HR can then edit/add/remove tasks.
4. **RLS access model for evaluation tables:** staff = `staff_id = auth.uid()`; evaluator = `evaluator_id = auth.uid()` OR staff whose `profiles.evaluator_id = auth.uid()`; HR/admin = `is_admin_hr()`.
5. **Role values in the DB:** `district_admin`, `school_admin`, `hr`, `licensed_staff`, `classified_staff` (+ `is_evaluator` flag, `evaluator_id` link). No standalone `evaluator` role.
6. **ODE compliance guardrails:** keep min formal observation counts; multiple measures from 3 categories; peer/learning-walk evidence is formative-only (`is_formative_only`) and excluded from the summative score.

### ⚠️ Next Steps
- **Phase 1:** build the checklist UI (reads `evaluation_cycles` / `cycle_tasks`) for staff + evaluator.
- Seed **real** 2026–27 cycles for staff (so far only a rolled-back dry run).
- Later phases per roadmap: calendar + live rubric notes (2), evidence + flexible observations (2b ⭐), comment loop + fast feedback (3), goals carry-forward + feedback + rubric-scored summative + growth next-steps (4), notifications (5), QA (6).
- Multi-tenant productization (roll-up + template editor) — recorded for a later phase.

---

## Repositories

| Product | GitHub |
|---------|--------|
| StaffTrak | https://github.com/mmarronetravels-sudo/StaffTrak |
| LeaveTrak | https://github.com/mmarronetravels-sudo/TimeTrak |
| Website | https://github.com/mmarronetravels-sudo/scholarpath-website |

## Session History (recent)

| Session | Date | Key Accomplishments |
|---------|------|---------------------|
| 35 | Mar 14, 2026 | TimeTrak → LeaveTrak rename + website launch |
| 36 | Jun 15, 2026 | Email/password login fix (AuthContext `SIGNED_IN`); test-login access clarified |
| 37 | Jun 15, 2026 | **Interactive overhaul roadmap (13 enhancements) + Phase 0 evaluation-cycle foundation built & verified** |

---

*© 2026 StaffTrak & LeaveTrak / ScholarPath Systems. All rights reserved.*
