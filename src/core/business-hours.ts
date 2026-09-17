/**
 * Pure, provider-free business-hours policy.
 * `isWithinBusinessHours` checks a validated schedule at a trusted time and
 * `decideBusinessHoursAction` maps that to route/create_ticket/unavailable.
 * No I/O or provider types here; the DB adapter validates the schedule first.
 */
import { localDateTimeParts } from "./date-time.js";

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
    const parts = localDateTimeParts(currentTime, schedule.timeZone);
    if (!parts) return undefined;

    const localDate = `${parts.year}-${parts.month}-${parts.day}`;
    if (localDate > schedule.validThrough) return undefined;

    const openingHours =
      schedule.dateOverrides[localDate] ??
      schedule.weeklySchedule[parts.weekday as Weekday];
    if (!Array.isArray(openingHours)) return undefined;

    const localTime = `${parts.hour}:${parts.minute}`;
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
