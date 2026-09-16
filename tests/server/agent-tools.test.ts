import { describe, expect, it, vi } from "vitest";
import {
  agentToolDefinitions,
  callAgentTool,
  createAgentToolStubs,
  createReportToolHandler,
  type AgentToolContext,
  type AgentToolHandlers,
} from "../../src/server/agent-tools.js";

const CONTEXT: AgentToolContext = {
  conversationId: "server-owned-conversation",
  cityId: "boulder-co",
  admissionId: "server-owned-admission",
  runId: "server-owned-run",
  channel: "voice",
  observationIds: ["observed-caller-turn"],
};

describe("agent tool boundary", () => {
  it("exposes only the four P0 agent capabilities", () => {
    expect(agentToolDefinitions.map(({ name }) => name)).toEqual([
      "lookupMunicipalCode",
      "lookupCityInformation",
      "findCityEvents",
      "prepareServiceReport",
    ]);
    expect(
      agentToolDefinitions.every(
        ({ parameters }) => !parameters.additionalProperties,
      ),
    ).toBe(true);
  });

  it("passes a valid event request and server context to the event handler", async () => {
    const handler = vi.fn(async () => ({
      status: "unavailable" as const,
      reason: "not_implemented" as const,
    }));
    const handlers: AgentToolHandlers = {
      ...createAgentToolStubs(),
      findCityEvents: handler,
    };

    await callAgentTool(
      "findCityEvents",
      {
        query: "What is happening this weekend?",
        startDate: "2026-09-19",
        endDate: "2026-09-20",
      },
      CONTEXT,
      handlers,
    );

    expect(handler).toHaveBeenCalledExactlyOnceWith(
      {
        query: "What is happening this weekend?",
        startDate: "2026-09-19",
        endDate: "2026-09-20",
      },
      CONTEXT,
    );
  });

  it("passes a report proposal only to the draft handler", async () => {
    const handler = vi.fn(createAgentToolStubs().prepareServiceReport);
    const handlers: AgentToolHandlers = {
      ...createAgentToolStubs(),
      prepareServiceReport: handler,
    };

    await callAgentTool(
      "prepareServiceReport",
      {
        requestType: "pothole",
        location: "15th and Pine",
        description: "large pothole",
      },
      CONTEXT,
      handlers,
    );

    expect(handler).toHaveBeenCalledExactlyOnceWith(
      {
        requestType: "pothole",
        location: "15th and Pine",
        description: "large pothole",
      },
      CONTEXT,
    );
  });

  it("binds a report proposal to server-owned observation and draft scope", async () => {
    const store = {
      load: vi.fn(async () => ({ status: "empty" as const })),
      save: vi.fn(async () => ({
        status: "saved" as const,
        draft: {
          draftId: "draft-1",
          conversationId: CONTEXT.conversationId,
          cityId: CONTEXT.cityId,
          revision: 1,
          requestType: "pothole" as const,
          description: {
            text: "Large pothole",
            observationId: "observed-caller-turn",
          },
        },
      })),
    };
    const context: AgentToolContext = {
      ...CONTEXT,
      report: {
        draftId: null,
        expectedRevision: null,
        fieldObservationIds: { description: "observed-caller-turn" },
      },
    };

    expect(
      await callAgentTool(
        "prepareServiceReport",
        { requestType: "pothole", description: "Large pothole" },
        context,
        {
          ...createAgentToolStubs(),
          prepareServiceReport: createReportToolHandler(store),
        },
      ),
    ).toEqual({
      status: "needs_input",
      draftId: "draft-1",
      revision: 1,
      fields: ["location"],
    });
    expect(store.save).toHaveBeenCalledExactlyOnceWith(
      {
        conversationId: CONTEXT.conversationId,
        cityId: CONTEXT.cityId,
        admissionId: CONTEXT.admissionId,
      },
      null,
      null,
      {
        requestType: "pothole",
        description: {
          text: "Large pothole",
          observationId: "observed-caller-turn",
        },
      },
    );
  });

  it("rejects an unobserved report field before it can reach the store", async () => {
    const store = {
      load: vi.fn(async () => ({ status: "empty" as const })),
      save: vi.fn(),
    };
    const context: AgentToolContext = {
      ...CONTEXT,
      report: {
        draftId: null,
        expectedRevision: null,
        fieldObservationIds: {},
      },
    };

    expect(
      await callAgentTool(
        "prepareServiceReport",
        { requestType: "pothole", location: "Invented location" },
        context,
        {
          ...createAgentToolStubs(),
          prepareServiceReport: createReportToolHandler(store),
        },
      ),
    ).toEqual({ status: "rejected", reason: "missing_observation" });
    expect(store.load).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("uses the same tool handler for a server-scoped text conversation", async () => {
    const handler = vi.fn(createAgentToolStubs().lookupCityInformation);
    const context: AgentToolContext = { ...CONTEXT, channel: "text" };

    await callAgentTool(
      "lookupCityInformation",
      { query: "Which department handles potholes?" },
      context,
      { ...createAgentToolStubs(), lookupCityInformation: handler },
    );

    expect(handler).toHaveBeenCalledExactlyOnceWith(
      { query: "Which department handles potholes?" },
      context,
    );
  });

  it("rejects unknown tools and does not invoke a handler", async () => {
    const handler = vi.fn(createAgentToolStubs().lookupCityInformation);
    const handlers = {
      ...createAgentToolStubs(),
      lookupCityInformation: handler,
    };

    expect(
      await callAgentTool(
        "openLinearTicket",
        { query: "anything" },
        CONTEXT,
        handlers,
      ),
    ).toEqual({ status: "rejected", reason: "unknown_tool" });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    ["lookupMunicipalCode", {}],
    ["lookupMunicipalCode", { query: "" }],
    ["lookupCityInformation", { query: "parks", url: "https://other.test" }],
    ["findCityEvents", ["events"]],
    ["findCityEvents", { query: "events", startDate: 123 }],
    ["prepareServiceReport", { requestType: "arbitrary" }],
    ["prepareServiceReport", { requestType: "pothole", confirmed: true }],
    ["prepareServiceReport", { requestType: "pothole", channel: "text" }],
  ])("rejects invalid arguments for %s", async (name, input) => {
    expect(
      await callAgentTool(name, input, CONTEXT, createAgentToolStubs()),
    ).toEqual({
      status: "rejected",
      reason: "invalid_arguments",
    });
  });

  it("returns an honest unavailable outcome for every unfinished capability", async () => {
    const handlers = createAgentToolStubs();
    const calls = [
      ["lookupMunicipalCode", { query: "glass in parks" }],
      ["lookupCityInformation", { query: "who handles potholes" }],
      ["findCityEvents", { query: "events today" }],
      [
        "prepareServiceReport",
        { requestType: "pothole", location: "15th and Pine" },
      ],
    ] as const;

    for (const [name, input] of calls) {
      expect(await callAgentTool(name, input, CONTEXT, handlers)).toEqual({
        status: "unavailable",
        reason: "not_implemented",
      });
    }
  });
});
