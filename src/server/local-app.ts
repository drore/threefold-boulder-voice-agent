import { randomUUID } from "node:crypto";
import fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import {
  createBoulderEventsProvider,
  type CityEventsProvider,
} from "../adapters/boulder/events.js";
import type { PostgresDraftStore } from "../adapters/postgres/draft-store.js";
import {
  confirmServiceReport,
  type CityPolicyReader,
  type ConfirmServiceReportDecision,
} from "../core/confirm-service-report.js";
import type {
  ReportContext,
  SupportedReportType,
} from "../core/prepare-service-report.js";
import type { TicketOperationStore } from "../core/ticket-operation.js";
import {
  callAgentTool,
  createAgentToolStubs,
  createReportToolHandler,
  type AgentToolContext,
  type AgentToolResult,
} from "./agent-tools.js";
import {
  submitConfirmedTicket,
  type ConfirmedTicketResult,
  type TicketProvider,
} from "./confirmed-ticket.js";
import { proposeCitizenIntent } from "./intent-proposal.js";
import { isLocalVoiceOrigin } from "./live-session.js";
import { createReviewedKnowledgeToolHandlers } from "./reviewed-knowledge.js";
import {
  newVisitorSession,
  registerVisitorSessions,
  type VisitorAccess,
  type VisitorSession,
} from "./visitor-sessions.js";

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

export type LocalConfirmResult =
  | Exclude<ConfirmServiceReportDecision, { status: "ticket_required" }>
  | ConfirmedTicketResult
  | { status: "ticket_path_unavailable"; reason: "not_configured" };

const MAX_LOCAL_DELEGATIONS = 20;
const SUPERSEDED_REPORT_SPEECH =
  "A new report was started. Please repeat your request.";
const CAPABILITIES_SPEECH =
  "Here is what you can ask me: the reviewed Boulder rule about glass containers in parks, how to report a pothole to the city, upcoming events from Boulder's official calendar, or report a nonurgent pothole or park-maintenance issue for review on screen. What would you like to do?";

/**
 * Runs admitted visitor sessions through intake and DB-backed route simulation.
 * Input: POST `/api/local/report` with `{description:"Large pothole"}`.
 * Output: `needs_input`, then a revision-bound `needs_confirmation` after location.
 */
