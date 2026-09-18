/**
 * Confirmed-ticket submission.
 * Turns a confirmed draft revision into one durable Linear create/readback
 * attempt, classifies created/uncertain/rejected, and never blind-retries.
 */
import type {
  ReportContext,
  SupportedReportType,
} from "../../core/service-report/prepare-service-report.js";
import type {
  TicketOperation,
  TicketOperationOutcome,
  TicketOperationStore,
  TicketProvider,
} from "../../core/service-report/ticket-operation.js";

export type { TicketProvider } from "../../core/service-report/ticket-operation.js";

export type ConfirmedTicketResult =
  | {
      status: "linear_ticket_created";
      operationId: string;
      issueId: string;
      /** Short human reference for the caller, for example `DRO-5`. */
      issueKey: string | null;
      title: string;
      fetchedAt: string;
      currentDetails: "fresh" | "changed" | "unavailable";
    }
  | { status: "ticket_uncertain"; operationId: string; reason: string }
  | { status: "ticket_failed"; operationId: string; reason: string }
  | {
      status: "blocked";
      code:
        | "scope_mismatch"
        | "missing_draft"
        | "revision_conflict"
        | "incomplete_draft"
        | "policy_unavailable"
        | "store_unavailable";
    };

const TICKET_TITLES: Record<SupportedReportType, string> = {
  pothole: "pothole report",
  park_maintenance: "park maintenance report",
};

/**
 * How long a claimed attempt may sit in `attempting` before it is treated as
 * interrupted. The create + readback path has ~8s provider timeouts, so a claim
 * older than this window is stale and reconciles to uncertain rather than
 * blocking the caller forever.
 */
const ATTEMPT_LEASE_MS = 60_000;

/**
 * Creates at most one Linear issue for a confirmed closed-hours draft.
 * Input: draft ID/revision 2 and DB policy revision 1. Output: verified receipt or honest failure.
 */
export async function submitConfirmedTicket(
  context: ReportContext,
  draftId: string,
  draftRevision: number,
  policyRevision: number,
  operations: TicketOperationStore,
  provider: TicketProvider,
  cityName: string,
  now: () => Date = () => new Date(),
): Promise<ConfirmedTicketResult> {
  const authorized = await operations.authorize(
    context,
    draftId,
    draftRevision,
    policyRevision,
  );
  if (authorized.status === "unavailable") {
    return { status: "blocked", code: "store_unavailable" };
  }
  if (authorized.status === "blocked") return authorized;

  const claimed = await operations.start(
    context,
    authorized.operation.operationId,
  );
  if (claimed.status === "unavailable") {
    return { status: "blocked", code: "store_unavailable" };
  }
  if (claimed.status === "blocked") return claimed;
  if (claimed.status !== "started") {
    return describeExistingTicket(
      context,
      claimed.operation,
      operations,
      provider,
      now,
    );
  }

  const operation = claimed.operation;
  const title = `${cityName} demo: ${TICKET_TITLES[operation.requestType]}`;
  const description = ticketDescription(operation, cityName);
  const creation = await provider.createTicket({
    title,
    description,
  });
  let outcome: TicketOperationOutcome;
  if (creation.status === "created") {
    const readback = await provider.readTicket(creation.ticket.id);
    outcome =
      readback.status === "found" &&
      readback.ticket.id === creation.ticket.id &&
      readback.ticket.title === title &&
      readback.ticket.description === description &&
      readback.ticket.identifier === creation.ticket.identifier
        ? {
            state: "created",
            providerIssueId: readback.ticket.id,
            providerIssueKey: readback.ticket.identifier,
            providerTitle: readback.ticket.title,
            providerDescription: readback.ticket.description,
            providerFetchedAt: readback.ticket.fetchedAt,
          }
        : {
            state: "uncertain",
            reason: "linear_readback_unverified",
            providerIssueId: creation.ticket.id,
          };
  } else if (creation.status === "rejected") {
    outcome = { state: "rejected", reason: creation.reason };
  } else {
    outcome = { state: "uncertain", reason: creation.reason };
  }

  const finished = await operations.finish(
    context,
    operation.operationId,
    outcome,
  );
  if (finished.status !== "found") {
    return {
      status: "ticket_uncertain",
      operationId: operation.operationId,
      reason: "operation_result_not_persisted",
    };
  }
  return describeRecordedTicket(finished.operation);
}

/**
 * Formats a synthetic, identifiable issue without taking destination from caller text.
 * Input: operation `abc` at `15th and Pine`. Output: issue body with both fields and marker.
 */
function ticketDescription(
  operation: TicketOperation,
  cityName: string,
): string {
  return [
    `${cityName} municipal service demo`,
    `Demo operation: ${operation.operationId}`,
    `Request type: ${operation.requestType}`,
    `Location: ${operation.location}`,
    `Issue: ${operation.description}`,
  ].join("\n");
}

