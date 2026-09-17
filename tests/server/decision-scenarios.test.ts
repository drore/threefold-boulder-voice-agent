/**
 * Business-hours decision scenarios.
 * Table-driven end-to-end checks that a confirmed report is routed to the
 * correct department inside business hours and filed as a ticket outside them,
 * across the HTTP and voice paths. The decision is server-owned, so both
 * channels must produce the same outcome for the same clock and request.
 */
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PostgresCityKnowledgeStore } from "../../src/adapters/postgres/city-knowledge-store.js";
import { PostgresCityPolicyStore } from "../../src/adapters/postgres/city-policy-store.js";
import { PostgresDraftStore } from "../../src/adapters/postgres/draft-store.js";
import { PostgresTicketOperationStore } from "../../src/adapters/postgres/ticket-operation-store.js";
import type { ReportContext } from "../../src/core/service-report/prepare-service-report.js";
import { buildLocalApp, type CityRuntime } from "../../src/server/build-app.js";
import type { TicketProvider } from "../../src/server/workflow/confirmed-ticket.js";

const databaseUrl = process.env.LOCAL_DATABASE_URL;
const LOCAL_ORIGIN = "http://127.0.0.1:5173";

if (
  databaseUrl &&
  !new Set(["127.0.0.1", "localhost", "[::1]"]).has(
    new URL(databaseUrl).hostname,
  )
) {
  throw new Error("Decision scenario tests require a loopback database");
}

const POTHOLE = {
  requestType: "pothole" as const,
  location: "15th and Pine",
  description: "Large pothole in driving lane",
};
const PARK = {
  requestType: "park_maintenance" as const,
  location: "North Boulder Park",
  description: "Broken swing near the playground",
};

const TRANSPORTATION = {
  name: "Transportation & Mobility Department",
  mockDestination: "+13035550101",
};
const PARKS = { name: "Parks & Recreation", mockDestination: "+13035550102" };

/** A recording ticket provider so routing never touches a real board. */
function ticketProvider() {
  let lastTitle = "";
  let lastDescription = "";
  const createTicket = vi.fn(
    async (input: { title: string; description: string }) => {
      lastTitle = input.title;
      lastDescription = input.description;
      return {
        status: "created" as const,
        ticket: {
          provider: "linear" as const,
          id: "issue-scenario-1",
          title: input.title,
        },
      };
    },
  );
  const readTicket = vi.fn(async (id: string) => ({
    status: "found" as const,
    ticket: {
      provider: "linear" as const,
      id,
      title: lastTitle,
      description: lastDescription,
      fetchedAt: "2026-09-17T00:00:00.000Z",
    },
  }));
  const provider: TicketProvider = { createTicket, readTicket };
  return { provider, createTicket, readTicket, created: () => lastTitle };
}

type ScenarioClock = () => Date;

