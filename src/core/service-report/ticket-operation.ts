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
  /** When the sole winning caller claimed the attempt, or null before claim. */
  startedAt: string | null;
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
 * Provider-neutral ticket port. Owned by core so the workflow depends on the
 * contract, not on a concrete adapter's return types. A provider adapter
 * implements this; the first one is Linear.
 */
export type TicketCreateInput = Readonly<{
  title: string;
  description: string;
}>;

export type TicketProviderTicket = Readonly<{
  id: string;
  identifier: string;
  title: string;
}>;

export type TicketProviderSnapshot = Readonly<{
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  fetchedAt: string;
}>;

export type TicketCreateResult =
  | { status: "created"; ticket: TicketProviderTicket }
  | { status: "rejected"; reason: string }
  | { status: "uncertain"; reason: string }
  | { status: "unavailable"; reason: string };

export type TicketReadResult =
  | { status: "found"; ticket: TicketProviderSnapshot }
  | { status: "not_found" }
  | { status: "rejected"; reason: string }
  | { status: "unavailable"; reason: string };

export interface TicketProvider {
  /** Input: prepared bounded ticket text. Output: a verified creation or honest failure. */
  createTicket(input: TicketCreateInput): Promise<TicketCreateResult>;
  /** Input: a recorded issue ID. Output: a timestamped snapshot or a classified miss. */
  readTicket(issueId: string): Promise<TicketReadResult>;
}

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