/**
 * Re-reads an existing operation instead of creating a second issue.
 * Input: recorded operation. Output: fresh read, reconciliation, or honest failure.
 */
async function describeExistingTicket(
  context: ReportContext,
  operation: TicketOperation,
  operations: TicketOperationStore,
  provider: TicketProvider,
  now: () => Date,
): Promise<ConfirmedTicketResult> {
  if (operation.state === "attempting") {
    return describeAttemptingTicket(context, operation, operations, now);
  }
  if (operation.state === "uncertain" && operation.providerIssueId) {
    const current = await provider.readTicket(operation.providerIssueId);
    if (
      current.status === "found" &&
      current.ticket.id === operation.providerIssueId &&
      current.ticket.description?.includes(
        `Demo operation: ${operation.operationId}`,
      )
    ) {
      const reconciled = await operations.finish(
        context,
        operation.operationId,
        {
          state: "created",
          providerIssueId: current.ticket.id,
          providerIssueKey: current.ticket.identifier,
          providerTitle: current.ticket.title,
          providerDescription: current.ticket.description,
          providerFetchedAt: current.ticket.fetchedAt,
        },
      );
      return reconciled.status === "found"
        ? describeRecordedTicket(reconciled.operation)
        : {
            status: "ticket_uncertain",
            operationId: operation.operationId,
            reason: "operation_result_not_persisted",
          };
    }
    return describeRecordedTicket(operation);
  }
  if (
    operation.state !== "created" ||
    !operation.providerIssueId ||
    !operation.providerTitle ||
    !operation.providerFetchedAt
  ) {
    return describeRecordedTicket(operation);
  }
  const current = await provider.readTicket(operation.providerIssueId);
  if (
    current.status === "found" &&
    current.ticket.id === operation.providerIssueId
  ) {
    return {
      status: "linear_ticket_created",
      operationId: operation.operationId,
      issueId: operation.providerIssueId,
      issueKey: current.ticket.identifier ?? operation.providerIssueKey,
      title: current.ticket.title,
      fetchedAt: current.ticket.fetchedAt,
      currentDetails:
        current.ticket.title === operation.providerTitle &&
        current.ticket.description === operation.providerDescription
          ? "fresh"
          : "changed",
    };
  }
  return {
    status: "linear_ticket_created",
    operationId: operation.operationId,
    issueId: operation.providerIssueId,
    issueKey: operation.providerIssueKey,
    title: operation.providerTitle,
    fetchedAt: operation.providerFetchedAt,
    currentDetails: "unavailable",
  };
}

/**
 * Handles an interrupted attempt. A fresh claim is still in flight; a stale one
 * has no receipt and must not be blindly re-created, so it expires to an
 * explicit uncertain result the caller can act on.
 */
async function describeAttemptingTicket(
  context: ReportContext,
  operation: TicketOperation,
  operations: TicketOperationStore,
  now: () => Date,
): Promise<ConfirmedTicketResult> {
  const startedAt = operation.startedAt
    ? Date.parse(operation.startedAt)
    : null;
  const stale =
    startedAt === null || now().getTime() - startedAt > ATTEMPT_LEASE_MS;
  if (!stale) {
    return {
      status: "ticket_uncertain",
      operationId: operation.operationId,
      reason: "operation_in_progress",
    };
  }
  const expired = await operations.finish(context, operation.operationId, {
    state: "uncertain",
    reason: "attempt_expired",
  });
  if (expired.status !== "found") {
    return {
      status: "ticket_uncertain",
      operationId: operation.operationId,
      reason: "operation_result_not_persisted",
    };
  }
  return describeRecordedTicket(expired.operation);
}

/** Input: terminal operation row. Output: public created/uncertain/failed result. */
function describeRecordedTicket(
  operation: TicketOperation,
): ConfirmedTicketResult {
  if (
    operation.state === "created" &&
    operation.providerIssueId &&
    operation.providerTitle &&
    operation.providerFetchedAt
  ) {
    return {
      status: "linear_ticket_created",
      operationId: operation.operationId,
      issueId: operation.providerIssueId,
      issueKey: operation.providerIssueKey,
      title: operation.providerTitle,
      fetchedAt: operation.providerFetchedAt,
      currentDetails: "fresh",
    };
  }
  if (operation.state === "rejected") {
    return {
      status: "ticket_failed",
      operationId: operation.operationId,
      reason: operation.reason ?? "linear_create_rejected",
    };
  }
  return {
    status: "ticket_uncertain",
    operationId: operation.operationId,
    reason: operation.reason ?? "linear_outcome_not_verified",
  };
}
