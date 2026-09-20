/**
 * Date utilities — LOCAL timezone helpers.
 *
 * Historically the app called ``new Date().toISOString().slice(0, 10)``
 * to compute "today" as a YYYY-MM-DD string. That returns a UTC date,
 * which is off by one whenever the user is in a negative-UTC timezone
 * during the late-evening hours (e.g. Arizona / MST, UTC-7). The bug:
 *
 *   Local: Sun 8pm → UTC: Mon 3am → today ISO returns "Mon"
 *   Instructor posts an event dated "Sun"
 *   Events index filters "Upcoming" using date_from = "Mon"
 *   Sunday event fails the filter and disappears.
 *
 * ``localTodayISO()`` returns the LOCAL calendar day so this never
 * happens. Use this in every place we ask the backend for "today's or
 * later" content — events search, classes list, upcoming reminders, etc.
 */

export function localTodayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Same as ``localTodayISO`` but for an arbitrary ``Date``. */
export function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** N days from local today as YYYY-MM-DD. */
export function localDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalISO(d);
}
