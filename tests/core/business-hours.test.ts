import { describe, expect, it } from "vitest";
import {
  decideBusinessHoursAction,
  isWithinBusinessHours,
  type OfficeSchedule,
} from "../../src/core/business-hours.js";

const SCHEDULE: OfficeSchedule = {
  timeZone: "America/Denver",
  validThrough: "2026-12-31",
  weeklySchedule: {
    monday: [{ opensAt: "08:00", closesAt: "17:00" }],
    tuesday: [{ opensAt: "08:00", closesAt: "17:00" }],
    wednesday: [{ opensAt: "08:00", closesAt: "17:00" }],
    thursday: [{ opensAt: "08:00", closesAt: "17:00" }],
    friday: [{ opensAt: "08:00", closesAt: "17:00" }],
    saturday: [],
    sunday: [],
  },
  dateOverrides: { "2026-01-19": [] },
};

describe("business-hours check", () => {
  it("is open during local office hours", () => {
    expect(
      isWithinBusinessHours(SCHEDULE, new Date("2026-01-13T18:15:00Z")),
    ).toBe(true);
  });

  it("is closed after local office hours", () => {
    expect(
      isWithinBusinessHours(SCHEDULE, new Date("2026-01-14T01:15:00Z")),
    ).toBe(false);
  });

  it.each([
    ["before opening", "2026-01-13T14:59:59Z", false],
    ["at opening", "2026-01-13T15:00:00Z", true],
    ["before closing", "2026-01-13T23:59:59Z", true],
    ["at closing", "2026-01-14T00:00:00Z", false],
  ] as const)(
    "checks the opening-hours boundary %s",
    (_label, time, expected) => {
      expect(isWithinBusinessHours(SCHEDULE, new Date(time))).toBe(expected);
    },
  );

  it("treats a weekend as closed", () => {
    expect(
      isWithinBusinessHours(SCHEDULE, new Date("2026-01-17T18:00:00Z")),
    ).toBe(false);
  });

  it("applies a closure override before the weekly schedule", () => {
    expect(
      isWithinBusinessHours(SCHEDULE, new Date("2026-01-19T18:00:00Z")),
    ).toBe(false);
  });

  it.each([
    ["spring", "2026-03-09T14:00:00Z"],
    ["autumn", "2026-11-02T15:00:00Z"],
  ])("is open at local 08:00 after the %s DST change", (_label, time) => {
    expect(isWithinBusinessHours(SCHEDULE, new Date(time))).toBe(true);
  });

  it("refuses an expired schedule", () => {
    const expired = { ...SCHEDULE, validThrough: "2026-01-12" };
    expect(
      isWithinBusinessHours(expired, new Date("2026-01-13T18:00:00Z")),
    ).toBeUndefined();
  });

  it("refuses an invalid time", () => {
    expect(
      isWithinBusinessHours(SCHEDULE, new Date("invalid")),
    ).toBeUndefined();
  });

  it("refuses an unknown timezone", () => {
    const invalid = { ...SCHEDULE, timeZone: "America/Not_A_Zone" };
    expect(
      isWithinBusinessHours(invalid, new Date("2026-01-13T18:00:00Z")),
    ).toBeUndefined();
  });
});

describe("hours-based action", () => {
  it.each([
    [true, "route"],
    [false, "create_ticket"],
    [undefined, "unavailable"],
  ] as const)("maps %s to %s", (isOpen, expected) => {
    expect(decideBusinessHoursAction(isOpen)).toBe(expected);
  });
});
