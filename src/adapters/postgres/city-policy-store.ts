/**
 * Postgres-backed CityPolicyReader.
 * Loads the validated hours/timezone/closures/departments/mock-destination row
 * that the business-hours policy and routing consume, keeping runtime policy in
 * the database rather than in application code.
 */
import type { Pool } from "pg";
import type { OfficeSchedule } from "../../core/business-hours.js";

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
const REQUEST_TYPES = ["pothole", "park_maintenance"] as const;
const DEPARTMENTS = ["transportation_mobility", "parks_recreation"] as const;

type Weekday = (typeof WEEKDAYS)[number];
export type SupportedRequestType = (typeof REQUEST_TYPES)[number];
export type DepartmentId = (typeof DEPARTMENTS)[number];

export type DepartmentPolicy = Readonly<{
  id: DepartmentId;
  name: string;
  mockDestination: string;
  sourceUrl: string;
}>;

export type CityPolicy = Readonly<{
  cityId: string;
  revision: number;
  sourceUrl: string;
  holidaySourceUrl: string;
  sourceVerifiedAt: string;
  schedule: OfficeSchedule;
  alwaysOpenTicket: false;
  departments: Readonly<Record<DepartmentId, DepartmentPolicy>>;
  requestTypes: Readonly<Record<SupportedRequestType, DepartmentId>>;
}>;

type CityPolicyRow = {
  city_id: string;
  revision: number;
  source_url: string;
  source_verified_at: Date;
  valid_through: string;
  policy: unknown;
};

/**
 * Reads one validated city policy row from local Supabase Postgres.
 * Input: `"boulder-co"`. Output: typed policy metadata or `{status: "unavailable"}`.
 */
export class PostgresCityPolicyStore {
  /** Input: server-owned pg pool. Output: policy store using that pool. */
  constructor(private readonly pool: Pool) {}

  /** Input: `"boulder-co"`. Output: typed policy or fail-closed `unavailable`. */
  async load(
    cityId: string,
  ): Promise<
    { status: "available"; policy: CityPolicy } | { status: "unavailable" }
  > {
    try {
      const result = await this.pool.query<CityPolicyRow>(
        `select city_id, revision, source_url, source_verified_at,
                valid_through::text as valid_through, policy
         from app.city_policies
         where city_id = $1`,
        [cityId],
      );
      const row = result.rows[0];
      if (!row) return { status: "unavailable" };

      const policy = validateCityPolicy(row, cityId);
      return policy
        ? { status: "available", policy }
        : { status: "unavailable" };
    } catch (error) {
      logDatabaseError("load", error);
      return { status: "unavailable" };
    }
  }
}

/** Input: raw Postgres row plus expected city. Output: typed policy or `undefined`. */
function validateCityPolicy(
  row: CityPolicyRow,
  expectedCityId: string,
): CityPolicy | undefined {
  if (
    row.city_id !== expectedCityId ||
    !Number.isInteger(row.revision) ||
    row.revision <= 0 ||
    !isHttpsUrl(row.source_url)
  ) {
    return undefined;
  }

  const raw = row.policy;
  if (
    !isRecord(raw) ||
    raw.alwaysOpenTicket !== false ||
    typeof raw.holidaySourceUrl !== "string" ||
    !isHttpsUrl(raw.holidaySourceUrl)
  ) {
    return undefined;
  }

  const validThrough = row.valid_through;
  const schedule = validateSchedule(raw, validThrough);
  const departments = validateDepartments(raw.departments);
  if (!schedule || !departments) return undefined;
  const requestTypes = validateRequestTypes(raw.requestTypes, departments);
  if (!requestTypes) return undefined;

  return {
    cityId: row.city_id,
    revision: row.revision,
    sourceUrl: row.source_url,
    holidaySourceUrl: raw.holidaySourceUrl,
    sourceVerifiedAt: row.source_verified_at.toISOString(),
    schedule,
    alwaysOpenTicket: false,
    departments,
    requestTypes,
  };
}

/** Input: raw JSON policy plus `"2027-01-01"`. Output: validated office schedule. */
function validateSchedule(
  raw: Record<string, unknown>,
  validThrough: string,
): OfficeSchedule | undefined {
  if (
    typeof raw.timeZone !== "string" ||
    !isValidTimeZone(raw.timeZone) ||
    !isValidCalendarDate(validThrough)
  ) {
    return undefined;
  }

  const weeklySchedule = validateWeeklySchedule(raw.weeklySchedule);
  const dateOverrides = validateDateOverrides(raw.dateOverrides);
  if (!weeklySchedule || !dateOverrides) return undefined;

  return {
    timeZone: raw.timeZone,
    validThrough,
    weeklySchedule,
    dateOverrides,
  };
}