export function buildLocalApp(
  store: PostgresDraftStore,
  initialContext: ReportContext | null,
  policyStore: CityPolicyReader,
  clock: () => Date = () => new Date(),
  ticketing?: { operations: TicketOperationStore; provider: TicketProvider },
  reasoning?: { apiKey: string | undefined; request?: typeof fetch },
  access?: VisitorAccess,
  events?: CityEventsProvider,
) {
  const app = fastify({
    logger: false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  const eventsProvider = events ?? createBoulderEventsProvider({ clock });
  const handlers = {
    ...createAgentToolStubs(),
    ...createReviewedKnowledgeToolHandlers(clock, eventsProvider),
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
          speech: "This demo session has reached its voice request limit.",
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
      const proposed = await proposeCitizenIntent(
        utterance,
        reasoning?.apiKey,
        reasoning?.request,
        activeDraft,
      );
      if (generation !== session.reportGeneration) {
        return {
          status: "unavailable",
          speech: SUPERSEDED_REPORT_SPEECH,
        };
      }
      if (proposed.status !== "proposed") {
        return reply.code(503).send({
          status: "unavailable",
          speech: "I could not check that request right now. Please try again.",
        });
      }

      const { intent, requestType, location, description } = proposed.proposal;
      if (intent === "unclear") {
        return {
          status: "unavailable",
          speech:
            "Could you clarify your Boulder question or describe the nonurgent issue you want to report?",
        };
      }
      if (intent === "capabilities") {
        return { status: "completed", speech: CAPABILITIES_SPEECH };
      }
      if (intent === "out_of_scope") {
        return {
          status: "unavailable",
          speech:
            "This demo covers a small set of Boulder code, city information, events, and nonurgent pothole or park maintenance reports.",
        };
      }
      if (intent === "service_report") {
        const observedLocation =
          location && isSpokenField(utterance, location) ? location : undefined;
        const observedDescription =
          description && isSpokenField(utterance, description)
            ? description
            : undefined;
        const fieldObservationIds = {
          ...(observedLocation ? { location: observation.observationId } : {}),
          ...(observedDescription
            ? { description: observation.observationId }
            : {}),
        };
        const result = await withReportLock(session, async () => {
          if (generation !== session.reportGeneration) return null;
          const prepared = await callAgentTool(
            "prepareServiceReport",
            {
              requestType:
                requestType ?? session.currentDraft?.requestType ?? "pothole",
              ...(observedLocation ? { location: observedLocation } : {}),
              ...(observedDescription
                ? { description: observedDescription }
                : {}),
            },
            {
              ...reportToolContext(session, fieldObservationIds, [
                observation.observationId,
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
        if (result === null || generation !== session.reportGeneration) {
          return {
            status: "unavailable",
            speech: SUPERSEDED_REPORT_SPEECH,
          };
        }
        return { status: "completed", speech: speechForResult(result), result };
      }

      const tool =
        intent === "municipal_code"
          ? "lookupMunicipalCode"
          : intent === "city_information"
            ? "lookupCityInformation"
            : "findCityEvents";
      const result = await callAgentTool(
        tool,
        { query: utterance },
        {
          ...session.context,
          runId: randomUUID(),
          channel: "voice",
          observationIds: [observation.observationId],
        },
        handlers,
      );
      return { status: "completed", speech: speechForResult(result), result };
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

  /** Input: `{draftId: "saved-id", revision: 2}` from a review button. Output: a simulated route or an honest unavailable result. */
  async function confirmReport(
    request: FastifyRequest<{ Body: ConfirmBody }>,
    reply: FastifyReply,
  ) {
    const session = sessionFor(request);
    if (ticketing && session.currentDraft?.draftId === request.body.draftId) {
      const existing = await ticketing.operations.findByDraft(
        session.context,
        request.body.draftId,
        request.body.revision,
      );
      if (existing.status === "found") {
        return submitConfirmedTicket(
          session.context,
          request.body.draftId,
          request.body.revision,
          existing.operation.policyRevision,
          ticketing.operations,
          ticketing.provider,
        );
      }
      if (existing.status === "unavailable") {
        return reply
          .code(503)
          .send({ status: "blocked", code: "store_unavailable" });
      }
      if (existing.status === "blocked") {
        return reply.code(409).send(existing);
      }
    }
    const decision =
      session.currentDraft &&
      session.currentDraft.draftId !== request.body.draftId
        ? ({ status: "blocked", code: "revision_conflict" } as const)
        : await confirmServiceReport(
            session.context,
            session.currentDraft?.draftId ?? null,
            request.body.revision,
            store,
            policyStore,
            clock,
          );
    const result: LocalConfirmResult =
      decision.status !== "ticket_required"
        ? decision
        : ticketing
          ? await submitConfirmedTicket(
              session.context,
              decision.draftId,
              decision.revision,
              decision.policyRevision,
              ticketing.operations,
              ticketing.provider,
            )
          : { status: "ticket_path_unavailable", reason: "not_configured" };
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

/** Input: caller text `"at 15th and Pine"` and extracted `"15th and Pine"`. Output: `true` only for a spoken span. */
function isSpokenField(utterance: string, field: string): boolean {
  const normalize = (value: string) =>
    value.toLowerCase().replace(/\s+/g, " ").trim();
  return normalize(utterance).includes(normalize(field));
}

/** Input: a validated application tool result. Output: a short factual update for GPT-Live to speak. */
function speechForResult(result: AgentToolResult): string {
  switch (result.status) {
    case "answered":
      return `${result.answer} Reviewed source: ${result.sources.map((source) => source.title).join(", ")}.`;
    case "limited_coverage":
      return "I do not have a current reviewed answer for that question in this demo. Please consult the official Boulder source.";
    case "needs_input":
      return `I saved a draft. Please tell me the ${result.fields.join(" and ")}.`;
    case "needs_confirmation":
      return `I have ${result.summary.description} at ${result.summary.location}. Please review and confirm the details on screen before I route or create a ticket.`;
    default:
      return "I could not complete that request. Please review the details on screen or try again.";
  }
}
