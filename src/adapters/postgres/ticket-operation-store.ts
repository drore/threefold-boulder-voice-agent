/**
 * Postgres-backed TicketOperationStore.
 * Persists one create attempt per confirmed draft revision with unique keys, so
 * a confirmed report cannot be submitted twice and uncertain outcomes can be
 * reconciled instead of duplicated.
 */
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  ReportContext,
  SupportedReportType,
} from "../../core/prepare-service-report.js";
import type {
  TicketOperation,
  TicketOperationOutcome,
  TicketOperationLookup,
  TicketOperationRead,
  TicketOperationStore,
} from "../../core/ticket-operation.js";

type DraftRow = {
  revision: number;
  request_type: SupportedReportType;
  location_text: string | null;
  description_text: string | null;
};

type OperationRow = {
  id: string;
  draft_id: string;
  draft_revision: number;
  policy_revision: number;
  request_type: SupportedReportType;
  location_text: string;
  description_text: string;
  state: TicketOperation["state"];
  provider_issue_id: string | null;
  provider_title: string | null;
  provider_description: string | null;
  provider_fetched_at: Date | null;
  reason: string | null;
};

/** Stores one durable Linear create attempt per supported report draft. */
export class PostgresTicketOperationStore implements TicketOperationStore {
  /** Input: server-owned database pool. Output: a store with no external provider calls. */
  constructor(private readonly pool: Pool) {}

  /** Input: scoped draft ID/revision. Output: authorized operation or missing. */
  async findByDraft(
    context: ReportContext,
    draftId: string,
    expectedRevision: number,
  ): Promise<TicketOperationLookup> {
    try {
      const result = await this.pool.query<OperationRow>(
        `select operation.*
         from app.ticket_operations as operation
         join app.conversations as conversation
           on conversation.id = operation.conversation_id
         where operation.draft_id = $1 and conversation.id = $2
           and conversation.city_id = $3 and conversation.admission_id = $4`,
        [draftId, context.conversationId, context.cityId, context.admissionId],
      );
      const operation = result.rows[0];
      if (!operation) return { status: "missing" };
      return operation.draft_revision === expectedRevision
        ? { status: "found", operation: toOperation(operation) }
        : { status: "blocked", code: "revision_conflict" };
    } catch (error) {
      logDatabaseError("findByDraft", error);
      return { status: "unavailable" };
    }
  }

  /** Input: scoped draft/revision and policy revision. Output: existing or new ready operation. */
  async authorize(
    context: ReportContext,
    draftId: string,
    expectedRevision: number,
    policyRevision: number,
  ): Promise<TicketOperationRead> {
    let client: PoolClient | undefined;
    let transactionStarted = false;
    try {
      client = await this.pool.connect();
      await client.query("begin");
      transactionStarted = true;

      const conversation = await client.query(
        `select id from app.conversations
         where id = $1 and city_id = $2 and admission_id = $3`,
        [context.conversationId, context.cityId, context.admissionId],
      );
      if (conversation.rowCount !== 1) {
        await client.query("rollback");
        return { status: "blocked", code: "scope_mismatch" };
      }

      const draftResult = await client.query<DraftRow>(
        `select revision, request_type, location_text, description_text
         from app.request_drafts
         where id = $1 and conversation_id = $2
         for update`,
        [draftId, context.conversationId],
      );
      const draft = draftResult.rows[0];
      if (!draft) {
        await client.query("rollback");
        return { status: "blocked", code: "missing_draft" };
      }
      if (draft.revision !== expectedRevision) {
        await client.query("rollback");
        return { status: "blocked", code: "revision_conflict" };
      }
      if (!draft.location_text?.trim() || !draft.description_text?.trim()) {
        await client.query("rollback");
        return { status: "blocked", code: "incomplete_draft" };
      }

      // A repeat reads its durable operation even if city policy changed later.
      const existing = await client.query<OperationRow>(
        `select * from app.ticket_operations where draft_id = $1`,
        [draftId],
      );
      const existingOperation = existing.rows[0];
      if (existingOperation) {
        await client.query("commit");
        return existingOperation.draft_revision === expectedRevision
          ? { status: "found", operation: toOperation(existingOperation) }
          : { status: "blocked", code: "revision_conflict" };
      }

      const policy = await client.query(
        `select revision from app.city_policies
         where city_id = $1 and revision = $2`,
        [context.cityId, policyRevision],
      );
      if (policy.rowCount !== 1) {
        await client.query("rollback");
        return { status: "blocked", code: "policy_unavailable" };
      }

      const created = await client.query<OperationRow>(
        `insert into app.ticket_operations
           (id, conversation_id, draft_id, draft_revision, policy_revision,
            request_type, location_text, description_text)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning *`,
        [
          randomUUID(),
          context.conversationId,
          draftId,
          expectedRevision,
          policyRevision,
          draft.request_type,
          draft.location_text,
          draft.description_text,
        ],
      );
      const createdOperation = created.rows[0];
      if (!createdOperation)
        throw new Error("Operation insert returned no row");
      await client.query("commit");
      return { status: "found", operation: toOperation(createdOperation) };
    } catch (error) {
      if (client && transactionStarted) {
        try {
          await client.query("rollback");
        } catch {
          // A broken connection cannot establish a successful authorization.
        }
      }
      logDatabaseError("authorize", error);
      return { status: "unavailable" };
    } finally {
      client?.release();
    }
  }

