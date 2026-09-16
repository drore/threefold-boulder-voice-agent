import { describe, expect, it, vi } from "vitest";
import type {
  BoulderEventOccurrence,
  CityEventsQueryResult,
  CityEventsProvider,
} from "../../src/adapters/boulder/events.js";
import {
  agentToolDefinitions,
  callAgentTool,
  createAgentToolStubs,
  createReportToolHandler,
  type AgentToolContext,
  type AgentToolHandlers,
} from "../../src/server/agent-tools.js";
import { createReviewedKnowledgeToolHandlers } from "../../src/server/reviewed-knowledge.js";

const CONTEXT: AgentToolContext = {
  conversationId: "server-owned-conversation",
  cityId: "boulder-co",
  admissionId: "server-owned-admission",
  runId: "server-owned-run",
  channel: "voice",
  observationIds: ["observed-caller-turn"],
};

const SUPPORTED_REVIEWED_TOPICS = [
  "BRC 8-3-9 glass containers in parks/open space",
  "Boulder pothole reporting information",
  "Upcoming events from the official Boulder calendar",
] as const;

const FAKE_OCCURRENCES: readonly BoulderEventOccurrence[] = [
  {
    title: "City Council Study Session",
    detailUrl:
      "https://bouldercolorado.gov/events/city-council-study-session-61",
    date: "2026-09-24",
    locationText: "Virtual",
    status: "unknown",
  },
  {
    title: "City Council Meeting",
    detailUrl: "https://bouldercolorado.gov/events/city-council-meeting-110",
    date: "2026-09-17",
    locationText: "Penfield Tate II Municipal Building",
    status: "unknown",
  },
  {
    title: "Planning Board Meeting (hybrid)",
    detailUrl:
      "https://bouldercolorado.gov/events/planning-board-meeting-hybrid-37",
    date: "2026-09-15",
    locationText: null,
    status: "unknown",
  },
  {
    title: "Downtown Management Commission Meeting",
    detailUrl:
      "https://bouldercolorado.gov/events/downtown-management-commission-meeting-31",
    date: "2026-09-22",
    locationText: "Virtual",
    status: "unknown",
  },
];

/** Input: fixed occurrences. Output: a provider whose cache is always fresh at the test clock. */
function eventsProviderWith(
  result: CityEventsQueryResult = {
    status: "ok",
    occurrences: FAKE_OCCURRENCES,
    fetchedAtUtc: "2026-09-16T12:00:00.000Z",
    expiresAtUtc: "2026-09-17T12:00:00.000Z",
  },
): CityEventsProvider {
  return { upcomingEvents: vi.fn(async () => result) };
}

/**
 * Builds the reviewed local knowledge handlers with a deterministic server
 * clock and a fake live-events provider.
 * Input: `"2026-09-16T12:00:00Z"`. Output: three lookup handlers.
 */
