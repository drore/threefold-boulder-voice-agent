import { describe, expect, it } from "vitest";
import type { OfficeSchedule } from "../../src/core/business-hours.js";
import {
  confirmServiceReport,
  type CityPolicyReader,
} from "../../src/core/confirm-service-report.js";
import type {
  DraftStore,
  ReportDraft,
} from "../../src/core/prepare-service-report.js";

const CONTEXT = {
  conversationId: "conversation-1",
  cityId: "boulder-co",
  admissionId: "admission-1",
};
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
  dateOverrides: {},
};
const POLICY = {
  cityId: "boulder-co",
  revision: 3,
  schedule: SCHEDULE,
  requestTypes: {
    pothole: "transportation_mobility",
    park_maintenance: "parks_recreation",
  },
  departments: {
    transportation_mobility: {
      name: "Transportation & Mobility",
      mockDestination: "+13035550101",
    },
    parks_recreation: {
      name: "Parks & Recreation",
      mockDestination: "+13035550102",
    },
  },
} as const;

/** Input: a supported report type. Output: a complete observed draft at revision 2. */
function draftFor(requestType: ReportDraft["requestType"]): ReportDraft {
  return {
    ...CONTEXT,
    draftId: "draft-1",
    revision: 2,
    requestType,
    location: { text: "Boulder location", observationId: "observation-1" },
    description: { text: "Maintenance issue", observationId: "observation-2" },
  };
}

/** Input: a complete draft and fixed time. Output: one core decision with no effects. */
async function decide(
  draft: ReportDraft,
  currentTime: string,
  requestTypes: Record<
    ReportDraft["requestType"],
    string
  > = POLICY.requestTypes,
) {
  const drafts: Pick<DraftStore, "load"> = {
    load: async () => ({ status: "found", draft }),
  };
  const policies: CityPolicyReader = {
    load: async () => ({
      status: "available",
      policy: { ...POLICY, requestTypes },
    }),
  };
  return confirmServiceReport(
    CONTEXT,
    draft.draftId,
    draft.revision,
    drafts,
    policies,
    () => new Date(currentTime),
  );
}

describe("confirmed service report decision", () => {
  it.each([
    ["pothole", "Transportation & Mobility", "+13035550101"],
    ["park_maintenance", "Parks & Recreation", "+13035550102"],
  ] as const)(
    "routes a %s report to its configured mock department while open",
    async (requestType, name, mockDestination) => {
      expect(
        await decide(draftFor(requestType), "2026-09-16T18:00:00Z"),
      ).toEqual({
        status: "simulated_route",
        draftId: "draft-1",
        revision: 2,
        policyRevision: 3,
        department: { name, mockDestination },
      });
    },
  );

  it("requires a ticket for a park report after office hours", async () => {
    expect(
      await decide(draftFor("park_maintenance"), "2026-09-17T01:00:00Z"),
    ).toEqual({
      status: "ticket_required",
      draftId: "draft-1",
      revision: 2,
      policyRevision: 3,
    });
  });

  it("uses the policy mapping rather than hardcoding the park destination", async () => {
    expect(
      await decide(draftFor("park_maintenance"), "2026-09-16T18:00:00Z", {
        pothole: "parks_recreation",
        park_maintenance: "transportation_mobility",
      }),
    ).toMatchObject({
      status: "simulated_route",
      department: { name: "Transportation & Mobility" },
    });
  });
});
