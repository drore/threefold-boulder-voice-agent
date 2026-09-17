/**
 * Browser API boundary.
 * Typed same-origin fetch helpers for the demo endpoints, so components never
 * build raw requests. Cookie-scoped; no credentials or provider keys here.
 */
import type {
  PrepareReportResult,
  SupportedReportType,
} from "../core/prepare-service-report.js";
import type { AgentToolResult } from "../server/reasoning/agent-tools.js";
import type { LocalConfirmResult } from "../server/build-app.js";

export type SavedReport = { status: "empty" } | PrepareReportResult;
export type DemoScenario = "live" | "open" | "closed";
export type AccessState = "admitted" | "required" | "unavailable";

/** Input: the access probe. Output: whether this browser is admitted. */
export async function fetchAccess(): Promise<AccessState> {
  const response = await fetch("/api/access");
  if (response.ok) return "admitted";
  return response.status === 401 ? "required" : "unavailable";
}

/** Input: the reviewer code. Output: `"admitted"`, `"rejected"`, or `"unavailable"`. */
export async function submitAccessCode(
  code: string,
): Promise<AccessState | "rejected"> {
  const response = await fetch("/api/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (response.ok) return "admitted";
  return response.status === 401 ? "rejected" : "unavailable";
}

/** Input: an abort signal. Output: this session's saved draft, if any. */
export async function loadSavedReport(
  signal?: AbortSignal,
): Promise<SavedReport> {
  const response = await fetch("/api/local/report", signal ? { signal } : {});
  const saved = (await response.json()) as SavedReport;
  if (!response.ok || saved.status === "blocked") {
    throw new Error("The current draft is unavailable.");
  }
  return saved;
}

/** Input: report fields to save. Output: the draft result, including blocked states. */
export async function saveReport(fields: {
  requestType: SupportedReportType;
  description?: string;
  location?: string;
}): Promise<PrepareReportResult> {
  const response = await fetch("/api/local/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  const result = (await response.json()) as PrepareReportResult;
  if (result.status === "blocked") return result;
  if (!response.ok) throw new Error("The local service did not respond.");
  return result;
}

/** Input: a revision-bound confirmation. Output: the route/ticket decision or a blocked state. */
export async function confirmReport(
  draftId: string,
  revision: number,
): Promise<LocalConfirmResult> {
  const response = await fetch("/api/local/report/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draftId, revision }),
  });
  const result = (await response.json()) as LocalConfirmResult;
  if (result.status === "blocked") return result;
  if (!response.ok) throw new Error("The local service did not respond.");
  return result;
}

/** Input: none. Output: a fresh empty draft slot for this session. */
export async function startNewReport(): Promise<void> {
  const response = await fetch("/api/local/report/new", { method: "POST" });
  if (!response.ok) throw new Error("Could not start a new report.");
}

/** Input: a reviewed example. Output: its cited answer or coverage limit. */
export async function fetchKnowledgeExample(
  tool: "lookupMunicipalCode" | "lookupCityInformation" | "findCityEvents",
  query: string,
): Promise<AgentToolResult> {
  const response = await fetch("/api/local/knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, query }),
  });
  if (!response.ok) throw new Error("The local service did not respond.");
  return (await response.json()) as AgentToolResult;
}

/** Input: a demo-time selection. Output: the fixed clock the server applied. */
export async function selectDemoScenario(
  scenario: DemoScenario,
): Promise<{ simulatedNow: string | null }> {
  const response = await fetch("/api/local/scenario", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario }),
  });
  if (!response.ok) throw new Error("Could not set the demo scenario.");
  return (await response.json()) as { simulatedNow: string | null };
}