function reviewedHandlers(
  nowUtc: string,
  events: CityEventsProvider = eventsProviderWith(),
): Partial<AgentToolHandlers> {
  return createReviewedKnowledgeToolHandlers(() => new Date(nowUtc), events);
}

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
      requestType: "pothole",
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

  it("answers the reviewed BRC 8-3-9 glass-container question with the code exception", async () => {
    const result = await callAgentTool(
      "lookupMunicipalCode",
      { query: "Can I bring a glass bottle into a Boulder park?" },
      CONTEXT,
      {
        ...createAgentToolStubs(),
        ...reviewedHandlers("2026-09-16T12:00:00Z"),
      },
    );

    expect(result).toMatchObject({
      status: "answered",
      coverage: "reviewed_example",
      sources: [
        {
          kind: "municipal_code",
          url: expect.stringContaining("8-3-9GLBOPR"),
        },
      ],
    });
    expect(result.status === "answered" && result.answer).toContain(
      "prescription medication",
    );
    expect(result.status === "answered" && result.answer).toContain(
      "city parks, parkways, recreation areas, and open space",
    );
  });

  it("matches a direct BRC 8-3-9 lookup without requiring the caller to say glass", async () => {
    const result = await callAgentTool(
      "lookupMunicipalCode",
      { query: "What is BRC 8-3-9?" },
      CONTEXT,
      {
        ...createAgentToolStubs(),
        ...reviewedHandlers("2026-09-16T12:00:00Z"),
      },
    );

    expect(result).toMatchObject({
      status: "answered",
      sources: [{ kind: "municipal_code" }],
    });
  });

  it("does not answer legal-currentness questions from a checked-in code excerpt", async () => {
    const result = await callAgentTool(
      "lookupMunicipalCode",
      { query: "Has BRC 8-3-9 been repealed?" },
      CONTEXT,
      {
        ...createAgentToolStubs(),
        ...reviewedHandlers("2026-09-16T12:00:00Z"),
      },
    );
    expect(result).toMatchObject({ status: "limited_coverage" });
  });

  it("does not count website pothole guidance as municipal-code evidence", async () => {
    const result = await callAgentTool(
      "lookupMunicipalCode",
      { query: "What does the municipal code say about pothole reports?" },
      CONTEXT,
      {
        ...createAgentToolStubs(),
        ...reviewedHandlers("2026-09-16T12:00:00Z"),
      },
    );

    expect(result).toEqual({
      status: "limited_coverage",
      coverage: "reviewed_examples_only",
      reason: "unsupported_query",
      supportedTopics: SUPPORTED_REVIEWED_TOPICS,
    });
  });

  it("answers the reviewed pothole guidance through the city-information tool", async () => {
    const result = await callAgentTool(
      "lookupCityInformation",
      { query: "How should I report a pothole?" },
      CONTEXT,
      {
        ...createAgentToolStubs(),
        ...reviewedHandlers("2026-09-16T12:00:00Z"),
      },
    );

    expect(result).toMatchObject({
      status: "answered",
      coverage: "reviewed_example",
      sources: [{ kind: "city_website" }],
    });
    expect(result.status === "answered" && result.answer).toContain("location");
    expect(result.status === "answered" && result.answer).toContain(
      "address or intersection",
    );
    expect(result.status === "answered" && result.answer).toContain(
      "description",
    );
    expect(result.status === "answered" && result.answer).toContain(
      "online request",
    );
  });

  it("does not answer a pothole claims staffing question with reporting guidance", async () => {
    const result = await callAgentTool(
      "lookupCityInformation",
      { query: "Who in street maintenance handles pothole claims?" },
      CONTEXT,
      {
        ...createAgentToolStubs(),
        ...reviewedHandlers("2026-09-16T12:00:00Z"),
      },
    );
    expect(result).toMatchObject({ status: "limited_coverage" });
  });

  it("answers upcoming council events from the live official calendar", async () => {
    const result = await callAgentTool(
      "findCityEvents",
      { query: "Any upcoming city council event?" },
      CONTEXT,
      {
        ...createAgentToolStubs(),
        ...reviewedHandlers("2026-09-16T12:00:00Z"),
      },
    );

    expect(result).toMatchObject({
      status: "answered",
      coverage: "live_official_source",
      sources: [
        { kind: "city_event", title: "City Council Meeting" },
        { kind: "city_event", title: "City Council Study Session" },
      ],
    });
    expect(result.status === "answered" && result.answer).toContain(
      "City Council Meeting",
    );
    expect(result.status === "answered" && result.answer).toContain("Sep 17");
    expect(result.status === "answered" && result.answer).toContain(
      "Penfield Tate II Municipal Building",
    );
    expect(result.status === "answered" && result.answer).toContain(
      "City Council Study Session",
    );
    expect(result.status === "answered" && result.answer).toContain("Sep 24");
    expect(result.status === "answered" && result.answer).toContain(
      "(virtual)",
    );
    expect(result.status === "answered" && result.answer).not.toContain(
      "Planning Board",
    );
    expect(result.status === "answered" && result.answer).not.toContain(
      "Downtown Management",
    );
  });

  it("honors a structured date range for the live calendar answer", async () => {
    const result = await callAgentTool(
      "findCityEvents",
      {
        query: "Is there an upcoming City Council study session?",
        startDate: "2026-09-24",
        endDate: "2026-09-24",
      },
      CONTEXT,
      {
        ...createAgentToolStubs(),
        ...reviewedHandlers("2026-09-16T12:00:00Z"),
      },
    );

    expect(result).toMatchObject({ status: "answered" });
    expect(result.status === "answered" && result.answer).toContain(
      "City Council Study Session",
    );
    expect(result.status === "answered" && result.answer).not.toContain(
      "City Council Meeting",
    );
  });

  it("does not present past-dated calendar entries as upcoming", async () => {
    const result = await callAgentTool(
      "findCityEvents",
      { query: "Any upcoming city council event?" },
      CONTEXT,
      {
        ...createAgentToolStubs(),
        ...reviewedHandlers("2026-09-26T12:00:00Z"),
      },
    );

    expect(result.status === "answered" && result.answer).toBe(
      "No upcoming City Council events appear on the official Boulder calendar in the checked date range.",
    );
  });

  it("answers honestly when a requested range has no events", async () => {
    const result = await callAgentTool(
      "findCityEvents",
      {
        query: "Any upcoming city council event?",
        startDate: "2026-09-25",
        endDate: "2026-09-26",
      },
      CONTEXT,
      {
        ...createAgentToolStubs(),
        ...reviewedHandlers("2026-09-16T12:00:00Z"),
      },
    );

    expect(result.status === "answered" && result.answer).toBe(
      "No upcoming City Council events appear on the official Boulder calendar in the checked date range.",
    );
  });

  it("returns limited coverage when the live calendar source is unavailable", async () => {
    const result = await callAgentTool(
      "findCityEvents",
      { query: "Any upcoming city council event?" },
      CONTEXT,
      {
        ...createAgentToolStubs(),
        ...reviewedHandlers(
          "2026-09-16T12:00:00Z",
          eventsProviderWith({ status: "source_unavailable" }),
        ),
      },
    );

    expect(result).toEqual({
      status: "limited_coverage",
      coverage: "reviewed_examples_only",
      reason: "source_unavailable",
      supportedTopics: SUPPORTED_REVIEWED_TOPICS,
    });
  });

  it("does not answer a different explicit event date with the checked calendar window", async () => {
    const handlers = {
      ...createAgentToolStubs(),
      ...reviewedHandlers("2026-09-16T12:00:00Z"),
    };
    for (const query of [
      "Are there city council events on 2026-09-17?",
      "Are there city council events on September 17?",
      "Is there a City Council Study Session on October 22?",
      "Is there a City Council Study Session on 9/17?",
      "Was the City Council Study Session cancelled?",
    ]) {
      const result = await callAgentTool(
        "findCityEvents",
        { query },
        CONTEXT,
        handlers,
      );
      expect(result).toMatchObject({ status: "limited_coverage" });
    }
  });

  it("treats malformed event date ranges as limited coverage", async () => {
    const result = await callAgentTool(
      "findCityEvents",
      { query: "Any upcoming city council event?", startDate: "2026-02-30" },
      CONTEXT,
      {
        ...createAgentToolStubs(),
        ...reviewedHandlers("2026-09-16T12:00:00Z"),
      },
    );

    expect(result).toMatchObject({
      status: "limited_coverage",
      reason: "unsupported_query",
    });
  });

  it("returns limited coverage for unrelated knowledge questions", async () => {
    const result = await callAgentTool(
      "lookupCityInformation",
      { query: "Who is the city manager?" },
      CONTEXT,
      {
        ...createAgentToolStubs(),
        ...reviewedHandlers("2026-09-16T12:00:00Z"),
      },
    );

    expect(result).toMatchObject({
      status: "limited_coverage",
      coverage: "reviewed_examples_only",
      reason: "unsupported_query",
    });
  });
});
