# StaffTrak Interactive Overhaul — Implementation Roadmap

**Prepared:** June 15, 2026
**For:** ScholarPath Systems / Summit Learning Charter
**Goal:** Turn StaffTrak from a record-keeping tool into an interactive, two-way communication workspace that walks each staff member and their supervisor through the SLC evaluation cycle, on schedule.
**Target:** All thirteen enhancements live and QA'd before the Fall 2026 staff rollout. (#9 Continuous Evidence and #10 Flexible Observation Types are the priority centerpieces — they change the character of the system from compliance-checklist to growth-driving evidence.)
**Source of truth for process:** *2025–2026 Licensed Evaluation Handbook* (Summit Learning Charter).

---

## 1. What we're building (in one paragraph)

Today StaffTrak stores goals, observations, meetings, and summatives as separate records. The handbook describes them as one connected **cycle** with deadlines, hand-offs between staff and supervisor, and required back-and-forth. This overhaul introduces a per-person **evaluation cycle** as the backbone, hangs a **task checklist with due dates** off it, surfaces **observations on a calendar**, forces a **comment → staff-response loop** after observations, gives clean **initial / mid-year / final feedback** spaces, **carries goals forward** into the mid-year and summative reviews, puts **live rubric indicators** alongside observation notes, and **derives the summative score from the evaluator's end-of-year rubric** — all tied together with **email + in-app notifications** so nothing is missed.

