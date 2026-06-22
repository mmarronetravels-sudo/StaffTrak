import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ============================================================
// gcal-sync — mirror StaffTrak observations/meetings onto Google Calendars.
// ------------------------------------------------------------
// Invoked by a Postgres row trigger (pg_net) on the `observations` and
// `meetings` tables (INSERT / UPDATE / DELETE). For each change we create,
// patch, or delete an event on TWO calendars:
//   • the staff member's own Google Calendar, and
//   • the "other" party's calendar — the OBSERVER (observations) or the
//     EVALUATOR (meetings).  (Added S66.)
//
// AUTH MODEL — domain-wide delegation. A Google Cloud service account is granted
// domain-wide delegation in the Summit Workspace admin console for the single
// scope https://www.googleapis.com/auth/calendar.events. This function signs a
// JWT that impersonates each person (sub = their @summitlc.org email) and
// exchanges it for an access token, so each event is created AS that person on
// their primary calendar — no per-user consent prompts, no calendar invites.
// The other-party event is best-effort: if that person is not on a delegated
// domain (token exchange fails) we log and skip it without failing the staff event.
//
// The row->event mapping lives in `gcal_event_links` (035 + 038), NOT on the
// observations/meetings rows — writing back to those rows would loop the trigger.
// One link row now holds BOTH event ids: gcal_event_id (staff) and
// other_gcal_event_id (observer/evaluator).
//
// SECRETS (supabase secrets set ...):
//   GCAL_SA_CLIENT_EMAIL   service account client_email
//   GCAL_SA_PRIVATE_KEY    service account private key (PEM, keep the \n)
//   GCAL_WEBHOOK_SECRET    shared secret; must match the trigger's
//                          Authorization: Bearer <secret> header
//   GCAL_TIME_ZONE         (optional) IANA tz, default America/Los_Angeles
//   GCAL_OBS_MINUTES       (optional) observation duration, default 45
//   GCAL_MEETING_MINUTES   (optional) meeting duration, default 60
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (auto-injected)
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const SA_EMAIL = Deno.env.get("GCAL_SA_CLIENT_EMAIL") || ""
const SA_KEY = Deno.env.get("GCAL_SA_PRIVATE_KEY") || ""
const WEBHOOK_SECRET = Deno.env.get("GCAL_WEBHOOK_SECRET") || ""
const TIME_ZONE = Deno.env.get("GCAL_TIME_ZONE") || "America/Los_Angeles"
const OBS_MINUTES = Number(Deno.env.get("GCAL_OBS_MINUTES") || "45")
const MEETING_MINUTES = Number(Deno.env.get("GCAL_MEETING_MINUTES") || "60")

const SCOPE = "https://www.googleapis.com/auth/calendar.events"
const TOKEN_URL = "https://oauth2.googleapis.com/token"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
}
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: cors })

// Observation type -> human label (mirrors src/lib/observationTypes.js).
const OBS_LABELS: Record<string, string> = {
  formal: "Formal",
  informal: "Informal",
  walkthrough: "Walk-through",
  mini_observation: "Mini-Observation",
  learning_walk: "Learning Walk",
}
const obsLabel = (t?: string) =>
  (t && OBS_LABELS[t]) ||
  (t ? t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, " ") : "Observation")

const MEETING_LABELS: Record<string, string> = {
  initial_goals: "Initial Goals Meeting",
  mid_year: "Mid-Year Review",
  end_year: "End-of-Year Review",
}
const meetingLabel = (t?: string) =>
  (t && MEETING_LABELS[t]) ||
  (t ? t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, " ") : "Meeting")

// ── Google delegated access token via signed JWT (RS256) ──────────────────
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "")
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

