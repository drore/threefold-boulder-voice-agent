/**
 * Ticket-operation contract.
 * Defines the durable operation/receipt types and state shared by the
 * confirmation and provider layers, keeping provider SDK shapes out of core.
 */
import type {
  ReportContext,
  SupportedReportType,
} from "./prepare-service-report.js";

/** One confirmed supported report may authorize one Linear create attempt. */
export type TicketOperation = Readonly<{
  operationId: string;
  draftId: string;
  draftRevision: number;
  policyRevision: number;
  requestType: SupportedReportType;
  location: string;
  description: string;
  state: "ready" | "attempting" | "created" | "uncertain" | "rejected";
  providerIssueId: string | null;
  /** Linear's short human identifier for the caller, for example `DRO-5`. */
  providerIssueKey: string | null;
  providerTitle: string | null;
  providerDescription: string | null;
  providerFetchedAt: string | null;
  reason: string | null;
}>;

export type TicketOperationOutcome =
  | Readonly<{
      state: "created";
      providerIssueId: string;
      providerIssueKey: string;
      providerTitle: string;
      providerDescription: string;
      providerFetchedAt: string;
    }>
  | Readonly<{
      state: "uncertain";
      reason: string;
      providerIssueId?: string;
    }>
  | Readonly<{ state: "rejected"; reason: string }>;

export type TicketOperationRead =
  | { status: "found"; operation: TicketOperation }
  | {
      status: "blocked";
      code:
        | "scope_mismatch"
        | "missing_draft"
        | "revision_conflict"
        | "incomplete_draft"
        | "policy_unavailable";
    }
  | { status: "unavailable" };

export type TicketOperationLookup = TicketOperationRead | { status: "missing" };

/**
 * Atomic operation boundary: reserve one draft, claim one external attempt, and
 * retain the outcome. The adapter rechecks admission and draft revision.
 */
export interface TicketOperationStore {
  /** Input: scoped draft ID and revision. Output: its operation, if one was already authorized. */
  findByDraft(
    context: ReportContext,
    draftId: string,
    expectedRevision: number,
  ): Promise<TicketOperationLookup>;

  /** Input: confirmed draft/revision and selected policy revision. Output: existing or new operation. */
  authorize(
    context: ReportContext,
    draftId: string,
    expectedRevision: number,
    policyRevision: number,
  ): Promise<TicketOperationRead>;

  /** Input: operation ID. Output: the only caller that changed `ready` to `attempting` gets `started`. */
  start(
    context: ReportContext,
    operationId: string,
  ): Promise<
    { status: "started"; operation: TicketOperation } | TicketOperationRead
  >;

  /** Input: the result of one external attempt. Output: persisted terminal operation or unavailable. */
  finish(
    context: ReportContext,
    operationId: string,
    outcome: TicketOperationOutcome,
  ): Promise<TicketOperationRead>;
}
