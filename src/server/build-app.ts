/**
 * Local application composition root.
 * Builds the Fastify API that runs voice/text intake, the agent tools, DB-backed
 * routing, and ticket submission for local and reviewer modes.
 */
import { randomUUID } from "node:crypto";
import fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import type { CityEventsProvider } from "../adapters/city-website/events.js";
import type { PostgresDraftStore } from "../adapters/postgres/draft-store.js";
import { isWithinBusinessHours } from "../core/business-hours.js";
import {
  confirmServiceReport,
  type CityPolicyStore,
} from "../core/service-report/confirm-service-report.js";
import type {
  ReportContext,
  SupportedReportType,
} from "../core/service-report/prepare-service-report.js";
import type { CityKnowledgeReader } from "../core/city.js";
import type { TicketOperationStore } from "../core/service-report/ticket-operation.js";
import {
  callAgentTool,
  createAgentToolStubs,
  createReportToolHandler,
} from "./reasoning/agent-tools.js";
import type {
  AgentToolContext,
  AgentToolResult,
} from "./reasoning/tool-definitions.js";
import {
  submitConfirmedTicket,
  type TicketProvider,
} from "./workflow/confirmed-ticket.js";
import type { LocalConfirmResult } from "./workflow/confirm-outcome.js";
import { isLocalVoiceOrigin } from "./voice/live-session.js";
import { createKnowledgeToolHandlers } from "./reasoning/knowledge-tools.js";
import { runReasoningTurn } from "./reasoning/reasoning-turn.js";
import {
  newVisitorSession,
  registerVisitorSessions,
  type VisitorAccess,
  type VisitorSession,
} from "./visitor-sessions.js";

/** Fallback source used when no city calendar is configured. */
const unavailableEvents: CityEventsProvider = {
  upcomingEvents: async () => ({ status: "source_unavailable" }),
};

/** Server-owned city runtime read from the database at startup. */
export type CityRuntime = Readonly<{
  cityId: string;
  displayName: string;
  timeZone: string;
  eventsListingUrl: string;
  knowledge: CityKnowledgeReader;
}>;

type ReportBody = {
  requestType?: SupportedReportType;
  description?: string;
  location?: string;
};
type ConfirmBody = { draftId: string; revision: number };
type DelegationBody = { utterance: string };
type KnowledgeBody = {
  tool: "lookupMunicipalCode" | "lookupCityInformation" | "findCityEvents";
  query: string;
  startDate?: string;
  endDate?: string;
};

export type { LocalConfirmResult } from "./workflow/confirm-outcome.js";

const MAX_LOCAL_DELEGATIONS = 20;
const SUPERSEDED_REPORT_SPEECH =
  "A new report was started. Please repeat your request.";

/**
 * Fixed clock fixtures for the demo scenario toggle. The interviewer can flip
 * between a real open-hours and closed-hours time so both the route and ticket
 * paths can be experienced in one session. Server-owned, never caller-set.
 */
const SCENARIO_CLOCKS = {
  open: new Date("2026-09-16T16:00:00.000Z"),
  closed: new Date("2026-09-17T00:00:00.000Z"),
} as const;

type DemoScenario = "live" | "open" | "closed";

/**
 * Runs admitted visitor sessions through intake and DB-backed route simulation.
 * Input: POST `/api/local/report` with `{description:"Large pothole"}`.
 * Output: `needs_input`, then a revision-bound `needs_confirmation` after location.
 */