function b64url(bytes: Uint8Array): string {
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
const b64urlStr = (s: string) => b64url(new TextEncoder().encode(s))

const tokenCache = new Map<string, { token: string; exp: number }>()

async function getDelegatedToken(subjectEmail: string): Promise<string> {
  const cached = tokenCache.get(subjectEmail)
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.exp - 60 > now) return cached.token

  if (!SA_EMAIL || !SA_KEY) throw new Error("Service account secrets not configured")

  const header = { alg: "RS256", typ: "JWT" }
  const claim = {
    iss: SA_EMAIL,
    sub: subjectEmail, // impersonate this person
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }
  const unsigned = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(claim))}`

  const key = await crypto.subtle.importKey(
    "pkcs8",
    // secrets often store \n literally — normalize to real newlines.
    pemToArrayBuffer(SA_KEY.replace(/\\n/g, "\n")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)),
  )
  const assertion = `${unsigned}.${b64url(sig)}`

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  })
  const body = await res.json()
  if (!res.ok || !body.access_token) {
    throw new Error(`Token exchange failed for ${subjectEmail}: ${JSON.stringify(body)}`)
  }
  tokenCache.set(subjectEmail, { token: body.access_token, exp: now + (body.expires_in || 3600) })
  return body.access_token
}

// ── Calendar API helpers (act on the impersonated user's primary calendar) ──
const CAL_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

async function gcalInsert(token: string, event: unknown): Promise<string> {
  const res = await fetch(CAL_BASE, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(event),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`insert failed: ${JSON.stringify(body)}`)
  return body.id
}

async function gcalPatch(token: string, eventId: string, event: unknown): Promise<void> {
  const res = await fetch(`${CAL_BASE}/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(event),
  })
  if (!res.ok && res.status !== 404) throw new Error(`patch failed: ${await res.text()}`)
  // 404 → event was deleted out from under us; caller will recreate.
  if (res.status === 404) throw Object.assign(new Error("event_not_found"), { code: 404 })
}

