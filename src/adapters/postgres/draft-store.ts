/**
 * Postgres-backed DraftStore.
 * Implements the provider-neutral draft/observation port with conversation and
 * admission scope checks plus atomic revision comparison, so intakes persist
 * across server restarts.
 */
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResult } from "pg";
import type {
  DraftStore,
  ReportContext,
  ReportDraft,
  ServiceReportData,
} from "../../core/prepare-service-report.js";

const MAX_OBSERVATION_LENGTH = 4000;

type DraftRow = {
  id: string;
  revision: number;
  request_type: ServiceReportData["requestType"];
  location_text: string | null;
  location_observation_id: string | null;
  description_text: string | null;
  description_observation_id: string | null;
};

/**
 * Persists the two supported service-report drafts in Supabase Postgres. The supplied
 * pool belongs to the server; neither the browser nor the model gets DB access.
 */
export class PostgresDraftStore implements DraftStore {
  constructor(private readonly pool: Pool) {}

  /** Input: `"boulder-co"`. Output: a new server-owned conversation scope. */
  async openConversation(
    cityId: string,
  ): Promise<
    { status: "created"; context: ReportContext } | { status: "unavailable" }
  > {
    if (!cityId.trim()) return { status: "unavailable" };

    const context = {
      conversationId: randomUUID(),
      cityId,
      admissionId: randomUUID(),
    };
    try {
      await this.pool.query(
        `insert into app.conversations (id, city_id, admission_id)
         values ($1, $2, $3)`,
        [context.conversationId, context.cityId, context.admissionId],
      );
      return { status: "created", context };
    } catch (error) {
      logDatabaseError("openConversation", error);
      return { status: "unavailable" };
    }
  }

  /** Input: a server-observed caller turn. Output: its scoped reference. */
  async recordObservation(
    context: ReportContext,
    channel: "voice" | "text",
    observedText: string,
  ): Promise<
    | { status: "recorded"; observationId: string }
    | { status: "invalid_input" | "denied" | "unavailable" }
  > {
    if (
      !observedText.trim() ||
      observedText.length > MAX_OBSERVATION_LENGTH ||
      (channel !== "voice" && channel !== "text")
    ) {
      return { status: "invalid_input" };
    }

    const observationId = randomUUID();
    try {
      const result = await this.pool.query<{ id: string }>(
        `insert into app.observations (id, conversation_id, channel, observed_text)
         select $4, id, $5, $6
         from app.conversations
         where id = $1 and city_id = $2 and admission_id = $3
         returning id`,
        [
          context.conversationId,
          context.cityId,
          context.admissionId,
          observationId,
          channel,
          observedText,
        ],
      );
      return result.rowCount === 1
        ? { status: "recorded", observationId }
        : { status: "denied" };
    } catch (error) {
      logDatabaseError("recordObservation", error);
      return { status: "unavailable" };
    }
  }

  /** Input: scoped context and server-selected draft ID. Output: that draft or an empty new-draft slot. */
  async load(context: ReportContext, draftId: string | null) {
    try {
      const scope = await this.pool.query(
        `select id from app.conversations
         where id = $1 and city_id = $2 and admission_id = $3`,
        [context.conversationId, context.cityId, context.admissionId],
      );
      if (scope.rowCount !== 1) return { status: "denied" as const };
      if (draftId === null) return { status: "empty" as const };

      const result = await this.pool.query<DraftRow>(
        `select id, revision, request_type, location_text,
                location_observation_id, description_text,
                description_observation_id
         from app.request_drafts
         where id = $1 and conversation_id = $2`,
        [draftId, context.conversationId],
      );
      const row = result.rows[0];
      if (!row) return { status: "denied" as const };
      return { status: "found" as const, draft: toDraft(context, row) };
    } catch (error) {
      logDatabaseError("load", error);
      return { status: "unavailable" as const };
    }
  }