describe.skipIf(!databaseUrl)(
  "business-hours decision matrix (HTTP path)",
  () => {
    let pool: Pool;
    beforeAll(() => {
      pool = new Pool({ connectionString: databaseUrl });
    });

    afterAll(async () => {
      await pool?.end();
    });

    const sessions: Array<{
      app: Awaited<ReturnType<typeof buildLocalApp>>;
      context: ReportContext;
    }> = [];

    afterEach(async () => {
      for (const session of sessions.splice(0)) {
        await session.app.close();
        for (const table of [
          "app.ticket_operations",
          "app.request_drafts",
          "app.observations",
        ]) {
          await pool.query(`delete from ${table} where conversation_id = $1`, [
            session.context.conversationId,
          ]);
        }
        await pool.query("delete from app.conversations where id = $1", [
          session.context.conversationId,
        ]);
      }
    });

    /** Input: a fixed clock and ticketing fakes. Output: an isolated app for one scenario. */
    async function openScenarioApp(
      clock: ScenarioClock,
      ticketing: {
        operations: PostgresTicketOperationStore;
        provider: TicketProvider;
      },
    ) {
      const store = new PostgresDraftStore(pool);
      const opened = await store.openConversation("boulder-co");
      if (opened.status !== "created") throw new Error("Local DB unavailable");
      const city: CityRuntime = {
        cityId: "boulder-co",
        displayName: "Boulder",
        timeZone: "America/Denver",
        eventsListingUrl: "https://example.test/events",
        knowledge: new PostgresCityKnowledgeStore(pool),
      };
      const app = buildLocalApp(
        store,
        opened.context,
        new PostgresCityPolicyStore(pool),
        city,
        clock,
        ticketing,
      );
      await app.ready();
      sessions.push({ app, context: opened.context });
      return app;
    }

    const cases = [
      {
        name: "open weekday routes a pothole to Transportation",
        clock: "2026-09-16T16:00:00Z",
        fields: POTHOLE,
        expected: {
          status: "simulated_route",
          department: TRANSPORTATION,
          providerCalls: 0,
        },
      },
      {
        name: "open weekday routes a park issue to Parks & Recreation",
        clock: "2026-09-16T16:00:00Z",
        fields: PARK,
        expected: {
          status: "simulated_route",
          department: PARKS,
          providerCalls: 0,
        },
      },
      {
        name: "the opening instant counts as open and routes",
        clock: "2026-09-16T14:00:00Z",
        fields: PARK,
        expected: {
          status: "simulated_route",
          department: PARKS,
          providerCalls: 0,
        },
      },
      {
        name: "the closing instant counts as closed and files a ticket",
        clock: "2026-09-16T23:00:00Z",
        fields: POTHOLE,
        expected: {
          status: "linear_ticket_created",
          ticketTitle: "Boulder demo: pothole report",
          providerCalls: 1,
        },
      },
      {
        name: "a weekend day is closed and files a park ticket",
        clock: "2026-09-20T16:00:00Z",
        fields: PARK,
        expected: {
          status: "linear_ticket_created",
          ticketTitle: "Boulder demo: park maintenance report",
          providerCalls: 1,
        },
      },
      {
        name: "a configured closure files a ticket",
        clock: "2026-11-26T17:00:00Z",
        fields: POTHOLE,
        expected: {
          status: "linear_ticket_created",
          ticketTitle: "Boulder demo: pothole report",
          providerCalls: 1,
        },
      },
    ] as const;

    it.each(cases)("$name", async ({ clock, fields, expected }) => {
      const tickets = ticketProvider();
      const app = await openScenarioApp(() => new Date(clock), {
        operations: new PostgresTicketOperationStore(pool),
        provider: tickets.provider,
      });

      const saved = await app.inject({
        method: "POST",
        url: "/api/local/report",
        payload: fields,
      });
      expect(saved.json()).toMatchObject({ status: "needs_confirmation" });
      const { draftId, revision } = saved.json();

      const confirmed = await app.inject({
        method: "POST",
        url: "/api/local/report/confirm",
        payload: { draftId, revision },
      });
      expect(confirmed.statusCode).toBe(200);
      const outcome = confirmed.json();
      expect(outcome.status).toBe(expected.status);

      if (expected.status === "simulated_route") {
        expect(outcome.policyRevision).toBe(1);
        expect(outcome.department).toMatchObject(expected.department);
        expect(tickets.createTicket).not.toHaveBeenCalled();
      } else {
        expect(tickets.createTicket).toHaveBeenCalledTimes(
          expected.providerCalls,
        );
        expect(tickets.created()).toBe(expected.ticketTitle);
        expect(outcome.currentDetails).toBe("fresh");
      }
    });

    it("never files a ticket for an unconfirmed draft", async () => {
      const tickets = ticketProvider();
      const app = await openScenarioApp(
        () => new Date("2026-09-16T23:00:00Z"),
        {
          operations: new PostgresTicketOperationStore(pool),
          provider: tickets.provider,
        },
      );
      const saved = await app.inject({
        method: "POST",
        url: "/api/local/report",
        payload: POTHOLE,
      });
      expect(saved.json()).toMatchObject({ status: "needs_confirmation" });
      expect(tickets.createTicket).not.toHaveBeenCalled();
    });
  },
);

