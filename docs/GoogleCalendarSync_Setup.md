# Google Calendar Sync — Setup & Operations

Mirrors StaffTrak's built-in calendar (scheduled **observations** and **meetings**)
onto each staff member's own Google Calendar. One-way: StaffTrak → Google.
Creating, rescheduling, or cancelling an observation/meeting in StaffTrak
automatically creates, moves, or deletes the matching Google Calendar event.

## How it works

- A Postgres **row trigger** (migration `036`) fires on every INSERT / UPDATE /
  DELETE to the `observations` and `meetings` tables and calls the function via
  pg_net's `net.http_post`.
  (We use triggers rather than the Dashboard's "Database Webhooks" UI because
  that feature depends on the internal `supabase_functions` schema, which isn't
  installed on this project — creating a hook errors with `3F000 schema
  "supabase_functions" does not exist`. The trigger does the identical job.)
- The trigger calls the **`gcal-sync`** edge function (deployed `--no-verify-jwt`;
  it authenticates the call with the shared `GCAL_WEBHOOK_SECRET` instead).
- The function impersonates the staff member (Google Workspace **domain-wide
  delegation**) and writes the event to *their* primary calendar — no per-user
  consent prompts.
- The StaffTrak-row → Google-event mapping is stored in **`gcal_event_links`**
  (migration `035`), so edits patch the right event and cancellations delete it.
  We deliberately do **not** store the event id on the observation/meeting row —
  that would re-trigger the webhook in a loop.

Pieces in this repo:
- `supabase/migrations/035_gcal_event_links.sql` — the row→event mapping table
- `supabase/migrations/036_gcal_sync_triggers.sql` — the triggers that call the function
- `supabase/functions/gcal-sync/index.ts` — the sync function

---

## One-time setup

### 1. Google Cloud — service account + Calendar API

1. In the **Google Cloud Console** (any project; a dedicated one is cleanest),
   enable the **Google Calendar API** (APIs & Services → Library).
2. Create a **service account** (IAM & Admin → Service Accounts). No project
   roles are needed.
3. On the service account, **create a JSON key** and download it. You'll use
   `client_email` and `private_key` from that file.
4. Note the service account's **Client ID** (the long numeric "Unique ID" on the
   service account's Details tab) — you need it in step 2.

### 2. Google Workspace admin — authorize domain-wide delegation

> Requires Workspace **super-admin** for `summitlc.org`.

In **admin.google.com** → **Security → Access and data control → API controls →
Domain-wide delegation → Add new**:

- **Client ID:** the service account's numeric Client ID from step 1.4
- **OAuth scopes:** `https://www.googleapis.com/auth/calendar.events`

Save. This authorizes the service account to act on behalf of users in the
`summitlc.org` domain, limited to that single calendar-events scope.

### 3. Supabase — function secrets

Set these (Dashboard → Project Settings → Edge Functions → Secrets, or the CLI):

```bash
supabase secrets set GCAL_SA_CLIENT_EMAIL="svc-name@your-project.iam.gserviceaccount.com"
supabase secrets set GCAL_SA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
supabase secrets set GCAL_WEBHOOK_SECRET="<a long random string you generate>"
# optional overrides:
supabase secrets set GCAL_TIME_ZONE="America/Los_Angeles"   # default
supabase secrets set GCAL_OBS_MINUTES="45"                  # default observation length
supabase secrets set GCAL_MEETING_MINUTES="60"              # default meeting length
```

Notes:
- Keep the literal `\n` sequences in `GCAL_SA_PRIVATE_KEY` — the function
  converts them to real newlines.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### 4. Run the migration

Run `035_gcal_event_links.sql` in the Supabase SQL editor (project
`fgbigyffgzqzvksrkqxv`). The closing `SELECT` should list one policy
(`gcal_event_links_select`).

### 5. Deploy the function (JWT verification OFF)

The trigger calls the function with a static secret, not a logged-in user's JWT,
so deploy with verification disabled — the function does its own secret check:

```bash
supabase functions deploy gcal-sync --no-verify-jwt
```

### 6. Create the triggers

Make sure the **`pg_net`** extension is enabled (Database → Extensions → pg_net),
then run `036_gcal_sync_triggers.sql` in the SQL editor. **Before running,
replace `__GCAL_WEBHOOK_SECRET__`** in that file with the real value you stored
as the `GCAL_WEBHOOK_SECRET` function secret (the committed file keeps a
placeholder so the secret stays out of version control).

The closing `SELECT` should list six rows — `gcal_sync_observations` and
`gcal_sync_meetings`, each for INSERT / UPDATE / DELETE. That's what authorizes
and routes every change to the function.

---

## Verify end-to-end

1. Pick a test staff member with a real `@summitlc.org` mailbox (or use your own
   on an allowed domain).
2. In StaffTrak, schedule an observation for them on the **Calendar** page.
3. Within a few seconds the event should appear on that person's Google Calendar.
4. Edit the date/time in StaffTrak → the Google event **moves**.
5. Cancel/delete it in StaffTrak → the Google event **disappears**.
6. Check **Supabase → Edge Functions → gcal-sync → Logs** for one line per change
   (`{"action":"created", ...}`), and confirm a row landed in `gcal_event_links`.

---

## Behavior notes & limits

- **Scope of sync:** only rows with a `scheduled_at` and `status <> 'cancelled'`
  get an event. A row whose `scheduled_at` is cleared, or whose status becomes
  `cancelled`, has its Google event deleted.
- **Whose calendar:** the staff member's (the `staff_id` on the row). The event
  shows up as theirs; the observer/evaluator name goes in the description. (If you
  later want the *evaluator* to also see it, add them as an attendee in
  `buildEvent` — left out for now to keep invites/notifications quiet.)
- **Domain limit:** delegation only covers `@summitlc.org` accounts. Staff on
  other domains are skipped (logged, no event). Future non-Google tenants would
  need the alternative "consent at login" approach instead.
- **Manual edits in Google:** if someone hand-edits or deletes the Google event,
  the next StaffTrak change re-asserts/recreates it (the function recreates a
  vanished event on the next update).
- **Idempotent:** re-running a sync for the same row patches the existing event
  rather than duplicating it.

## Troubleshooting

- **401 from the function:** the webhook's `Authorization` header doesn't match
  `GCAL_WEBHOOK_SECRET`.
- **`Token exchange failed ... unauthorized_client`:** delegation not yet
  authorized, or the scope in the admin console doesn't exactly match
  `https://www.googleapis.com/auth/calendar.events`. Propagation can take a few
  minutes.
- **`invalid_grant` / impersonation errors:** the `sub` email isn't a real user
  in the Workspace domain, or the service account's Client ID in the admin
  console is wrong.
- **No event and no log:** the webhook isn't firing — re-check it's enabled for
  all three events on the right table.
