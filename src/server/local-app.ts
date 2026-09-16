import { randomUUID } from "node:crypto";
import fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import type { PostgresDraftStore } from "../adapters/postgres/draft-store.js";
import {
  confirmPotholeRoute,
  type CityPolicyReader,
  type ConfirmPotholeDecision,
} from "../core/confirm-pothole-route.js";
import type { ReportContext } from "../core/prepare-service-report.js";
import type { TicketOperationStore } from "../core/ticket-operation.js";
import {
  callAgentTool,
  createAgentToolStubs,
  createReportToolHandler,
  type AgentToolContext,
} from "./agent-tools.js";
import {
  submitConfirmedTicket,
  type ConfirmedTicketResult,
  type TicketProvider,
} from "./confirmed-ticket.js";
import { createReviewedKnowledgeToolHandlers } from "./reviewed-knowledge.js";

type ReportBody = { description?: string; location?: string };
type ConfirmBody = { draftId: string; revision: number };
type KnowledgeBody = {
  tool: "lookupMunicipalCode" | "lookupCityInformation" | "findCityEvents";
  query: string;
  startDate?: string;
  endDate?: string;
};

export type LocalConfirmResult =
  | Exclude<ConfirmPotholeDecision, { status: "ticket_required" }>
  | ConfirmedTicketResult
  | { status: "ticket_path_unavailable"; reason: "not_configured" };

/**
 * Runs one local developer session through intake and DB-backed route simulation.
 * Input: POST `/api/local/report` with `{description:"Large pothole"}`.
 * Output: `needs_input`, then a revision-bound `needs_confirmation` after location.
 */
export function buildLocalApp(
  store: PostgresDraftStore,
  context: ReportContext,
  policyStore: CityPolicyReader,
  clock: () => Date = () => new Date(),
  ticketing?: { operations: TicketOperationStore; provider: TicketProvider },
) {
  const app = fastify({
    logger: false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  const handlers = {
    ...createAgentToolStubs(),
    ...createReviewedKnowledgeToolHandlers(clock),
    prepareServiceReport: createReportToolHandler(store),
  };
  let currentDraft: { draftId: string; revision: number } | null = null;

  /** Input: current-turn observation references. Output: a server-owned report tool context. */
  function reportToolContext(
    fieldObservationIds: { description?: string; location?: string },
    observationIds: string[],
  ): AgentToolContext {
    return {
      ...context,
      runId: randomUUID(),
      channel: "text",
      observationIds,
      report: {
        draftId: currentDraft?.draftId ?? null,
        expectedRevision: currentDraft?.revision ?? null,
        fieldObservationIds,
      },
    };
  }

  app.get("/health", async () => ({ status: "ok" }));
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
      const { tool, query, startDate, endDate } = request.body;
      return callAgentTool(
        tool,
        {
          query,
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
        },
        {
          ...context,
          runId: randomUUID(),
          channel: "text",
          observationIds: [],
        },
        handlers,
      );
    },
  );
  app.get("/api/local/report", async () => {
    if (!currentDraft) return { status: "empty" };
    return callAgentTool(
      "prepareServiceReport",
      { requestType: "pothole" },
      reportToolContext({}, []),
      handlers,
    );
  });
  app.post<{ Body: ReportBody }>(
    "/api/local/report",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            description: { type: "string", minLength: 1, maxLength: 500 },
            location: { type: "string", minLength: 1, maxLength: 500 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const fieldObservationIds: {
        description?: string;
        location?: string;
      } = {};
      const observationIds: string[] = [];
      for (const field of ["description", "location"] as const) {
        const text = request.body[field];
        if (text === undefined) continue;
        const recorded = await store.recordObservation(context, "text", text);
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

      const result = await callAgentTool(
        "prepareServiceReport",
        { requestType: "pothole", ...request.body },
        reportToolContext(fieldObservationIds, observationIds),
        handlers,
      );
      if (
        result.status === "needs_input" ||
        result.status === "needs_confirmation"
      ) {
        currentDraft = { draftId: result.draftId, revision: result.revision };
      }
      return result;
    },
  );

  /** Input: `{draftId: "saved-id", revision: 2}` from a review button. Output: a simulated route or an honest unavailable result. */
  async function confirmReport(
    request: FastifyRequest<{ Body: ConfirmBody }>,
    reply: FastifyReply,
  ) {
    if (ticketing && currentDraft?.draftId === request.body.draftId) {
      const existing = await ticketing.operations.findByDraft(
        context,
        request.body.draftId,
        request.body.revision,
      );
      if (existing.status === "found") {
        return submitConfirmedTicket(
          context,
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
      currentDraft && currentDraft.draftId !== request.body.draftId
        ? ({ status: "blocked", code: "revision_conflict" } as const)
        : await confirmPotholeRoute(
            context,
            currentDraft?.draftId ?? null,
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
              context,
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