/** Input: raw weekday map. Output: seven validated weekday entries. */
function validateWeeklySchedule(
  raw: unknown,
): OfficeSchedule["weeklySchedule"] | undefined {
  if (!isRecord(raw)) return undefined;
  const schedule = {} as Record<
    Weekday,
    readonly { opensAt: string; closesAt: string }[]
  >;
  for (const day of WEEKDAYS) {
    const hours = validateOpeningHours(raw[day]);
    if (!hours) return undefined;
    schedule[day] = hours;
  }
  return schedule;
}

/** Input: raw date override map. Output: validated override map keyed by calendar date. */
function validateDateOverrides(
  raw: unknown,
): OfficeSchedule["dateOverrides"] | undefined {
  if (!isRecord(raw)) return undefined;
  const overrides: Record<
    string,
    readonly { opensAt: string; closesAt: string }[]
  > = {};
  for (const [date, hoursRaw] of Object.entries(raw)) {
    if (!isValidCalendarDate(date)) return undefined;
    const hours = validateOpeningHours(hoursRaw);
    if (!hours) return undefined;
    overrides[date] = hours;
  }
  return overrides;
}

/** Input: `[{opensAt: "08:00", closesAt: "17:00"}]`. Output: ordered hours or `undefined`. */
function validateOpeningHours(
  raw: unknown,
): readonly { opensAt: string; closesAt: string }[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const hours: { opensAt: string; closesAt: string }[] = [];
  let previousClosesAt: string | undefined;
  for (const entry of raw) {
    if (
      !isRecord(entry) ||
      typeof entry.opensAt !== "string" ||
      typeof entry.closesAt !== "string" ||
      !isLocalTime(entry.opensAt) ||
      !isLocalTime(entry.closesAt) ||
      entry.opensAt >= entry.closesAt ||
      (previousClosesAt !== undefined && entry.opensAt < previousClosesAt)
    ) {
      return undefined;
    }
    hours.push({ opensAt: entry.opensAt, closesAt: entry.closesAt });
    previousClosesAt = entry.closesAt;
  }
  return hours;
}

/** Input: raw department map. Output: typed departments with fictional destinations. */
function validateDepartments(
  raw: unknown,
): CityPolicy["departments"] | undefined {
  if (!isRecord(raw)) return undefined;
  const departments = {} as Record<DepartmentId, DepartmentPolicy>;
  for (const id of DEPARTMENTS) {
    const department = raw[id];
    if (
      !isRecord(department) ||
      typeof department.name !== "string" ||
      department.name.trim() === "" ||
      typeof department.mockDestination !== "string" ||
      !/^\+130355501\d{2}$/.test(department.mockDestination) ||
      typeof department.sourceUrl !== "string" ||
      !isHttpsUrl(department.sourceUrl)
    ) {
      return undefined;
    }
    departments[id] = {
      id,
      name: department.name,
      mockDestination: department.mockDestination,
      sourceUrl: department.sourceUrl,
    };
  }
  return departments;
}

/** Input: raw request map plus departments. Output: request type to department IDs. */
function validateRequestTypes(
  raw: unknown,
  departments: CityPolicy["departments"],
): CityPolicy["requestTypes"] | undefined {
  if (!isRecord(raw)) return undefined;
  const requestTypes = {} as Record<SupportedRequestType, DepartmentId>;
  for (const requestType of REQUEST_TYPES) {
    const departmentId = raw[requestType];
    if (
      typeof departmentId !== "string" ||
      !DEPARTMENTS.includes(departmentId as DepartmentId) ||
      !departments[departmentId as DepartmentId]
    ) {
      return undefined;
    }
    requestTypes[requestType] = departmentId as DepartmentId;
  }
  return requestTypes;
}

/** Input: possible JSON object. Output: whether it is a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Input: `"2026-02-29"`. Output: `false`; `"2027-01-01"` returns `true`. */
function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return false;
  }
  const normalized = new Date(Date.UTC(year, month - 1, day));
  return (
    normalized.getUTCFullYear() === year &&
    normalized.getUTCMonth() === month - 1 &&
    normalized.getUTCDate() === day
  );
}

/** Input: `"24:00"`. Output: `false`; `"17:00"` returns `true`. */
function isLocalTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Input: `"https://bouldercolorado.gov/contact-us"`. Output: `true`. */
function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Input: `"America/Denver"`. Output: `true` when supported by Intl. */
function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Input: `"load"` and a database error. Output: compact safe console error. */
function logDatabaseError(operation: string, error: unknown): void {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "unknown";
  console.error(`PostgresCityPolicyStore.${operation} failed`, { code });
}
