import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PostgresDraftStore } from "../../../src/adapters/postgres/draft-store.js";
import { PostgresTicketOperationStore } from "../../../src/adapters/postgres/ticket-operation-store.js";
import type { ReportContext } from "../../../src/core/service-report/prepare-service-report.js";
import type { SupportedReportType } from "../../../src/core/service-report/prepare-service-report.js";

const localDatabaseUrl = process.env.LOCAL_DATABASE_URL;
if (localDatabaseUrl) {
  const host = new URL(localDatabaseUrl).hostname;
  if (!new Set(["127.0.0.1", "localhost", "[::1]"]).has(host)) {
    throw new Error("Ticket operation tests require a loopback database");
  }
}

describe.skipIf(!localDatabaseUrl)(
  "PostgresTicketOperationStore (local Supabase)",
  () => {
    let pool: Pool;
    let drafts: PostgresDraftStore;
    let operations: PostgresTicketOperationStore;
    const conversationsToRemove: string[] = [];

    beforeAll(() => {
      pool = new Pool({ connectionString: localDatabaseUrl, max: 4 });
      drafts = new PostgresDraftStore(pool);
      operations = new PostgresTicketOperationStore(pool);
    });

    afterEach(async () => {
      if (conversationsToRemove.length === 0) return;
      const conversationIds = conversationsToRemove.splice(0);
      await pool.query(
        "delete from app.ticket_operations where conversation_id = any($1::uuid[])",
        [conversationIds],
      );
      await pool.query(
        "delete from app.request_drafts where conversation_id = any($1::uuid[])",
        [conversationIds],
      );
      await pool.query(
        "delete from app.observations where conversation_id = any($1::uuid[])",
        [conversationIds],
      );
      await pool.query(
        "delete from app.conversations where id = any($1::uuid[])",
        [conversationIds],
      );
    });

    afterAll(async () => {
      await pool?.end();
    });

    /** Input: none. Output: a new isolated Boulder conversation. */
    async function open(): Promise<ReportContext> {
      const result = await drafts.openConversation("boulder-co");
      if (result.status !== "created") throw new Error("Local DB unavailable");
      conversationsToRemove.push(result.context.conversationId);
      return result.context;
    }

    /** Input: one conversation and report type. Output: a complete revision-1 draft. */
    async function completeDraft(
      context: ReportContext,
      requestType: SupportedReportType = "pothole",
    ): Promise<string> {
      const locationText =
        requestType === "pothole"
          ? "15th and Pine"
          : "North Boulder Park, west playground";
      const descriptionText =
        requestType === "pothole"
          ? "Large pothole in the driving lane"
          : "Broken swing";
      const location = await drafts.recordObservation(
        context,
        "text",
        locationText,
        null,
      );
      const description = await drafts.recordObservation(
        context,
        "text",
        descriptionText,
        null,
      );
      if (location.status !== "recorded" || description.status !== "recorded") {
        throw new Error("Local observation unavailable");
      }
      const saved = await drafts.save(context, null, null, {
        requestType,
        location: {
          text: locationText,
          observationId: location.observationId,
        },
        description: {
          text: descriptionText,
          observationId: description.observationId,
        },
      });
      if (saved.status !== "saved") throw new Error("Local draft unavailable");
      return saved.draft.draftId;
    }

    it("has the least-privilege grants needed by the runtime adapter", async () => {
      const result = await pool.query<{
        conversations: boolean;
        drafts: boolean;
        policy: boolean;
        operations: boolean;
      }>(`select
        (has_table_privilege('app_runtime', 'app.conversations', 'SELECT')
         and has_table_privilege('app_runtime', 'app.conversations', 'INSERT')) as conversations,
        (has_table_privilege('app_runtime', 'app.request_drafts', 'SELECT')
         and has_table_privilege('app_runtime', 'app.request_drafts', 'INSERT')
         and has_table_privilege('app_runtime', 'app.request_drafts', 'UPDATE')) as drafts,
        has_table_privilege('app_runtime', 'app.city_policies', 'SELECT') as policy,
        (has_table_privilege('app_runtime', 'app.ticket_operations', 'SELECT')
         and has_table_privilege('app_runtime', 'app.ticket_operations', 'INSERT')
         and has_column_privilege('app_runtime', 'app.ticket_operations', 'state', 'UPDATE')) as operations`);
      expect(result.rows[0]).toEqual({
        conversations: true,
        drafts: true,
        policy: true,
        operations: true,
      });
    });

    it("authorizes one immutable ticket operation for a complete current draft", async () => {
      const context = await open();
      const draftId = await completeDraft(context);

      const first = await operations.authorize(context, draftId, 1, 1);
      expect(first).toMatchObject({
        status: "found",
        operation: {
          draftId,
          draftRevision: 1,
          policyRevision: 1,
          requestType: "pothole",
          location: "15th and Pine",
          description: "Large pothole in the driving lane",
          state: "ready",
          providerIssueId: null,
          providerIssueKey: null,
        },
      });
      if (first.status !== "found") return;

      const repeated = await operations.authorize(context, draftId, 1, 1);
      expect(repeated).toEqual(first);
      expect(await operations.findByDraft(context, draftId, 1)).toEqual(first);
      expect(await operations.findByDraft(context, draftId, 2)).toEqual({
        status: "blocked",
        code: "revision_conflict",
      });
      expect(await operations.authorize(context, draftId, 1, 999)).toEqual(
        first,
      );
      const count = await pool.query<{ count: string }>(
        "select count(*) from app.ticket_operations where draft_id = $1",
        [draftId],
      );
      expect(count.rows[0]?.count).toBe("1");
    });

    it("authorizes a park-maintenance ticket with its immutable report type", async () => {
      const context = await open();
      const draftId = await completeDraft(context, "park_maintenance");

      expect(await operations.authorize(context, draftId, 1, 1)).toMatchObject({
        status: "found",
        operation: {
          draftId,
          requestType: "park_maintenance",
          location: "North Boulder Park, west playground",
          description: "Broken swing",
          state: "ready",
        },
      });
    });

    it("blocks missing details, stale revision, policy mismatch, and wrong scope", async () => {
      const context = await open();
      const other = await open();
      const empty = await drafts.save(context, null, null, {
        requestType: "pothole",
      });
      if (empty.status !== "saved") throw new Error("Local draft unavailable");
      const draftId = empty.draft.draftId;

      expect(await operations.authorize(context, draftId, 1, 1)).toEqual({
        status: "blocked",
        code: "incomplete_draft",
      });
      expect(await operations.authorize(other, draftId, 1, 1)).toEqual({
        status: "blocked",
        code: "missing_draft",
      });
      expect(await operations.findByDraft(other, draftId, 1)).toEqual({
        status: "missing",
      });

      const completeId = await completeDraft(context);
      expect(await operations.authorize(context, completeId, 2, 1)).toEqual({
        status: "blocked",
        code: "revision_conflict",
      });
      expect(await operations.authorize(context, completeId, 1, 999)).toEqual({
        status: "blocked",
        code: "policy_unavailable",
      });
      expect(
        await operations.authorize(
          { ...context, admissionId: other.admissionId },
          completeId,
          1,
          1,
        ),
      ).toEqual({ status: "blocked", code: "scope_mismatch" });
    });

    it("allows one concurrent authorization and freezes the draft afterward", async () => {
      const context = await open();
      const draftId = await completeDraft(context);

      const concurrent = await Promise.all([
        operations.authorize(context, draftId, 1, 1),
        operations.authorize(context, draftId, 1, 1),
      ]);
      expect(concurrent.every((result) => result.status === "found")).toBe(
        true,
      );
      if (
        concurrent[0]?.status !== "found" ||
        concurrent[1]?.status !== "found"
      ) {
        return;
      }
      expect(concurrent[0].operation.operationId).toBe(
        concurrent[1].operation.operationId,
      );

      const observedCorrection = await drafts.recordObservation(
        context,
        "text",
        "15th and Pearl",
        null,
      );
      const current = await drafts.load(context, draftId);
      if (
        observedCorrection.status !== "recorded" ||
        current.status !== "found" ||
        !current.draft.description
      ) {
        throw new Error("Local correction unavailable");
      }
      const correction = await drafts.save(context, draftId, 1, {
        requestType: "pothole",
        location: {
          text: "15th and Pearl",
          observationId: observedCorrection.observationId,
        },
        description: current.draft.description,
      });
      expect(correction.status).toBe("conflict");
      expect(await operations.authorize(context, draftId, 2, 1)).toEqual({
        status: "blocked",
        code: "revision_conflict",
      });
      expect(await operations.authorize(context, draftId, 1, 1)).toEqual(
        concurrent[0],
      );
      expect(concurrent[0].operation.location).toBe("15th and Pine");
    });

    it("serializes a simultaneous draft correction and ticket authorization", async () => {
      const context = await open();
      const draftId = await completeDraft(context);
      const current = await drafts.load(context, draftId);
      const observed = await drafts.recordObservation(
        context,
        "text",
        "Corrected location: 15th and Pearl",
        null,
      );
      if (
        current.status !== "found" ||
        !current.draft.description ||
        observed.status !== "recorded"
      ) {
        throw new Error("Local correction unavailable");
      }

      const [authorization, correction] = await Promise.all([
        operations.authorize(context, draftId, 1, 1),
        drafts.save(context, draftId, 1, {
          requestType: "pothole",
          location: {
            text: "15th and Pearl",
            observationId: observed.observationId,
          },
          description: current.draft.description,
        }),
      ]);
      if (authorization.status === "found") {
        expect(correction.status).toBe("conflict");
        expect(authorization.operation.location).toBe("15th and Pine");
      } else {
        expect(authorization).toEqual({
          status: "blocked",
          code: "revision_conflict",
        });
        expect(correction.status).toBe("saved");
        expect(await operations.findByDraft(context, draftId, 1)).toEqual({
          status: "missing",
        });
      }
    });

    it("starts one attempt, persists a verified result, and never starts again", async () => {
      const context = await open();
      const draftId = await completeDraft(context);
      const authorized = await operations.authorize(context, draftId, 1, 1);
      if (authorized.status !== "found") throw new Error("Not authorized");
      const operationId = authorized.operation.operationId;

      const starts = await Promise.all([
        operations.start(context, operationId),
        operations.start(context, operationId),
      ]);
      expect(starts.map((result) => result.status).sort()).toEqual([
        "found",
        "started",
      ]);
      const result = await operations.finish(context, operationId, {
        state: "created",
        providerIssueId: "linear-issue-1",
        providerIssueKey: "DRO-1",
        providerTitle: "Pothole at 15th and Pine",
        providerDescription: "Large pothole in the driving lane",
        providerFetchedAt: "2026-09-16T12:00:00.000Z",
      });
      expect(result).toMatchObject({
        status: "found",
        operation: {
          state: "created",
          providerIssueId: "linear-issue-1",
          providerIssueKey: "DRO-1",
          providerTitle: "Pothole at 15th and Pine",
          providerFetchedAt: "2026-09-16T12:00:00.000Z",
        },
      });
      expect(await operations.start(context, operationId)).toEqual(result);
      expect(
        await operations.finish(context, operationId, {
          state: "rejected",
          reason: "later-conflicting-result",
        }),
      ).toEqual(result);
    });

    it("does not finish an unstarted operation or expose it across admissions", async () => {
      const context = await open();
      const other = await open();
      const draftId = await completeDraft(context);
      const authorized = await operations.authorize(context, draftId, 1, 1);
      if (authorized.status !== "found") throw new Error("Not authorized");
      const operationId = authorized.operation.operationId;

      expect(
        await operations.finish(context, operationId, {
          state: "rejected",
          reason: "premature",
        }),
      ).toEqual(authorized);
      expect(await operations.start(other, operationId)).toEqual({
        status: "blocked",
        code: "scope_mismatch",
      });
      expect(
        await operations.finish(other, operationId, {
          state: "rejected",
          reason: "wrong_scope",
        }),
      ).toEqual({ status: "blocked", code: "scope_mismatch" });
    });

    it.each(["uncertain", "rejected"] as const)(
      "persists a %s attempt outcome without fabricating a ticket",
      async (state) => {
        const context = await open();
        const draftId = await completeDraft(context);
        const authorized = await operations.authorize(context, draftId, 1, 1);
        if (authorized.status !== "found") throw new Error("Not authorized");
        const operationId = authorized.operation.operationId;
        expect((await operations.start(context, operationId)).status).toBe(
          "started",
        );

        const result = await operations.finish(context, operationId, {
          state,
          reason:
            state === "uncertain" ? "provider_timeout" : "provider_rejected",
        });
        expect(result).toMatchObject({
          status: "found",
          operation: {
            state,
            reason:
              state === "uncertain" ? "provider_timeout" : "provider_rejected",
            providerIssueId: null,
          },
        });
      },
    );

    it("reconciles only a known uncertain issue ID to created", async () => {
      const context = await open();
      const draftId = await completeDraft(context);
      const authorized = await operations.authorize(context, draftId, 1, 1);
      if (authorized.status !== "found") throw new Error("Not authorized");
      const operationId = authorized.operation.operationId;
      expect((await operations.start(context, operationId)).status).toBe(
        "started",
      );
      expect(
        (
          await operations.finish(context, operationId, {
            state: "uncertain",
            reason: "linear_readback_unverified",
            providerIssueId: "issue-known",
          })
        ).status,
      ).toBe("found");
      expect(
        await operations.finish(context, operationId, {
          state: "created",
          providerIssueId: "issue-other",
          providerIssueKey: "DRO-3",
          providerTitle: "Wrong issue",
          providerDescription: "Wrong details",
          providerFetchedAt: "2026-09-16T12:00:00.000Z",
        }),
      ).toMatchObject({ status: "found", operation: { state: "uncertain" } });
      expect(
        await operations.finish(context, operationId, {
          state: "created",
          providerIssueId: "issue-known",
          providerIssueKey: "DRO-2",
          providerTitle: "Boulder demo: pothole report",
          providerDescription: `Demo operation: ${operationId}`,
          providerFetchedAt: "2026-09-16T12:00:00.000Z",
        }),
      ).toMatchObject({
        status: "found",
        operation: { state: "created", providerIssueId: "issue-known" },
      });
    });

    it("keeps ticket operations private and denies delete to app_runtime", async () => {
      const result = await pool.query<{
        anon_schema: boolean;
        runtime_select: boolean;
        runtime_insert: boolean;
        runtime_state_update: boolean;
        runtime_id_update: boolean;
        runtime_delete: boolean;
      }>(
        `select has_schema_privilege('anon', 'app', 'USAGE') as anon_schema,
                has_table_privilege('app_runtime', 'app.ticket_operations', 'SELECT') as runtime_select,
                has_table_privilege('app_runtime', 'app.ticket_operations', 'INSERT') as runtime_insert,
                has_column_privilege('app_runtime', 'app.ticket_operations', 'state', 'UPDATE') as runtime_state_update,
                has_column_privilege('app_runtime', 'app.ticket_operations', 'id', 'UPDATE') as runtime_id_update,
                has_table_privilege('app_runtime', 'app.ticket_operations', 'DELETE') as runtime_delete`,
      );
      expect(result.rows[0]).toEqual({
        anon_schema: false,
        runtime_select: true,
        runtime_insert: true,
        runtime_state_update: true,
        runtime_id_update: false,
        runtime_delete: false,
      });
    });
  },
);