async function gcalDelete(token: string, eventId: string): Promise<void> {
  const res = await fetch(`${CAL_BASE}/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  })
  // 404/410 = already gone; treat as success.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`delete failed: ${await res.text()}`)
  }
}

// Create / patch / recreate one event on one person's calendar.
async function syncEvent(
  email: string,
  existingEventId: string | undefined | null,
  eventBody: unknown,
): Promise<{ eventId: string; action: string }> {
  const token = await getDelegatedToken(email)
  if (existingEventId) {
    try {
      await gcalPatch(token, existingEventId, eventBody)
      return { eventId: existingEventId, action: "updated" }
    } catch (e) {
      if ((e as { code?: number }).code === 404) {
        const id = await gcalInsert(token, eventBody) // recreate if it vanished
        return { eventId: id, action: "recreated" }
      }
      throw e
    }
  }
  const id = await gcalInsert(token, eventBody)
  return { eventId: id, action: "created" }
}

// Best-effort delete; never throws.
async function safeDelete(email: string | null | undefined, eventId: string | null | undefined) {
  if (!email || !eventId) return
  try {
    const token = await getDelegatedToken(email)
    await gcalDelete(token, eventId)
  } catch (e) {
    console.error("gcal-sync: delete error", (e as Error).message)
  }
}

// ── Build the Google event body from a StaffTrak row ──────────────────────
// audience "staff"  → the event on the staff member's own calendar
// audience "other"  → the event on the observer/evaluator's calendar
type Row = Record<string, unknown>

function buildEvent(
  table: string,
  row: Row,
  audience: "staff" | "other",
  staffName: string,
  otherName: string,
) {
  const startISO = String(row.scheduled_at)
  const start = new Date(startISO)
  const minutes = table === "observations" ? OBS_MINUTES : MEETING_MINUTES
  const end = new Date(start.getTime() + minutes * 60_000)

  let summary: string
  const lines: string[] = []

  if (table === "observations") {
    const label = obsLabel(row.observation_type as string)
    if (audience === "staff") {
      summary = `${label} Observation`
      if (otherName) lines.push(`Observer: ${otherName}`)
    } else {
      // Observer's calendar — include who they're observing.
      summary = staffName ? `${label} Observation — ${staffName}` : `${label} Observation`
      if (staffName) lines.push(`Staff: ${staffName}`)
    }
    if (row.subject_topic) lines.push(`Subject/Topic: ${row.subject_topic}`)
    if (row.is_formative_only) lines.push("Formative only — not counted toward the summative score.")
  } else {
    const label = meetingLabel(row.meeting_type as string)
    if (audience === "staff") {
      summary = label
      if (otherName) lines.push(`With: ${otherName}`)
    } else {
      // Evaluator's calendar — include who the meeting is with.
      summary = staffName ? `${label} — ${staffName}` : label
      if (staffName) lines.push(`With: ${staffName}`)
    }
  }
  lines.push("", "Scheduled via StaffTrak.")

  const event: Record<string, unknown> = {
    summary,
    description: lines.join("\n"),
    start: { dateTime: start.toISOString(), timeZone: TIME_ZONE },
    end: { dateTime: end.toISOString(), timeZone: TIME_ZONE },
    // A stable tag so these are identifiable as StaffTrak-managed events.
    extendedProperties: { private: { stafftrak: `${table}:${row.id}` } },
    source: { title: "StaffTrak", url: "https://stafftrak.scholarpathsystems.org" },
  }
  if (table === "observations" && row.location) event.location = String(row.location)
  return event
}

// A row should have a calendar event when it's scheduled and not cancelled.
const wantsEvent = (row: Row | null) =>
  !!row && !!row.scheduled_at && row.status !== "cancelled"

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  // Verify the webhook shared secret (configured as the Authorization header).
  const auth = req.headers.get("Authorization") || ""
  const presented = auth.replace(/^Bearer\s+/i, "")
  if (!WEBHOOK_SECRET || presented !== WEBHOOK_SECRET) {
    return json({ error: "Unauthorized" }, 401)
  }

  try {
    const payload = await req.json() as {
      type: "INSERT" | "UPDATE" | "DELETE"
      table: string
      record: Row | null
      old_record: Row | null
    }
    const { type, table } = payload
    if (table !== "observations" && table !== "meetings") {
      return json({ skipped: "unsupported table" })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const newRow = payload.record
    const oldRow = payload.old_record
    const sourceId = String((newRow || oldRow)?.id)

    const { data: existingLink } = await admin
      .from("gcal_event_links")
      .select("*")
      .eq("source_table", table)
      .eq("source_id", sourceId)
      .maybeSingle()

    // ── DELETE, or the row no longer warrants an event → remove BOTH events
    if (type === "DELETE" || !wantsEvent(newRow)) {
      if (existingLink) {
        await safeDelete(existingLink.staff_email, existingLink.gcal_event_id)
        await safeDelete(existingLink.other_email, existingLink.other_gcal_event_id)
        await admin.from("gcal_event_links").delete()
          .eq("source_table", table).eq("source_id", sourceId)
      }
      return json({ ok: true, action: "deleted" })
    }

    // ── INSERT / UPDATE with a live scheduled event ──
    const row = newRow as Row
    const staffId = String(row.staff_id)
    const otherId = String(table === "observations" ? row.observer_id : row.evaluator_id)

    const { data: people } = await admin
      .from("profiles")
      .select("id, full_name, email, tenant_id")
      .in("id", [staffId, otherId])
    const staff = people?.find((p) => p.id === staffId)
    const other = people?.find((p) => p.id === otherId)

    if (!staff?.email && !other?.email) {
      console.error("gcal-sync: neither party has an email", { staffId, otherId })
      return json({ error: "no addressable calendars" }, 200) // don't retry-storm
    }

    // Both calendars are INDEPENDENT and BEST-EFFORT: a failure on one party's
    // calendar (e.g. an unprovisioned / non-delegated mailbox) must never block
    // the other party's event. We persist the link row if EITHER succeeds, and
    // only return 500 when BOTH fail.

    // 1) Staff member's calendar (best-effort).
    let staffEmail: string | null = existingLink?.staff_email ?? null
    let staffEventId: string | null = existingLink?.gcal_event_id ?? null
    let staffAction = "skipped"

    if (staff?.email) {
      try {
        if (staffEventId && staffEmail && staffEmail !== staff.email) {
          await safeDelete(staffEmail, staffEventId)
          staffEventId = null
        }
        const staffEvent = buildEvent(table, row, "staff", staff.full_name || "", other?.full_name || "")
        const r = await syncEvent(staff.email, staffEventId, staffEvent)
        staffEventId = r.eventId
        staffEmail = staff.email
        staffAction = r.action
      } catch (e) {
        console.error("gcal-sync: staff-calendar error", (e as Error).message)
        staffAction = "error"
      }
    } else if (staffEventId && staffEmail) {
      await safeDelete(staffEmail, staffEventId)
      staffEmail = null
      staffEventId = null
      staffAction = "deleted_staff"
    }

    // 2) Observer/Evaluator's calendar (best-effort).
    let otherEmail: string | null = existingLink?.other_email ?? null
    let otherEventId: string | null = existingLink?.other_gcal_event_id ?? null
    let otherAction = "skipped"

    if (other?.email) {
      try {
        // Reassigned to a different person → remove the stale event first.
        if (otherEventId && otherEmail && otherEmail !== other.email) {
          await safeDelete(otherEmail, otherEventId)
          otherEventId = null
        }
        const otherEvent = buildEvent(table, row, "other", staff?.full_name || "", other.full_name || "")
        const r = await syncEvent(other.email, otherEventId, otherEvent)
        otherEventId = r.eventId
        otherEmail = other.email
        otherAction = r.action
      } catch (e) {
        // Don't fail the whole sync if the other party isn't reachable
        // (e.g. not on a delegated domain). Keep any prior link values.
        console.error("gcal-sync: other-calendar error", (e as Error).message)
        otherAction = "error"
      }
    } else if (otherEventId && otherEmail) {
      // The other party was cleared → remove their stale event.
      await safeDelete(otherEmail, otherEventId)
      otherEmail = null
      otherEventId = null
      otherAction = "deleted_other"
    }

    const staffOk = !!staffEventId
    const otherOk = !!otherEventId

    // If neither calendar ended up with an event, drop any stale link and 500
    // so the failure is visible in logs (and pg_net can be inspected).
    if (!staffOk && !otherOk) {
      if (existingLink) {
        await admin.from("gcal_event_links").delete()
          .eq("source_table", table).eq("source_id", sourceId)
      }
      console.error("gcal-sync: both calendars failed", { sourceId, staffAction, otherAction })
      return json({ error: "both calendars failed", staffAction, otherAction }, 500)
    }

    await admin.from("gcal_event_links").upsert({
      source_table: table,
      source_id: sourceId,
      tenant_id: (row.tenant_id as string | undefined) ??
        (staff as Row | undefined)?.tenant_id ?? (other as Row | undefined)?.tenant_id ?? null,
      staff_id: staffId,
      staff_email: staffEmail,
      gcal_event_id: staffEventId,
      gcal_calendar_id: "primary",
      other_id: other?.id ?? null,
      other_email: otherEmail,
      other_gcal_event_id: otherEventId,
      last_synced_at: new Date().toISOString(),
      last_status: `staff:${staffAction}|other:${otherAction}`,
    }, { onConflict: "source_table,source_id" })

    console.log(JSON.stringify({
      table, sourceId, staff: staffEmail, staffAction,
      other: otherEmail, otherAction,
    }))
    return json({ ok: true, staffAction, otherAction })
  } catch (e) {
    console.error("gcal-sync: unhandled", (e as Error).message)
    return json({ error: (e as Error).message }, 500)
  }
})