export function buildLocalApp(
  store: PostgresDraftStore,
  initialContext: ReportContext | null,
  policyStore: CityPolicyStore,
  city: CityRuntime,
  clock: () => Date = () => new Date(),
  ticketing?: { operations: TicketOperationStore; provider: TicketProvider },
  reasoning?: {
    apiKey: string | undefined;
    request?: typeof fetch;
    model?: string;
  },
  access?: VisitorAccess,
  events?: CityEventsProvider,
) {
  const app = fastify({
    logger: false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  let scenarioClock: Date | undefined;
  const effectiveClock = () => scenarioClock ?? clock();
  const eventsProvider = events ?? unavailableEvents;
  const handlers = {
    ...createAgentToolStubs(),
    ...createKnowledgeToolHandlers({
      clock: effectiveClock,
      events: eventsProvider,
      knowledge: city.knowledge,
      cityId: city.cityId,
      timeZone: city.timeZone,
      eventsListingUrl: city.eventsListingUrl,
    }),
    prepareServiceReport: createReportToolHandler(store),
  };
  if (!initialContext && !access) {
    throw new Error("A local context or visitor admission is required");
  }
  const developerSession = initialContext
    ? newVisitorSession(initialContext)
    : null;
  if (access) registerVisitorSessions(app, access);

  /** Input: an admitted request. Output: only that visitor's server-owned state. */
  function sessionFor(request: FastifyRequest): VisitorSession {
    const session = request.visitorSession ?? developerSession;
    if (!session) throw new Error("Visitor session was not admitted");
    return session;
  }

  /** Input: a report write followed by reset. Output: reset runs after the write and clears its active pointer. */
  function withReportLock<T>(
    session: VisitorSession,
    work: () => Promise<T>,
  ): Promise<T> {
    const result = session.reportWork.then(work, work);
    session.reportWork = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  /** Input: current-turn observation references. Output: a server-owned report tool context. */
  function reportToolContext(
    session: VisitorSession,
    fieldObservationIds: { description?: string; location?: string },
    observationIds: string[],
  ): AgentToolContext {
    return {
      ...session.context,
      runId: randomUUID(),
      channel: "text",
      observationIds,
      report: {
        draftId: session.currentDraft?.draftId ?? null,
        expectedRevision: session.currentDraft?.revision ?? null,
        fieldObservationIds,
      },
    };
  }

  app.get("/health", async () => ({ status: "ok" }));

  /** Input: none. Output: the configured city's display name for the UI header. */
  app.get("/api/city", async () => ({ displayName: city.displayName }));

  /**
   * Demo scenario toggle. Selects a fixed server clock so the interviewer can
   * experience both the open-hours route and the closed-hours ticket path in
   * one session. `live` restores the real clock. Server-owned, never caller-set.
   */
  app.post<{ Body: { scenario: DemoScenario } }>(
    "/api/local/scenario",
    {
      schema: {
        body: {
          type: "object",
          required: ["scenario"],
          properties: {
            scenario: { type: "string", enum: ["live", "open", "closed"] },
          },
          additionalProperties: false,
        },
      },
    },
    (request) => {
      const { scenario } = request.body;
      scenarioClock =
        scenario === "live" ? undefined : SCENARIO_CLOCKS[scenario];
      return {
        scenario,
        simulatedNow:
          scenarioClock === undefined ? null : scenarioClock.toISOString(),
      };
    },
  );

  app.post<{ Body: DelegationBody }>(
    "/api/local/delegation",
    {
      schema: {
        body: {
          type: "object",
          required: ["utterance"],
          properties: {
            utterance: { type: "string", minLength: 1, maxLength: 1200 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (!access && !isLocalVoiceOrigin(request.headers.origin)) {
        return reply.code(403).send({
          status: "unavailable",
          speech: "Voice access is unavailable.",
        });
      }
      const session = sessionFor(request);
      if (session.delegationCount >= MAX_LOCAL_DELEGATIONS) {
        return reply.code(429).send({
          status: "unavailable",
          speech:
            "I've reached my limit for this session — please try again in a little while.",
        });
      }
      session.delegationCount += 1;
      const generation = session.reportGeneration;

      const utterance = request.body.utterance.trim();
      const observation = await store.recordObservation(
        session.context,
        "voice",
        utterance,
      );
      if (observation.status !== "recorded") {
        return reply.code(503).send({
          status: "unavailable",
          speech:
            "I could not save this conversation turn, so I cannot continue that request.",
        });
      }
      const observationId = observation.observationId;
      if (generation !== session.reportGeneration) {
        return {
          status: "unavailable",
          speech: SUPERSEDED_REPORT_SPEECH,
        };
      }

      const current = session.currentDraft
        ? await callAgentTool(
            "prepareServiceReport",
            { requestType: session.currentDraft.requestType },
            { ...reportToolContext(session, {}, []), channel: "voice" },
            handlers,
          )
        : null;
      const activeDraft =
        current?.status === "needs_input"
          ? { requestType: current.requestType, missingFields: current.fields }
          : current?.status === "needs_confirmation"
            ? { requestType: current.summary.requestType, missingFields: [] }
            : undefined;

      /** Server-owned tool executor: binds scope, observations, and report locking. */
      async function executeDelegatedTool(
        name: string,
        args: Record<string, unknown>,
      ): Promise<AgentToolResult> {
        if (name === "confirmReport") {
          const current = session.currentDraft;
          if (!current) return { status: "blocked", code: "missing_draft" };
          return runConfirmation(session, current.draftId, current.revision);
        }
        if (name === "prepareServiceReport") {
          const location =
            typeof args.location === "string" ? args.location : undefined;
          const description =
            typeof args.description === "string" ? args.description : undefined;
          const requestType =
            args.requestType === "park_maintenance" ||
            args.requestType === "pothole"
              ? args.requestType
              : (session.currentDraft?.requestType ?? "pothole");
          const observedLocation =
            location && isSpokenSpan(utterance, location)
              ? location
              : undefined;
          const observedDescription =
            description && isSpokenSpan(utterance, description)
              ? description
              : undefined;
          const fieldObservationIds = {
            ...(observedLocation ? { location: observationId } : {}),
            ...(observedDescription ? { description: observationId } : {}),
          };
          return withReportLock(session, async () => {
            if (generation !== session.reportGeneration) {
              return { status: "rejected", reason: "missing_server_context" };
            }
            const prepared = await callAgentTool(
              "prepareServiceReport",
              {
                requestType,
                ...(observedLocation ? { location: observedLocation } : {}),
                ...(observedDescription
                  ? { description: observedDescription }
                  : {}),
              },
              {
                ...reportToolContext(session, fieldObservationIds, [
                  observationId,
                ]),
                channel: "voice",
              },
              handlers,
            );
            if (
              prepared.status === "needs_input" ||
              prepared.status === "needs_confirmation"
            ) {
              session.currentDraft = {
                draftId: prepared.draftId,
                revision: prepared.revision,
                requestType:
                  prepared.status === "needs_input"
                    ? prepared.requestType
                    : prepared.summary.requestType,
              };
            }
            return prepared;
          });
        }
        return callAgentTool(
          name,
          args,
          {
            ...session.context,
            runId: randomUUID(),
            channel: "voice",
            observationIds: [observationId],
          },
          handlers,
        );
      }

      /** Server-owned office status for the model to speak; never model-selected. */
      async function currentOfficeStatus(): Promise<
        "open" | "closed" | "unavailable"
      > {
        try {
          const loaded = await policyStore.load(session.context.cityId);
          if (loaded.status !== "available") return "unavailable";
          const open = isWithinBusinessHours(
            loaded.policy.schedule,
            effectiveClock(),
          );
          return open === true
            ? "open"
            : open === false
              ? "closed"
              : "unavailable";
        } catch {
          return "unavailable";
        }
      }

      const turn = await runReasoningTurn({
        utterance,
        cityName: city.displayName,
        ...(activeDraft ? { activeDraft } : {}),
        officeStatus: await currentOfficeStatus(),
        ...(session.lastAssistantSpeech
          ? { previousReply: session.lastAssistantSpeech }
          : {}),
        apiKey: reasoning?.apiKey,
        ...(reasoning?.request ? { request: reasoning.request } : {}),
        ...(reasoning?.model ? { model: reasoning.model } : {}),
        executeTool: executeDelegatedTool,
      });
      if (generation !== session.reportGeneration) {
        return {
          status: "unavailable",
          speech: SUPERSEDED_REPORT_SPEECH,
        };
      }
      if (turn.status !== "completed") {
        return reply.code(503).send({
          status: "unavailable",
          speech: "I could not check that request right now. Please try again.",
        });
      }
      session.lastAssistantSpeech = turn.speech;
      const lastResult = turn.toolCalls.at(-1)?.result;
      return {
        status: "completed",
        speech: turn.speech,
        ...(lastResult ? { result: lastResult } : {}),
      };
    },
  );
  app.post<{ Body: KnowledgeBody }>(
    "/api/local/knowledge",
    {
      schema: {
        body: {
          type: "object",
          required: ["tool", "query"],
          properties: {
            tool: {
              type: "string",
              enum: [
                "lookupMunicipalCode",
                "lookupCityInformation",
                "findCityEvents",
              ],
            },
            query: { type: "string", minLength: 1, maxLength: 500 },
            startDate: { type: "string", maxLength: 10 },
            endDate: { type: "string", maxLength: 10 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request) => {
      const session = sessionFor(request);
      const { tool, query, startDate, endDate } = request.body;
      return callAgentTool(
        tool,
        {
          query,
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
        },
        {
          ...session.context,
          runId: randomUUID(),
          channel: "text",
          observationIds: [],
        },
        handlers,
      );
    },
  );
  app.get("/api/local/report", async (request) => {
    const session = sessionFor(request);
    if (!session.currentDraft) return { status: "empty" };
    return callAgentTool(
      "prepareServiceReport",
      { requestType: session.currentDraft.requestType },
      reportToolContext(session, {}, []),
      handlers,
    );
  });
  app.post("/api/local/report/new", (request) => {
    const session = sessionFor(request);
    return withReportLock(session, async () => {
      session.reportGeneration += 1;
      session.currentDraft = null;
      return { status: "empty" };
    });
  });
  app.post<{ Body: ReportBody }>(
    "/api/local/report",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            requestType: {
              type: "string",
              enum: ["pothole", "park_maintenance"],
            },
            description: { type: "string", minLength: 1, maxLength: 500 },
            location: { type: "string", minLength: 1, maxLength: 500 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const session = sessionFor(request);
      const fieldObservationIds: {
        description?: string;
        location?: string;
      } = {};
      const observationIds: string[] = [];
      for (const field of ["description", "location"] as const) {
        const text = request.body[field];
        if (text === undefined) continue;
        const recorded = await store.recordObservation(
          session.context,
          "text",
          text,
        );
        if (recorded.status !== "recorded") {
          const code =
            recorded.status === "invalid_input"
              ? "invalid_input"
              : recorded.status === "denied"
                ? "scope_mismatch"
                : "store_unavailable";
          return reply.code(code === "store_unavailable" ? 503 : 400).send({
            status: "blocked",
            code,
          });
        }
        fieldObservationIds[field] = recorded.observationId;
        observationIds.push(recorded.observationId);
      }

      return withReportLock(session, async () => {
        const result = await callAgentTool(
          "prepareServiceReport",
          {
            ...request.body,
            requestType:
              request.body.requestType ??
              session.currentDraft?.requestType ??
              "pothole",
          },
          reportToolContext(session, fieldObservationIds, observationIds),
          handlers,
        );
        if (
          result.status === "needs_input" ||
          result.status === "needs_confirmation"
        ) {
          session.currentDraft = {
            draftId: result.draftId,
            revision: result.revision,
            requestType:
              result.status === "needs_input"
                ? result.requestType
                : result.summary.requestType,
          };
        }
        return result;
      });
    },
  );

  /** Input: a session and a revision-bound confirmation. Output: one confirmation attempt. */
  async function runConfirmation(
    session: VisitorSession,
    draftId: string,
    revision: number,
  ): Promise<LocalConfirmResult> {
    if (ticketing && session.currentDraft?.draftId === draftId) {
      const existing = await ticketing.operations.findByDraft(
        session.context,
        draftId,
        revision,
      );
      if (existing.status === "found") {
        return submitConfirmedTicket(
          session.context,
          draftId,
          revision,
          existing.operation.policyRevision,
          ticketing.operations,
          ticketing.provider,
          city.displayName,
        );
      }
      if (existing.status === "unavailable") {
        return { status: "blocked", code: "store_unavailable" };
      }
      if (existing.status === "blocked") return existing;
    }
    const decision =
      session.currentDraft && session.currentDraft.draftId !== draftId
        ? ({ status: "blocked", code: "revision_conflict" } as const)
        : await confirmServiceReport(
            session.context,
            session.currentDraft?.draftId ?? null,
            revision,
            store,
            policyStore,
            effectiveClock,
          );
    if (decision.status !== "ticket_required") return decision;
    return ticketing
      ? await submitConfirmedTicket(
          session.context,
          decision.draftId,
          decision.revision,
          decision.policyRevision,
          ticketing.operations,
          ticketing.provider,
          city.displayName,
        )
      : { status: "ticket_path_unavailable", reason: "not_configured" };
  }

  /** Input: `{draftId: "saved-id", revision: 2}` from a review button. Output: a simulated route or an honest unavailable result. */
  async function confirmReport(
    request: FastifyRequest<{ Body: ConfirmBody }>,
    reply: FastifyReply,
  ) {
    const session = sessionFor(request);
    const result = await runConfirmation(
      session,
      request.body.draftId,
      request.body.revision,
    );
    if (result.status !== "blocked") return result;
    const statusCode =
      result.code === "revision_conflict"
        ? 409
        : result.code === "store_unavailable" ||
            result.code === "policy_unavailable"
          ? 503
          : 400;
    return reply.code(statusCode).send(result);
  }

  app.post<{ Body: ConfirmBody }>(
    "/api/local/report/confirm",
    {
      schema: {
        body: {
          type: "object",
          required: ["draftId", "revision"],
          properties: {
            draftId: { type: "string", minLength: 1 },
            revision: { type: "integer", minimum: 1 },
          },
          additionalProperties: false,
        },
      },
    },
    confirmReport,
  );

  return app;
}

/**
 * Checks that a model-proposed report field is an exact span of what the
 * caller said. The instruction asks the model to pass the caller's own words,
 * so a paraphrase is rejected and the model can retry with the exact words;
 * this keeps report content backed by caller evidence with no fuzzy matching.
 * Input: `"It's deep"` and `"deep"`. Output: `true`.
 */
function isSpokenSpan(utterance: string, field: string): boolean {
  const normalize = (value: string) =>
    value.toLowerCase().replace(/\s+/g, " ").trim();
  const spoken = normalize(utterance);
  const proposed = normalize(field);
  return proposed.length > 0 && spoken.includes(proposed);
}