  /** Input: current revision and observed fields. Output: one atomically saved next revision. */
  async save(
    context: ReportContext,
    draftId: string | null,
    expectedRevision: number | null,
    fields: ServiceReportData,
  ) {
    let client: PoolClient | undefined;
    let transactionStarted = false;
    try {
      client = await this.pool.connect();
      await client.query("begin");
      transactionStarted = true;

      // Check admission scope; the draft update below uses its revision as a guard.
      const scope = await client.query(
        `select id from app.conversations
         where id = $1 and city_id = $2 and admission_id = $3`,
        [context.conversationId, context.cityId, context.admissionId],
      );
      if (scope.rowCount !== 1) {
        await client.query("rollback");
        return { status: "denied" as const };
      }

      const observationIds = [
        ...new Set(
          [
            fields.location?.observationId,
            fields.description?.observationId,
          ].filter((id): id is string => id !== undefined),
        ),
      ];
      if (observationIds.length > 0) {
        const observations = await client.query(
          `select id from app.observations
           where conversation_id = $1 and id = any($2::uuid[])`,
          [context.conversationId, observationIds],
        );
        if (observations.rowCount !== observationIds.length) {
          await client.query("rollback");
          return { status: "denied" as const };
        }
      }

      const values = [
        context.conversationId,
        fields.requestType,
        fields.location?.text ?? null,
        fields.location?.observationId ?? null,
        fields.description?.text ?? null,
        fields.description?.observationId ?? null,
      ];
      let result: QueryResult<DraftRow>;
      if (draftId === null && expectedRevision === null) {
        result = await client.query<DraftRow>(
          `insert into app.request_drafts
             (id, conversation_id, request_type, revision,
              location_text, location_observation_id,
              description_text, description_observation_id)
           values ($7, $1, $2, 1, $3, $4, $5, $6)
           returning id, revision, request_type, location_text,
                     location_observation_id, description_text,
                     description_observation_id`,
          [...values, randomUUID()],
        );
      } else if (draftId !== null && expectedRevision !== null) {
        // Authorization locks this same row. Check for its operation only after
        // the lock is acquired, using a fresh statement snapshot.
        const locked = await client.query(
          `select id from app.request_drafts
           where id = $1 and conversation_id = $2 and request_type = $3
             and revision = $4
           for update`,
          [
            draftId,
            context.conversationId,
            fields.requestType,
            expectedRevision,
          ],
        );
        if (locked.rowCount !== 1) {
          await client.query("rollback");
          return { status: "conflict" as const };
        }
        const ticket = await client.query(
          "select 1 from app.ticket_operations where draft_id = $1",
          [draftId],
        );
        if (ticket.rowCount) {
          await client.query("rollback");
          return { status: "conflict" as const };
        }
        result = await client.query<DraftRow>(
          `update app.request_drafts
           set revision = revision + 1,
               location_text = $3, location_observation_id = $4,
               description_text = $5, description_observation_id = $6,
               updated_at = now()
           where id = $7 and conversation_id = $1
             and request_type = $2 and revision = $8
           returning id, revision, request_type, location_text,
                     location_observation_id, description_text,
                     description_observation_id`,
          [...values, draftId, expectedRevision],
        );
      } else {
        await client.query("rollback");
        return { status: "conflict" as const };
      }

      const row = result.rows[0];
      if (!row) {
        await client.query("rollback");
        return { status: "conflict" as const };
      }
      await client.query("commit");
      return { status: "saved" as const, draft: toDraft(context, row) };
    } catch (error) {
      if (client && transactionStarted) {
        try {
          await client.query("rollback");
        } catch {
          // The connection may already be gone; the caller receives unavailable.
        }
      }
      logDatabaseError("save", error);
      return { status: "unavailable" as const };
    } finally {
      client?.release();
    }
  }
}

function toDraft(context: ReportContext, row: DraftRow): ReportDraft {
  return {
    draftId: row.id,
    conversationId: context.conversationId,
    cityId: context.cityId,
    requestType: row.request_type,
    revision: row.revision,
    ...(row.location_text && row.location_observation_id
      ? {
          location: {
            text: row.location_text,
            observationId: row.location_observation_id,
          },
        }
      : {}),
    ...(row.description_text && row.description_observation_id
      ? {
          description: {
            text: row.description_text,
            observationId: row.description_observation_id,
          },
        }
      : {}),
  };
}

function logDatabaseError(operation: string, error: unknown): void {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "unknown";
  console.error(`PostgresDraftStore.${operation} failed`, { code });
}