describe.skipIf(!databaseUrl)(
  "business-hours decision matrix (voice path)",
  () => {
    let pool: Pool;
    beforeAll(() => {
      pool = new Pool({ connectionString: databaseUrl });
    });

    afterAll(async () => {
      await pool?.end();
    });

    const sessions: Array<{
      app: Awaited<ReturnType<typeof buildLocalApp>>;
      context: ReportContext;
    }> = [];

    afterEach(async () => {
      for (const session of sessions.splice(0)) {
        await session.app.close();
        for (const table of [
          "app.ticket_operations",
          "app.request_drafts",
          "app.observations",
        ]) {
          await pool.query(`delete from ${table} where conversation_id = $1`, [
            session.context.conversationId,
          ]);
        }
        await pool.query("delete from app.conversations where id = $1", [
          session.context.conversationId,
        ]);
      }
    });

    /** Input: output items. Output: a Responses envelope the app consumes. */
    function modelOutput(output: unknown[]): Response {
      return new Response(JSON.stringify({ status: "completed", output }), {
        status: 200,
      });
    }

    function toolCall(
      name: string,
      args: Record<string, unknown>,
      callId: string,
    ): Response {
      return modelOutput([
        {
          type: "function_call",
          name,
          arguments: JSON.stringify(args),
          call_id: callId,
        },
      ]);
    }

    function message(text: string): Response {
      return modelOutput([
        { type: "message", content: [{ type: "output_text", text }] },
      ]);
    }

    /** Input: the report turn and confirm turn. Output: the confirm outcome for that channel. */
    async function runVoiceScenario(options: {
      clock: string;
      utterance: string;
      toolArguments: Record<string, unknown>;
      tickets: ReturnType<typeof ticketProvider>;
    }) {
      const responses = [
        toolCall("prepareServiceReport", options.toolArguments, "call-1"),
        message("The report is ready for your confirmation."),
        toolCall("confirmReport", {}, "call-2"),
        message("Your report was handled."),
      ];
      const request: typeof fetch = async () => responses.shift() as Response;
      const store = new PostgresDraftStore(pool);
      const opened = await store.openConversation("boulder-co");
      if (opened.status !== "created") throw new Error("Local DB unavailable");
      const app = buildLocalApp(
        store,
        opened.context,
        new PostgresCityPolicyStore(pool),
        {
          cityId: "boulder-co",
          displayName: "Boulder",
          timeZone: "America/Denver",
          eventsListingUrl: "https://example.test/events",
          knowledge: new PostgresCityKnowledgeStore(pool),
        },
        () => new Date(options.clock),
        {
          operations: new PostgresTicketOperationStore(pool),
          provider: options.tickets.provider,
        },
        { apiKey: "synthetic-key", request },
      );
      await app.ready();
      sessions.push({ app, context: opened.context });

      const prepared = await app.inject({
        method: "POST",
        url: "/api/local/delegation",
        headers: { origin: LOCAL_ORIGIN },
        payload: { utterance: options.utterance },
      });
      expect(prepared.json()).toMatchObject({
        status: "completed",
        result: { status: "needs_confirmation" },
      });

      const confirmed = await app.inject({
        method: "POST",
        url: "/api/local/delegation",
        headers: { origin: LOCAL_ORIGIN },
        payload: { utterance: "Yes, please confirm it." },
      });
      return confirmed.json();
    }

    it("routes a spoken report to Transportation during business hours", async () => {
      const tickets = ticketProvider();
      const outcome = await runVoiceScenario({
        clock: "2026-09-16T16:00:00Z",
        utterance: "There is a large pothole at 15th and Pine",
        toolArguments: { ...POTHOLE, description: "large pothole" },
        tickets,
      });
      expect(outcome).toMatchObject({
        status: "completed",
        result: { status: "simulated_route", department: TRANSPORTATION },
      });
      expect(tickets.createTicket).not.toHaveBeenCalled();
    });

    it("routes a spoken park report to Parks & Recreation during business hours", async () => {
      const tickets = ticketProvider();
      const outcome = await runVoiceScenario({
        clock: "2026-09-16T16:00:00Z",
        utterance: "There is a broken swing at North Boulder Park",
        toolArguments: { ...PARK, description: "broken swing" },
        tickets,
      });
      expect(outcome).toMatchObject({
        status: "completed",
        result: { status: "simulated_route", department: PARKS },
      });
      expect(tickets.createTicket).not.toHaveBeenCalled();
    });

    it("files a spoken report as a ticket outside business hours", async () => {
      const tickets = ticketProvider();
      const outcome = await runVoiceScenario({
        clock: "2026-09-16T23:00:00Z",
        utterance: "There is a large pothole at 15th and Pine",
        toolArguments: { ...POTHOLE, description: "large pothole" },
        tickets,
      });
      expect(outcome).toMatchObject({
        status: "completed",
        result: { status: "linear_ticket_created", currentDetails: "fresh" },
      });
      expect(tickets.createTicket).toHaveBeenCalledTimes(1);
      expect(tickets.created()).toBe("Boulder demo: pothole report");
    });
  },
);
