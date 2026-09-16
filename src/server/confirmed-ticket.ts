import type { LinearTicketProvider } from "../adapters/linear/linear-ticket-provider.js";
import type { ReportContext } from "../core/prepare-service-report.js";
import type {
  TicketOperation,
  TicketOperationOutcome,
  TicketOperationStore,
} from "../core/ticket-operation.js";

export type TicketProvider = Pick<
  LinearTicketProvider,
  "createTicket" | "readTicket"
>;

export type ConfirmedTicketResult =
  | {
      status: "linear_ticket_created";
      operationId: string;
      issueId: string;
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

const TICKET_TITLE = "Boulder demo: pothole report";

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
    );
  }

  const operation = claimed.operation;
  const description = ticketDescription(operation);
  const creation = await provider.createTicket({
    title: TICKET_TITLE,
    description,
  });
  let outcome: TicketOperationOutcome;
  if (creation.status === "created") {
    const readback = await provider.readTicket(creation.ticket.id);
    outcome =
      readback.status === "found" &&
      readback.ticket.id === creation.ticket.id &&
      readback.ticket.title === TICKET_TITLE &&
      readback.ticket.description === description
        ? {
            state: "created",
            providerIssueId: readback.ticket.id,
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
function ticketDescription(operation: TicketOperation): string {
  return [
    "Boulder municipal service demo",
    `Demo operation: ${operation.operationId}`,
    `Location: ${operation.location}`,
    `Issue: ${operation.description}`,
  ].join("\n");
}

/**
 * Re-reads an existing created issue without making another create call.
 * Input: recorded issue ID. Output: a fresh read flag or stored receipt limitation.
 */
async function describeExistingTicket(
  context: ReportContext,
  operation: TicketOperation,
  operations: TicketOperationStore,
  provider: TicketProvider,
): Promise<ConfirmedTicketResult> {
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
    title: operation.providerTitle,
    fetchedAt: operation.providerFetchedAt,
    currentDetails: "unavailable",
  };
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
