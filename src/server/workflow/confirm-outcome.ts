/**
 * Confirm outcome.
 * The union of results for confirming a saved report: a simulated route, a
 * durable-ticket outcome, an unavailable ticket path, or a blocked decision.
 * Shared by the API composition, the reasoning tool boundary, and the UI.
 */
import type { ConfirmServiceReportDecision } from "../../core/service-report/confirm-service-report.js";
import type { ConfirmedTicketResult } from "./confirmed-ticket.js";

export type LocalConfirmResult =
  | Exclude<ConfirmServiceReportDecision, { status: "ticket_required" }>
  | ConfirmedTicketResult
  | { status: "ticket_path_unavailable"; reason: "not_configured" };
