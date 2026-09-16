type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

type OpeningHours = Readonly<{ opensAt: string; closesAt: string }>;

// The configuration adapter must validate these values before calling the policy.
export type OfficeSchedule = Readonly<{
  timeZone: string;
  validThrough: string; // YYYY-MM-DD in the city's timezone
  weeklySchedule: Readonly<Record<Weekday, readonly OpeningHours[]>>;
  dateOverrides: Readonly<Record<string, readonly OpeningHours[]>>;
}>;

export type BusinessHoursAction = "route" | "create_ticket" | "unavailable";

/**
 * Checks a validated city schedule at the current time.
 * Input: a Denver schedule open Tuesday 08:00–17:00, `2026-01-13T18:15:00Z`.
 * Output: `true`; after closing, `false`; if the check cannot run, `undefined`.
 */
export function isWithinBusinessHours(
  schedule: OfficeSchedule,
  currentTime: Date,
): boolean | undefined {
  if (
    !(currentTime instanceof Date) ||
    !Number.isFinite(currentTime.getTime())
  ) {
    return undefined;
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: schedule.timeZone,
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
      formatter
        .formatToParts(currentTime)
        .map(({ type, value }) => [type, value]),
    );
    if (!year || !month || !day || !hour || !minute || !weekday) {
      return undefined;
    }

    const localDate = `${year}-${month}-${day}`;
    if (localDate > schedule.validThrough) return undefined;

    const openingHours =
      schedule.dateOverrides[localDate] ??
      schedule.weeklySchedule[weekday.toLowerCase() as Weekday];
    if (!Array.isArray(openingHours)) return undefined;

    const localTime = `${hour}:${minute}`;
    return openingHours.some(
      ({ opensAt, closesAt }) => opensAt <= localTime && localTime < closesAt,
    );
  } catch {
    return undefined;
  }
}

/**
 * Maps the hours result for a confirmed staff request without performing it.
 * Input: `true`, `false`, or `undefined`.
 * Output: `"route"`, `"create_ticket"`, or `"unavailable"`, respectively.
 */
export function decideBusinessHoursAction(
  isOpen: boolean | undefined,
): BusinessHoursAction {
  if (isOpen === true) return "route";
  if (isOpen === false) return "create_ticket";
  return "unavailable";
}
