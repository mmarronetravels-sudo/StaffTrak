// StaffTrak runs on Pacific time for everyone.
//
// The scheduling forms use <input type="datetime-local">, which produces a
// naive wall-clock string like "2026-06-23T09:00" with no timezone. The
// `scheduled_at` columns are timestamptz and the database runs in UTC, so
// sending that naive string straight in makes Postgres read it as 09:00 UTC —
// i.e. a 9:00 AM Pacific observation gets stored as 09:00Z, which is 2:00 AM
// Pacific. (That was the "showed up at 2 AM on Google Calendar" bug.)
//
// These helpers interpret the entered wall-clock time as America/Los_Angeles
// and convert it to the correct UTC instant before saving. The offset is
// derived per-date via Intl, so PST vs PDT (daylight saving) is handled
// automatically.

export const APP_TIME_ZONE = 'America/Los_Angeles'

// Minutes that `timeZone` is ahead of UTC at the given instant.
// Negative for zones west of UTC (e.g. -420 for PDT, -480 for PST).
function zoneOffsetMinutes(timeZone, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]))
  // Intl can render midnight as hour "24"; normalize to 0.
  const hour = p.hour === '24' ? 0 : Number(p.hour)
  const asUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    hour,
    Number(p.minute),
    Number(p.second),
  )
  return (asUTC - date.getTime()) / 60000
}

// Convert a naive "YYYY-MM-DDTHH:mm" Pacific wall-clock string to a UTC ISO
// string suitable for a timestamptz column. Returns '' for empty input and
// leaves anything that doesn't match the expected shape untouched.
export function pacificInputToUTC(naive) {
  if (!naive) return ''
  const m = String(naive).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return naive
  const [, y, mo, d, h, mi] = m.map(Number)
  // Treat the wall time as if it were UTC, then correct by the Pacific offset
  // at that instant. Two steps because the offset itself depends on the date
  // (PST vs PDT).
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const offset = zoneOffsetMinutes(APP_TIME_ZONE, new Date(guess))
  return new Date(guess - offset * 60000).toISOString()
}
