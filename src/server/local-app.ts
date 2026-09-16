import { randomUUID } from "node:crypto";
import fastify from "fastify";
import type { PostgresDraftStore } from "../adapters/postgres/draft-store.js";
import type { ReportContext } from "../core/prepare-service-report.js";
import {
  callAgentTool,
  createAgentToolStubs,
  createReportToolHandler,
  type AgentToolContext,
} from "./agent-tools.js";

type ReportBody = { description?: string; location?: string };

/**
 * Runs one local developer session through the real report tool and draft store.
 * Input: POST `/api/local/report` with `{description:"Large pothole"}`.
 * Output: `needs_input`, then a revision-bound `needs_confirmation` after location.
 */
export function buildLocalApp(
  store: PostgresDraftStore,
  context: ReportContext,
) {
  const app = fastify({
    logger: false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  const handlers = {
    ...createAgentToolStubs(),
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

  return app;
}
