/**
 * Provider-neutral date/time helpers.
 * Pure utilities for city-local dates and timezone-aware formatting. No I/O,
 * no provider types, and no city-specific constants: the caller supplies the
 * IANA time zone. Used by the hours policy and the knowledge handlers.
 */

export type LocalDateTimeParts = Readonly<{
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  /** Lowercase English weekday name, e.g. `"wednesday"`. */
  weekday: string;
}>;

/**
 * Extracts the local calendar/time parts of an instant in a time zone.
 * Input: an instant and `"America/Denver"`.
 * Output: stable Latin/gregory parts or `undefined` when the input is invalid.
 */
export function localDateTimeParts(
  date: Date,
  timeZone: string,
): LocalDateTimeParts | undefined {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    return undefined;
  }
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const { year, month, day, hour, minute, weekday } = Object.fromEntries(
      formatter.formatToParts(date).map(({ type, value }) => [type, value]),
    );
    if (!year || !month || !day || !hour || !minute || !weekday) {
      return undefined;
    }
    return {
      year,
      month,
      day,
      hour,
      minute,
      weekday: weekday.toLowerCase(),
    };
  } catch {
    return undefined;
  }
}

/**
 * Formats an instant as a `YYYY-MM-DD` local date in a time zone.
 * Input: an instant and `"America/Denver"`. Output: `"2026-09-16"`.
 */
export function localDateIn(date: Date, timeZone: string): string {
  const parts = localDateTimeParts(date, timeZone);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : "";
}

/**
 * Adds days to a `YYYY-MM-DD` local date.
 * Input: `("2026-09-16", 14)`. Output: `"2026-09-30"`.
 */
export function addLocalDays(localDate: string, days: number): string {
  const [year = 1970, month = 1, day = 1] = localDate.split("-").map(Number);
  return utcDate(new Date(Date.UTC(year, month - 1, day + days)));
}

/**
 * Formats an instant as a UTC `YYYY-MM-DD`.
 * Input: an instant. Output: `"2026-09-16"`.
 */
export function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Validates the `YYYY-MM-DD` local-date format used by the event tool.
 * Input: `"2026-02-30"`. Output: `false`.
 */
export function isValidLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

/**
 * Formats an instant for people, e.g. `"Thu, Sep 24"`, in a time zone.
 * Input: an instant and `"America/Denver"`. Output: a short local date.
 */
export function formatShortLocalDate(date: Date, timeZone: string): string {
  return date.toLocaleDateString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