  /** Input: a scoped ready operation ID. Output: `started` for the sole winning caller. */
  async start(
    context: ReportContext,
    operationId: string,
  ): ReturnType<TicketOperationStore["start"]> {
    try {
      const updated = await this.pool.query<OperationRow>(
        `update app.ticket_operations as operation
         set state = 'attempting', updated_at = now()
         from app.conversations as conversation
         where operation.id = $1 and operation.state = 'ready'
           and operation.conversation_id = conversation.id
           and conversation.id = $2 and conversation.city_id = $3
           and conversation.admission_id = $4
         returning operation.*`,
        [
          operationId,
          context.conversationId,
          context.cityId,
          context.admissionId,
        ],
      );
      const started = updated.rows[0];
      return started
        ? { status: "started", operation: toOperation(started) }
        : await this.readScoped(context, operationId);
    } catch (error) {
      logDatabaseError("start", error);
      return { status: "unavailable" };
    }
  }

  /** Input: one classified attempt result. Output: persisted terminal operation or current state. */
  async finish(
    context: ReportContext,
    operationId: string,
    outcome: TicketOperationOutcome,
  ): Promise<TicketOperationRead> {
    const providerIssueId =
      outcome.state === "created"
        ? outcome.providerIssueId
        : outcome.state === "uncertain"
          ? (outcome.providerIssueId ?? null)
          : null;
    const providerTitle =
      outcome.state === "created" ? outcome.providerTitle : null;
    const providerDescription =
      outcome.state === "created" ? outcome.providerDescription : null;
    const providerFetchedAt =
      outcome.state === "created" ? outcome.providerFetchedAt : null;
    const reason = outcome.state === "created" ? null : outcome.reason;

    try {
      const updated = await this.pool.query<OperationRow>(
        `update app.ticket_operations as operation
         set state = $5, provider_issue_id = $6, provider_title = $7,
             provider_description = $8, provider_fetched_at = $9,
             reason = $10, updated_at = now()
         from app.conversations as conversation
         where operation.id = $1
           and (
             operation.state = 'attempting'
             or (operation.state = 'uncertain' and $5 = 'created'
                 and operation.provider_issue_id = $6)
           )
           and operation.conversation_id = conversation.id
           and conversation.id = $2 and conversation.city_id = $3
           and conversation.admission_id = $4
         returning operation.*`,
        [
          operationId,
          context.conversationId,
          context.cityId,
          context.admissionId,
          outcome.state,
          providerIssueId,
          providerTitle,
          providerDescription,
          providerFetchedAt,
          reason,
        ],
      );
      const finished = updated.rows[0];
      return finished
        ? { status: "found", operation: toOperation(finished) }
        : await this.readScoped(context, operationId);
    } catch (error) {
      logDatabaseError("finish", error);
      return { status: "unavailable" };
    }
  }

  /** Input: scoped operation ID. Output: persisted operation or scope rejection. */
  private async readScoped(
    context: ReportContext,
    operationId: string,
  ): Promise<TicketOperationRead> {
    const result = await this.pool.query<OperationRow>(
      `select operation.*
       from app.ticket_operations as operation
       join app.conversations as conversation
         on conversation.id = operation.conversation_id
       where operation.id = $1 and conversation.id = $2
         and conversation.city_id = $3 and conversation.admission_id = $4`,
      [
        operationId,
        context.conversationId,
        context.cityId,
        context.admissionId,
      ],
    );
    const operation = result.rows[0];
    return operation
      ? { status: "found", operation: toOperation(operation) }
      : { status: "blocked", code: "scope_mismatch" };
  }
}

/** Input: one database row. Output: the provider-neutral operation snapshot. */
function toOperation(row: OperationRow): TicketOperation {
  return {
    operationId: row.id,
    draftId: row.draft_id,
    draftRevision: row.draft_revision,
    policyRevision: row.policy_revision,
    requestType: row.request_type,
    location: row.location_text,
    description: row.description_text,
    state: row.state,
    providerIssueId: row.provider_issue_id,
    providerTitle: row.provider_title,
    providerDescription: row.provider_description,
    providerFetchedAt: row.provider_fetched_at?.toISOString() ?? null,
    reason: row.reason,
  };
}

/** Input: a failed database operation. Output: a safe error code for diagnostics. */
function logDatabaseError(operation: string, error: unknown): void {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "unknown";
  console.error(`PostgresTicketOperationStore.${operation} failed`, { code });
}