A second wave (#9–#13), driven by evaluator feedback, reframes observations from a check-off event into a **continuous, evidence-rich, growth-steering process**: capture evidence of any standard being met at any time and from any source, support flexible observation types (walk-throughs, mini-observations, peer learning walks), attach photos/docs/resources, speed feedback toward a 24-hour turnaround, and turn each observation into concrete next steps tied to goals and professional learning. Crucially, this layers on top of the required structure — it does not replace the ODE compliance floor.

---

## 2. The evaluation cycle this must model (from the handbook)

Five phases, two tracks. Every task below becomes a checklist item with an owner and a due date.

> **✅ Dates below are the confirmed 2026–27 due dates** (from Melanie's Licensed Staff WorkFlow table). These seed the task templates.

### Probationary track (Years 1–3)

| Task | Owner | Due (2026–27) | Links to |
|------|-------|---------------|----------|
| Self-Reflection | Staff | Oct 16 | Self-Reflection page |
| Goal Setting (2 SLG + 1 PGG) | Staff | Oct 16 | Goals page |
| Initial Goals Meeting | Staff + Supervisor | Oct 30 | Meetings + Initial feedback |
| Pre-Observation | Staff | Nov 13 | Observation record |
| Formal Observation | Supervisor | Dec 4 | Observation + calendar |
| Post-Observation Form & Feedback | Staff + Supervisor | Dec 17 | Comment/response loop |
| Mid-Year Goal Review | Staff + Supervisor | Jan 29 | Meetings + Mid-year feedback + Goals |
| Informal Observation | Supervisor | Mar 1 | Observation + calendar |
| Informal Observation | Supervisor | May 3 | Observation + calendar |
| End-of-Year Goal Review | Staff + Supervisor | May 28 | Meetings + Goals |
| Summative | Supervisor | June 11 | Summative + Final feedback + Goals + Rubric |

(Minimum **4** observations/year for probationary staff.)

### Permanent track (Year 4+)

| Task | Owner | Due (2026–27) | Links to |
|------|-------|---------------|----------|
| Self-Reflection | Staff | Oct 16 | Self-Reflection page |
| Goal Setting (2 SLG + 1 PGG) | Staff | Oct 16 | Goals page |
| Initial Goals Meeting | Staff + Supervisor | Oct 30 | Meetings + Initial feedback |
| Informal Observation | Supervisor | Nov 13 | Observation + calendar |
| Mid-Year Goal Review | Staff + Supervisor | Jan 29 | Meetings + Mid-year feedback + Goals |
| Informal Observation | Supervisor | Mar 1 | Observation + calendar |
| Informal Observation | Supervisor | May 3 | Observation + calendar |
| End-of-Year Goal Review | Staff + Supervisor | May 28 | Meetings + Goals |
| Summative | Supervisor | June 11 | Summative + Final feedback + Goals + Rubric |

(Minimum **2** observations/year for non-probationary staff.)

**Modified cycles:** mid-year hires get a variable task list set by HR — this is exactly why the checklist must be editable, not fully hard-coded (see Hybrid model below).

---

## 3. The five enhancements, mapped

### #1 + #2 — Task checklist with due dates + check-off

A single shared checklist per person per school year, visible to both the staff member and their evaluator, each seeing the tasks they own plus shared ones. Each row shows title, owner, due date, status, and a link to the page where the work actually happens. Checking a task complete is a one-click action; completing the underlying work (e.g., submitting the Self-Reflection) can auto-check the linked task.

- **Checklist source — Hybrid (recommended):** the system seeds the standard task list from the track template (above), then HR/evaluators can edit due dates, add one-off tasks, or remove inapplicable ones (for modified cycles).
- **Existing pieces reused:** `goals`, `self_assessments`, `observations`, `meetings`, `summative_evaluations` already exist — tasks link to these rather than duplicating them.

### #3 — Calendar of upcoming observations

The `observations` table already has `scheduled_at`, `type`, and `status`, so the data exists. We add a month/agenda calendar view. Evaluators see all observations they've scheduled across their caseload; staff see their own upcoming observations. Scheduled-but-not-done observations also appear as checklist items with due dates, so the calendar and checklist stay in sync.

### #4 — Comment → required staff response loop

After an observation, the evaluator leaves feedback and can flag specific comments as **requiring a response**. The staff member sees these on their dashboard and on the observation, and must reply (answer a prompting question, acknowledge, or add follow-up) before the item is considered closed. This is the core "two-way" mechanic. Threading lets the conversation continue.

**Hard rule (confirmed):** an unanswered "requires response" comment **blocks the Summative from being finalized** for that staff member. The Summative screen shows the evaluator exactly which open items are holding it up. **Escalating email reminders** go to any staff member with an outstanding required response (e.g., on a recurring cadence until answered), so items don't sit open as the June 5 summative deadline approaches.

- **Existing pieces:** `observation_notes` / `observation_note_tags` exist and can be extended, or a dedicated `observation_threads` table added for clean threading + response tracking.

### #5 — Initial / Mid-Year / Final feedback text boxes

Three clearly labeled, phase-specific feedback spaces tied to the cycle: **Initial** (at the Initial Goals Meeting), **Mid-Year** (at the Mid-Year Conference), and **Final** (at the Summative). Each is an evaluator-written box plus a staff acknowledgment/response box, with timestamps and a "signed/acknowledged" state — mirroring the handbook's conference structure. `summative_evaluations` already has `comments`/`feedback` for the Final; Initial and Mid-Year are the new additions.

**Evaluator meeting comments (confirmed requirement).** The Mid-Year and Final (Summative) boxes are exactly where the evaluator records comments for those meetings. These comment fields are tied to the corresponding `meetings` record, so the mid-year and summative conferences each carry the evaluator's written notes alongside the staff member's pre-submitted goal data (#6). The evaluator can draft these before the meeting and finalize after.

### #6 — Goals carry forward into Mid-Year Review and Summative

The goals a staff member sets (2 SLG + 1 PGG) should **auto-populate** into the Mid-Year Goal Review and the End-of-Year Summative rather than being re-entered. At those two checkpoints, each goal appears with its original text plus space to record **progress / status** (mid-year) and **final outcome / met-or-not** (summative). One source of truth for goals; the review screens read and annotate them.

**Staff update their goal data BEFORE the meeting (confirmed requirement).** The mid-year and end-of-year goal-progress entries are **owned and editable by the staff member**, and they can fill them in any time *ahead of* the corresponding conference — this is pre-meeting prep so the evaluator walks into the meeting having already seen the staff member's self-reported progress. Flow: staff entry is a **draft** they can edit freely until they **submit** it (or until the meeting date), at which point the evaluator sees it. This becomes its own checklist task with a due date a few days before the Mid-Year Review (Jan 29) and End-of-Year Review (May 28) so staff are prompted to complete it in time.

- **Existing pieces:** `goals` already exists. The new `goal_reviews` table (see §4) holds the per-phase staff progress entry with a draft/submitted state, keyed to the cycle phase, so the same goal shows up at each conference with its evolving, staff-authored status.

### #7 — Live rubric indicators while taking observation notes

While an evaluator takes notes during an observation, the **rubric indicators appear in a side panel** so they can mark which indicators are being observed and tag a note to a specific indicator. This turns raw notes into structured evidence mapped to the rubric — which then feeds the summative score (#8).

- **Existing pieces:** `rubrics` / `rubric_domains` / `rubric_standards` hold the indicators; `observation_notes` / `observation_note_tags` already exist for tagging. The work is a split-screen `ObservationSession` UI (notes on one side, indicator checklist on the other) that writes those tags.

### #8 — Summative final score derived from the evaluator's rubric

At year-end the **evaluator completes the same rubric the staff member used for self-reflection**, and the **summative final score is computed from the evaluator's rubric ratings** (rather than entered free-hand). The self-reflection and the evaluator's end-of-year rubric sit side by side so the conversation compares the two. Observation evidence tagged to indicators (#7) supports each rating.

- **Existing pieces:** `self_assessments` + `rubrics` already power the staff self-reflection; we reuse the same rubric for an evaluator-completed end-of-year assessment and roll its ratings into `summative_evaluations.final_score`.

---

> **Second wave (#9–#13) — from evaluator feedback.** These reframe observations from a compliance check-off into a continuous, evidence-driven, growth process. Everything below is grounded in the handbook (drop-in observations "at any time," walk-throughs, PLC work, "Artifacts of Teaching and Learning," Multiple Measures) and stays within ODE rules. **#9 and #10 are the priority centerpieces.**

### #9 — Continuous evidence collection ⭐ (centerpiece)

A way to capture evidence of **any standard/indicator being met, at any time, from any source** — a walk-through, a lesson artifact, a PLC note, student data, an email — and tag it to a rubric indicator. Over the year this accumulates a **body of evidence per standard** that feeds the Summative (#8), so the final rating is backed by a year of evidence rather than a couple of formal observations. This is the direct answer to "capture standards outside the formal observation" and "move from a checklist to a valuable resource," and it satisfies ODE's **Multiple Measures** requirement (evidence from professional practice, professional responsibilities, and student learning & growth).

- **New table:** `evidence_items` (see §4). Evidence can be standalone or attached to an observation, and one item can map to multiple indicators.
- **Feeds:** the evaluator's end-of-year rubric (#8) shows the collected evidence next to each standard as justification for the rating.

### #10 — Flexible observation types ⭐ (centerpiece)

Beyond the current Formal/Informal split, support **Walk-through / mini-observation** (fast, mobile, a few indicator taps + a note) and **Learning Walk** (peer, growth-oriented). Each type has fields suited to its purpose, and the short types are built for ten-second capture so they reduce — not add — workload.

- **Compliance guardrail:** under Oregon law, **peer / learning-walk evidence is formative only** and must **not** feed the summative score. The system tags each observation's type and enforces that only evaluator formal/informal evidence rolls into #8. The minimum **formal** observation counts (4 probationary / 2 permanent) remain the compliance floor; new types are additive.
- **Existing pieces:** `observations.type` already exists — we extend the allowed types and the per-type UI.

### #11 — Media & artifact attachments

Attach **photos, documents, and resource links** to observations and evidence items. Brings the feedback to life and gives the teacher concrete artifacts to respond to.

- **New:** Supabase **Storage** bucket + an `attachments` table (or `attachments` JSON on evidence/observation rows) with tenant-scoped access.

### #12 — Fast-feedback workflow (24-hour turnaround)

Streamlined feedback entry — mobile-friendly, indicator-tagged, with **reusable comment/standard snippets** so common feedback is one tap. A visible **"feedback delivered within X hours"** timestamp, plus a gentle nudge to the evaluator toward a 24-hour target. Makes feedback timeliness something you can actually measure.

- **Existing pieces:** builds on `observations.feedback` and the notification system (#5 wave).

### #13 — Growth next-steps tied to goals & PD

Each observation can generate concrete **action items / next steps** linked to the teacher's goals and to professional learning — closing the loop on ODE's fifth required element, **Aligned Professional Learning**. This is what turns feedback into improvement instead of a record.

- **New:** `action_items` table linking an observation/evidence item to a `goal_id` and/or a PD reference, with a status the teacher and evaluator both track.

---

## 4. Data model changes

New tables (all `tenant_id`-scoped, RLS on, consistent with current architecture):

- **`evaluation_cycles`** — one row per staff member per school year. Fields: `staff_id`, `evaluator_id`, `school_year`, `track` (probationary/permanent/modified), `status`, `start_date`, `end_date`. This is the backbone everything else hangs from.
- **`task_templates`** — the standard task definitions per track (seeded from §2). Drives Hybrid auto-generation.
- **`cycle_tasks`** — the actual checklist items. Fields: `cycle_id`, `task_key`, `title`, `owner_role` (staff/evaluator/both), `due_date`, `status` (not_started/in_progress/complete), `completed_at`, `completed_by`, `linked_table` + `linked_id` (to jump to the real work), `sort_order`, `is_custom`.
- **`evaluation_feedback`** — Initial/Mid-Year/Final boxes. Fields: `cycle_id`, `phase`, `evaluator_text`, `staff_response`, `evaluator_signed_at`, `staff_acknowledged_at`.
- **`observation_threads`** (or extend `observation_notes`) — the comment/response loop. Fields: `observation_id`, `author_id`, `body`, `requires_response` (bool), `parent_id` (threading), `resolved_at`, `created_at`.
- **`goal_reviews`** (#6) — **staff-authored** progress/outcome per goal per phase, editable before the meeting. Fields: `goal_id`, `cycle_id`, `phase` (mid_year/final), `progress_note`, `status` (on_track/met/not_met/revised), `entry_state` (draft/submitted), `submitted_at`, `updated_at`. RLS: the staff member owns and edits their own rows; the evaluator has read access (and sees drafts as read-only). (Alternative: phase columns on `goals` — `goal_reviews` keeps history cleaner.)
- **`evaluator_rubric_assessments`** (#8) — the evaluator's end-of-year rubric, parallel to `self_assessments`. Fields: `cycle_id`, `staff_id`, `evaluator_id`, `rubric_id`, per-standard ratings, computed `final_score`. Feeds `summative_evaluations.final_score`.
- **`evidence_items`** (#9) — continuous evidence. Fields: `tenant_id`, `cycle_id`, `staff_id`, `author_id`, `source_type` (observation/walkthrough/artifact/plc/student_data/other), `body`, `observation_id` (nullable link), `is_formative_only` (bool — true for peer/learning-walk so it's excluded from the summative roll-up), `created_at`.
- **`evidence_indicator_tags`** (#9) — many-to-many from an evidence item to rubric indicators/standards. Fields: `evidence_id`, `rubric_standard_id`. This is what builds the per-standard body of evidence.
- **`attachments`** (#11) — `tenant_id`, `owner_table` (observations/evidence_items), `owner_id`, `storage_path`, `kind` (photo/doc/link), `url`, `uploaded_by`. Backed by a Supabase Storage bucket with tenant-scoped policies.
- **`action_items`** (#13) — `tenant_id`, `cycle_id`, `observation_id` (nullable), `goal_id` (nullable), `pd_reference`, `description`, `status` (open/in_progress/done), `owner_id`, `due_date`. The growth next-steps that tie feedback to goals and professional learning.

Extensions to existing tables:

- **`observations`** — confirm/extend `scheduled_at`, `type`, `status` to cover the calendar and the scheduled→completed lifecycle; extend `type` to add `walkthrough` and `learning_walk` (#10), and add `feedback_delivered_at` for the turnaround timestamp (#12).
- **`observation_note_tags`** (#7) — confirm it links a note to a `rubric_standard`/indicator; this is what the side-panel indicator picker writes. The same tagging model generalizes into `evidence_indicator_tags` (#9).
- **`summative_evaluations`** (#8) — `final_score` becomes a computed roll-up of the evaluator's rubric ratings rather than a free-entry number.
- **`notifications`** — a `notifications` table already exists on the HR side; reuse it for in-app alerts (task due, comment needs response, feedback posted).

---

## 5. Notifications (Email + In-App)

You chose **Email + In-App**, and the `send-email` Edge Function + a `notifications` table already exist. Triggers:

- Task assigned / due soon / overdue → owner
- Observation scheduled → staff
- Evaluator comment requires a response → staff
- **Required response still unanswered → escalating reminder emails to staff** on a recurring cadence until answered (these are the blockers for the Summative)
- Staff responds → evaluator
- Initial/Mid-Year/Final feedback posted → staff (and staff acknowledgment → evaluator)

In-app: a bell/badge in the navbar + a "Needs your attention" panel on the Dashboard. Email: digest-style or per-event (decision in Phase 5).

---

## 6. Phased build plan

Since everything must ship before fall, the work is sequenced so each phase is usable on its own and later phases build on earlier ones.

| Phase | Deliverable | Notes |
|-------|-------------|-------|
| **0. Foundation** | `evaluation_cycles`, `task_templates`, `cycle_tasks` tables + RLS + Hybrid seeding logic + an HR screen to start/seed a cycle | Nothing else works without this backbone |
| **1. Checklist + check-off** (#1, #2) | Shared checklist UI for staff + evaluator; auto-check on linked-work completion | Highest day-to-day value |
| **2. Observation calendar + live rubric notes** (#3, #7) | Month/agenda calendar; scheduling flow; split-screen `ObservationSession` with indicator side-panel + note tagging | Calendar is UI on existing data; rubric panel feeds #8 and #9 |
| **2b. Evidence + flexible observations** ⭐ (#9, #10, #11) | `evidence_items` + `evidence_indicator_tags`; per-standard evidence view; walk-through/mini + learning-walk types with formative-only tagging; media attachments via Supabase Storage | **Priority centerpiece.** Builds directly on the #7 tagging model; reframes the whole observation layer |
| **3. Comment→response loop + fast feedback** (#4, #12) | Threaded observation comments, `requires_response`, resolution tracking, **escalating staff reminder emails**; streamlined mobile feedback entry, snippets, `feedback_delivered_at` 24-hr turnaround timestamp | The core two-way mechanic + timeliness |
| **4. Goals carry-forward + Initial/Mid/Final feedback + rubric-scored summative + growth next-steps** (#5, #6, #8, #13) | `goal_reviews`; three phase feedback UIs; evaluator end-of-year rubric driving `final_score` (fed by #9 evidence); `action_items` linking feedback to goals + PD; **Summative finalize blocked while any required response is open** | Ties goals, evidence, rubric, feedback, and growth into the summative |
| **5. Notifications** | Wire email + in-app across all triggers above | Touches every phase, so it comes after them |
| **6. QA + rollout** | Test as teacher (`teacher-test@summitlc.org`) and admin; seed 2026–27 cycle; load real staff | Use both test logins to validate every role view |

A reasonable calendar: Phases 0–1 first (the backbone + the headline feature), 2–4 next, 5–6 to close out — comfortably ahead of a fall rollout with time for a pilot dry-run.

---

## 7. Decisions

**Resolved**

- ✅ **Checklist source = Hybrid** — auto-seed the standard list per track; HR/evaluators can edit dates, add, or remove tasks.
- ✅ **Unanswered required-response comments BLOCK the Summative** from being finalized.
- ✅ **Escalating email reminders** go to staff with an outstanding required response until it's answered.
- ⏳ **2026–27 due dates** — pending from Melanie; will seed the task templates.

**Still open**

1. **School year roll-over** — start each year's cycles in bulk ("start 2026–27 cycles" for HR) or per-person? (Recommend bulk with per-person edits.)
2. **Who can edit due dates** — HR only, or evaluators too?
3. **Reminder cadence** — how often the escalating staff reminders fire (e.g., every 3 days, then daily in the final week before June 5) and whether the evaluator is CC'd.
4. **Other notification cadence** — per-event vs. daily digest for routine due/overdue task nudges.
5. **Counselor track** — the handbook has a separate School Counselor self-reflection/eval form; give counselors a distinct (third) template? (Likely yes — easy to add.)

---

## 7b. Multi-tenant productization (future — recorded for later)

StaffTrak is a multi-tenant SaaS product: every school/district that uses it must be able to run its own evaluation cycle year after year without engineering help. Two self-service capabilities are required (not yet built):

1. **Annual staff roll-up.** A tenant-level action that advances the school year: increments each staff member's **years of service**, auto-progresses staff from the **Probationary track (Yr 1–3) to Permanent (Yr 4+)** at year 4, and **bulk-creates next year's cycles** for all active staff. Track assignment should derive from `hire_date` / years of service rather than being set by hand. (Handbook allows modified cycles for mid-year hires, so the roll-up must support exceptions.)
2. **Tenant-configurable due dates & templates.** Each tenant edits its own `task_templates` — due dates, task titles, which tasks apply — through an admin UI, since dates shift every year and differ by district.

**Already in place / supporting this:**
- `task_templates` are **tenant-scoped**, so each tenant keeps its own task list and dates.
- Due dates are stored as **month/day**; the concrete year is computed per cycle, so **dates roll forward automatically each year** — no re-entry needed for the standard calendar.
- The **Hybrid** model already allows per-cycle edits; this just extends editing up to the template level via UI.

**Still needed:** a `years_of_service` (or computed-from-`hire_date`) concept driving track assignment; a "Start school year 20XX–XX" bulk roll-up routine; and an admin **Templates** screen. Slot as a dedicated productization phase after the core eight-then-thirteen features land.

---

## 8. Risks & mitigations

- **RLS complexity** — staff must see only their cycle; evaluators only their caseload; HR everything. Mitigation: model access off the existing `evaluator_id` on `profiles` and the established `tenant_id` pattern; test with the teacher and admin test logins.
- **Don't duplicate existing records** — tasks/feedback must *link* to existing goals/observations/summatives, not copy them. Mitigation: `linked_table`/`linked_id` on tasks.
- **Modified cycles** — mid-year hires break a rigid template. Mitigation: Hybrid editability is a hard requirement, not a nice-to-have.
- **Scope creep before fall** — thirteen features is a lot. Mitigation: each phase ships independently, so even if one slips the rest are usable. #9/#10 are prioritized; #11–#13 can trail if needed.
- **ODE compliance must hold while we add flexibility (#9, #10)** — the redesign must still satisfy the five required elements and Multiple Measures from all three categories, keep the minimum formal observation counts (4 probationary / 2 permanent), and treat **peer / learning-walk evidence as formative only** (excluded from the summative score per Oregon law). Mitigation: `is_formative_only` flag on evidence + observation `type` gating what rolls into `final_score`; new observation types are additive on top of the required floor, never a replacement.

---

*Prepared for review. On approval, Phase 0 (the cycle + checklist data model) is the first build step.*
