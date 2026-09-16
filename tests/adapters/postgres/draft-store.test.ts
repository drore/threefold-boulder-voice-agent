import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PostgresDraftStore } from "../../../src/adapters/postgres/draft-store.js";
import { prepareServiceReport } from "../../../src/core/prepare-service-report.js";
import type { ReportContext } from "../../../src/core/prepare-service-report.js";

const localDatabaseUrl = process.env.LOCAL_DATABASE_URL;
if (localDatabaseUrl) {
  const host = new URL(localDatabaseUrl).hostname;
  if (!new Set(["127.0.0.1", "localhost", "[::1]"]).has(host)) {
    throw new Error("Postgres integration tests require a loopback database");
  }
}

describe.skipIf(!localDatabaseUrl)(
  "PostgresDraftStore (local Supabase)",
  () => {
    let pool: Pool;
    let store: PostgresDraftStore;
    const conversationsToRemove: string[] = [];

    beforeAll(() => {
      pool = new Pool({ connectionString: localDatabaseUrl, max: 4 });
      store = new PostgresDraftStore(pool);
    });

    afterEach(async () => {
      if (conversationsToRemove.length === 0) return;
      const conversationIds = conversationsToRemove.splice(0);
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

    async function open(): Promise<ReportContext> {
      const result = await store.openConversation("boulder-co");
      if (result.status !== "created") throw new Error("Local DB unavailable");
      conversationsToRemove.push(result.context.conversationId);
      return result.context;
    }

    async function observe(
      context: ReportContext,
      text: string,
    ): Promise<string> {
      const result = await store.recordObservation(context, "text", text);
      if (result.status !== "recorded")
        throw new Error("Observation not saved");
      return result.observationId;
    }

    it("persists missing-details and complete pothole drafts across store instances", async () => {
      const context = await open();
      const descriptionId = await observe(
        context,
        "Large pothole in driving lane",
      );

      const initial = await prepareServiceReport(
        context,
        {
          requestType: "pothole",
          draftId: null,
          expectedRevision: null,
          description: {
            text: "Large pothole in driving lane",
            observationId: descriptionId,
          },
        },
        store,
      );
      expect(initial.status).toBe("needs_input");
      if (initial.status !== "needs_input") return;
      expect(initial.fields).toEqual(["location"]);

      const newStore = new PostgresDraftStore(pool);
      expect(await newStore.load(context, initial.draftId)).toMatchObject({
        status: "found",
        draft: {
          revision: 1,
          requestType: "pothole",
          description: {
            text: "Large pothole in driving lane",
            observationId: descriptionId,
          },
        },
      });

      const locationId = await observe(context, "It is at 15th and Pine");
      expect(
        await prepareServiceReport(
          context,
          {
            requestType: "pothole",
            draftId: initial.draftId,
            expectedRevision: 1,
            location: { text: "15th and Pine", observationId: locationId },
          },
          newStore,
        ),
      ).toMatchObject({
        status: "needs_confirmation",
        draftId: initial.draftId,
        revision: 2,
        summary: {
          requestType: "pothole",
          location: "15th and Pine",
          description: "Large pothole in driving lane",
        },
      });
    });

    it("persists park-maintenance details without changing the draft type", async () => {
      const context = await open();
      const descriptionId = await observe(context, "Broken swing");
      const first = await prepareServiceReport(
        context,
        {
          requestType: "park_maintenance",
          draftId: null,
          expectedRevision: null,
          description: {
            text: "Broken swing",
            observationId: descriptionId,
          },
        },
        store,
      );
      expect(first.status).toBe("needs_input");
      if (first.status !== "needs_input") return;

      const newStore = new PostgresDraftStore(pool);
      const locationId = await observe(
        context,
        "North Boulder Park, west playground",
      );
      expect(
        await prepareServiceReport(
          context,
          {
            requestType: "park_maintenance",
            draftId: first.draftId,
            expectedRevision: first.revision,
            location: {
              text: "North Boulder Park, west playground",
              observationId: locationId,
            },
          },
          newStore,
        ),
      ).toMatchObject({
        status: "needs_confirmation",
        summary: {
          requestType: "park_maintenance",
          location: "North Boulder Park, west playground",
          description: "Broken swing",
        },
      });
      expect(await store.load(context, first.draftId)).toMatchObject({
        status: "found",
        draft: { requestType: "park_maintenance", revision: 2 },
      });
      expect(
        await newStore.save(context, first.draftId, 2, {
          requestType: "pothole",
        }),
      ).toEqual({ status: "conflict" });
    });

    it("denies another admission and an observation from another conversation", async () => {
      const context = await open();
      const other = await open();
      const otherObservationId = await observe(other, "Pothole elsewhere");

      expect(
        await store.load({ ...context, admissionId: other.admissionId }, null),
      ).toEqual({ status: "denied" });
      expect(
        await store.recordObservation(
          { ...context, admissionId: other.admissionId },
          "text",
          "Wrong scope",
        ),
      ).toEqual({ status: "denied" });
      expect(
        await store.save(
          { ...context, admissionId: other.admissionId },
          null,
          null,
          { requestType: "pothole" },
        ),
      ).toEqual({ status: "denied" });
      expect(
        await store.save(context, null, null, {
          requestType: "pothole",
          location: {
            text: "15th and Pine",
            observationId: otherObservationId,
          },
        }),
      ).toEqual({ status: "denied" });

      const otherDraft = await store.save(other, null, null, {
        requestType: "pothole",
        location: { text: "Elsewhere", observationId: otherObservationId },
      });
      expect(otherDraft.status).toBe("saved");
      if (otherDraft.status === "saved") {
        expect(await store.load(context, otherDraft.draft.draftId)).toEqual({
          status: "denied",
        });
      }
    });

    it("allows exactly one save of a given draft revision", async () => {
      const context = await open();
      const firstId = await observe(context, "Pothole in street");
      const secondId = await observe(context, "Pothole at Pine");
      const first = await store.save(context, null, null, {
        requestType: "pothole",
        description: { text: "Pothole in street", observationId: firstId },
      });
      expect(first.status).toBe("saved");
      if (first.status !== "saved") return;

      const responses = await Promise.all([
        store.save(context, first.draft.draftId, 1, {
          requestType: "pothole",
          description: { text: "Pothole in street", observationId: firstId },
          location: { text: "15th and Pine", observationId: secondId },
        }),
        store.save(context, first.draft.draftId, 1, {
          requestType: "pothole",
          description: { text: "Pothole in street", observationId: firstId },
          location: { text: "15th and Pearl", observationId: secondId },
        }),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        "conflict",
        "saved",
      ]);
      expect(await store.load(context, first.draft.draftId)).toMatchObject({
        status: "found",
        draft: { revision: 2 },
      });
    });

    it("keeps the intake tables outside public Data API roles", async () => {
      const result = await pool.query<{
        anon_schema: boolean;
        authenticated_schema: boolean;
        service_schema: boolean;
        runtime_schema: boolean;
        runtime_update: boolean;
        runtime_delete: boolean;
      }>(
        `select has_schema_privilege('anon', 'app', 'USAGE') as anon_schema,
              has_schema_privilege('authenticated', 'app', 'USAGE') as authenticated_schema,
              has_schema_privilege('service_role', 'app', 'USAGE') as service_schema,
              has_schema_privilege('app_runtime', 'app', 'USAGE') as runtime_schema,
              has_table_privilege('app_runtime', 'app.request_drafts', 'UPDATE') as runtime_update,
              has_table_privilege('app_runtime', 'app.request_drafts', 'DELETE') as runtime_delete`,
      );
      expect(result.rows[0]).toEqual({
        anon_schema: false,
        authenticated_schema: false,
        service_schema: false,
        runtime_schema: true,
        runtime_update: true,
        runtime_delete: false,
      });
    });
  },
);
