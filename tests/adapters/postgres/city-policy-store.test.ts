import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PostgresCityPolicyStore } from "../../../src/adapters/postgres/city-policy-store.js";
import {
  decideBusinessHoursAction,
  isWithinBusinessHours,
} from "../../../src/core/business-hours.js";

const localDatabaseUrl = process.env.LOCAL_DATABASE_URL;
if (localDatabaseUrl) {
  const host = new URL(localDatabaseUrl).hostname;
  if (!new Set(["127.0.0.1", "localhost", "[::1]"]).has(host)) {
    throw new Error(
      "City policy integration tests require a loopback database",
    );
  }
}

describe.skipIf(!localDatabaseUrl)(
  "PostgresCityPolicyStore (local Supabase)",
  () => {
    let pool: Pool;
    let store: PostgresCityPolicyStore;
    const cityIdsToRemove: string[] = [];

    beforeAll(() => {
      pool = new Pool({ connectionString: localDatabaseUrl, max: 4 });
      store = new PostgresCityPolicyStore(pool);
    });

    afterEach(async () => {
      if (cityIdsToRemove.length === 0) return;
      const cityIds = cityIdsToRemove.splice(0);
      await pool.query(
        "delete from app.city_policies where city_id = any($1)",
        [cityIds],
      );
    });

    afterAll(async () => {
      await pool?.end();
    });

    it("supplies the seeded Boulder schedule and distinct request destinations", async () => {
      const result = await store.load("boulder-co");
      expect(result.status).toBe("available");
      if (result.status !== "available") return;

      expect(result.policy).toMatchObject({
        cityId: "boulder-co",
        revision: 1,
        sourceUrl: "https://bouldercolorado.gov/contact-us",
        holidaySourceUrl:
          "https://bouldercolorado.gov/event-series/city-holidays",
        alwaysOpenTicket: false,
        requestTypes: {
          pothole: "transportation_mobility",
          park_maintenance: "parks_recreation",
        },
      });
      expect(
        result.policy.departments[result.policy.requestTypes.pothole],
      ).toMatchObject({
        name: "Transportation & Mobility Department",
        mockDestination: "+13035550101",
      });
      expect(
        result.policy.departments[result.policy.requestTypes.park_maintenance],
      ).toMatchObject({
        name: "Parks & Recreation",
        mockDestination: "+13035550102",
        sourceUrl:
          "https://bouldercolorado.gov/government/departments/parks-recreation/about",
      });
    });

    it.each([
      ["open", "2026-11-10T18:00:00Z", "route"],
      ["closed after hours", "2026-11-11T01:00:00Z", "create_ticket"],
      ["holiday override", "2026-11-11T18:00:00Z", "create_ticket"],
    ] as const)(
      "uses the real DB policy for a %s decision",
      async (_label, time, expectedAction) => {
        const result = await store.load("boulder-co");
        expect(result.status).toBe("available");
        if (result.status !== "available") return;

        const isOpen = isWithinBusinessHours(
          result.policy.schedule,
          new Date(time),
        );
        expect(decideBusinessHoursAction(isOpen)).toBe(expectedAction);
      },
    );

    it("keeps the Jan 1 2027 holiday under a non-UTC process timezone", async () => {
      const previousTimeZone = process.env.TZ;
      process.env.TZ = "Asia/Jerusalem";
      try {
        const result = await store.load("boulder-co");
        expect(result.status).toBe("available");
        if (result.status !== "available") return;

        expect(result.policy.schedule.validThrough).toBe("2027-01-01");
        const isOpen = isWithinBusinessHours(
          result.policy.schedule,
          new Date("2027-01-01T18:00:00Z"),
        );
        expect(decideBusinessHoursAction(isOpen)).toBe("create_ticket");
      } finally {
        process.env.TZ = previousTimeZone;
      }
    });

    it("lets the pure policy fail closed beyond the reviewed validity horizon", async () => {
      const result = await store.load("boulder-co");
      expect(result.status).toBe("available");
      if (result.status !== "available") return;

      const isOpen = isWithinBusinessHours(
        result.policy.schedule,
        new Date("2027-01-02T18:00:00Z"),
      );
      expect(decideBusinessHoursAction(isOpen)).toBe("unavailable");
    });

    it("returns unavailable for a missing city row", async () => {
      expect(await store.load("missing-city")).toEqual({
        status: "unavailable",
      });
    });

    it.each([
      ["malformed required field", { timeZone: 42 }],
      ["impossible override date", { dateOverrides: { "2026-02-29": [] } }],
      ["unsupported ticket-always flag", { alwaysOpenTicket: true }],
    ] as const)("returns unavailable for %s", async (_label, patch) => {
      const cityId = `test-${randomUUID()}`;
      cityIdsToRemove.push(cityId);
      await seedPolicy(cityId, patch);

      expect(await store.load(cityId)).toEqual({ status: "unavailable" });
    });

    it("accepts a different fictional 303-555 mock destination", async () => {
      const cityId = `test-${randomUUID()}`;
      cityIdsToRemove.push(cityId);
      await seedPolicy(cityId, {
        departments: {
          transportation_mobility: {
            name: "Transportation & Mobility Department",
            mockDestination: "+13035550199",
            sourceUrl:
              "https://bouldercolorado.gov/services/transportation-maintenance",
          },
          parks_recreation: {
            name: "Parks & Recreation",
            mockDestination: "+13035550198",
            sourceUrl:
              "https://bouldercolorado.gov/government/departments/parks-recreation/about",
          },
        },
      });

      const result = await store.load(cityId);
      expect(result.status).toBe("available");
      if (result.status !== "available") return;
      expect(result.policy.departments.transportation_mobility).toMatchObject({
        mockDestination: "+13035550199",
      });
    });

    /** Input: city ID plus shallow policy patch. Output: inserted test policy row. */
    async function seedPolicy(
      cityId: string,
      policyPatch: Record<string, unknown>,
    ): Promise<void> {
      const seeded = await pool.query<{ policy: Record<string, unknown> }>(
        "select policy from app.city_policies where city_id = 'boulder-co'",
      );
      const policy = { ...seeded.rows[0]?.policy, ...policyPatch };
      await pool.query(
        `insert into app.city_policies
           (city_id, display_name, events_listing_url, website_base_url,
            revision, source_url, source_verified_at, valid_through, policy)
         values ($1, 'Testville', 'https://example.test/events',
                 'https://example.test', 1,
                 'https://example.test/contact',
                 '2026-09-16T00:00:00Z', '2027-01-01', $2::jsonb)`,
        [cityId, JSON.stringify(policy)],
      );
    }
  },
);
