import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type {
  PrepareReportResult,
  SupportedReportType,
} from "../core/prepare-service-report.js";
import type { AgentToolResult } from "../server/agent-tools.js";
import type { LocalConfirmResult } from "../server/local-app.js";
import { VoicePanel } from "./VoicePanel.js";

type SavedReport = { status: "empty" } | PrepareReportResult;

const KNOWLEDGE_EXAMPLES = [
  {
    label: "Glass in city parks",
    tool: "lookupMunicipalCode",
    query: "What is BRC 8-3-9 about glass containers in city parks?",
  },
  {
    label: "Report a pothole",
    tool: "lookupCityInformation",
    query: "How do I report a pothole in Boulder?",
  },
  {
    label: "Upcoming council study session",
    tool: "findCityEvents",
    query: "Is there an upcoming City Council study session?",
  },
] as const;

const BLOCKED_MESSAGES: Record<string, string> = {
  invalid_input: "Please check the details and try again.",
  unsupported_request_type:
    "This demo supports pothole and park maintenance reports only.",
  scope_mismatch: "This draft is no longer available in this session.",
  revision_conflict: "The draft changed. Reload this page before editing.",
  store_unavailable: "The draft could not be saved. Please try again later.",
  missing_draft: "Save the report details before confirming.",
  incomplete_draft: "Add both the issue and location before confirming.",
  policy_unavailable: "The city schedule is unavailable. No action was taken.",
};

/** Input: a visitor opens the page. Output: a pothole draft form and the latest server result. */
export function App() {
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [requestType, setRequestType] =
    useState<SupportedReportType>("pothole");
  const [result, setResult] = useState<PrepareReportResult | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [action, setAction] = useState<LocalConfirmResult | null>(null);
  const [actionDraftId, setActionDraftId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [knowledge, setKnowledge] = useState<AgentToolResult | null>(null);
  const [knowledgeError, setKnowledgeError] = useState("");
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);
  const reportEpochRef = useRef(0);

  useEffect(() => {
    const request = new AbortController();

    /** Input: the page opens with a saved draft. Output: its current revision and fields appear before editing. */
    async function loadReport() {
      try {
        const response = await fetch("/api/local/report", {
          signal: request.signal,
        });
        const saved = (await response.json()) as SavedReport;
        if (!response.ok || saved.status === "blocked") {
          throw new Error("The current draft is unavailable.");
        }
        if (request.signal.aborted) return;
        if (
          saved.status === "needs_input" ||
          saved.status === "needs_confirmation"
        ) {
          setResult(saved);
          setRequestType(
            saved.status === "needs_input"
              ? saved.requestType
              : saved.summary.requestType,
          );
        } else if (saved.status !== "empty") {
          throw new Error("The current draft could not be read.");
        }
      } catch {
        if (!request.signal.aborted) {
          setLoadError(
            "Could not load the current draft. Check the local backend and retry.",
          );
        }
      } finally {
        if (!request.signal.aborted) setLoading(false);
      }
    }

    void loadReport();
    return () => request.abort();
  }, []);

  /** Input: submitting "deep pothole" and an empty location. Output: a saved draft asking for location. */
  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextDescription = description.trim();
    const nextLocation = location.trim();
    if (!nextDescription && !nextLocation) return;

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/local/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType,
          ...(nextDescription ? { description: nextDescription } : {}),
          ...(nextLocation ? { location: nextLocation } : {}),
        }),
      });
      const nextResult = (await response.json()) as PrepareReportResult;
      if (nextResult.status === "blocked") {
        setError(
          BLOCKED_MESSAGES[nextResult.code] ?? "The draft could not be saved.",
        );
        return;
      }
      if (!response.ok) throw new Error("The local service did not respond.");

      setResult(nextResult);
      setAction(null);
      setActionDraftId(null);
      setRequestType(
        nextResult.status === "needs_input"
          ? nextResult.requestType
          : nextResult.summary.requestType,
      );
      setDescription("");
      setLocation("");
    } catch {
      setError(
        "Could not reach the local service. Check that the backend is running.",
      );
    } finally {
      setSaving(false);
    }
  }

  /** Input: a click on revision 2's review button. Output: the server's route simulation or ticket limitation. */
  async function confirmReport() {
    if (result?.status !== "needs_confirmation") return;
    setConfirming(true);
    setError("");
    try {
      const response = await fetch("/api/local/report/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: result.draftId,
          revision: result.revision,
        }),
      });
      const nextAction = (await response.json()) as LocalConfirmResult;
      if (nextAction.status === "blocked") {
        setError(
          BLOCKED_MESSAGES[nextAction.code] ??
            "The report could not be confirmed. Reload and review the latest details.",
        );
        return;
      }
      if (!response.ok) throw new Error("The local service did not respond.");
      setAction(nextAction);
      setActionDraftId(result.draftId);
    } catch {
      setError("Could not reach the local service. Please try again.");
    } finally {
      setConfirming(false);
    }
  }

  /** Input: the reviewed code example button. Output: the server's cited answer or coverage limit. */
  async function tryKnowledgeExample(
    example: (typeof KNOWLEDGE_EXAMPLES)[number],
  ) {
    setLoadingKnowledge(true);
    setKnowledge(null);
    setKnowledgeError("");
    try {
      const response = await fetch("/api/local/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: example.tool, query: example.query }),
      });
      if (!response.ok) throw new Error("The local service did not respond.");
      setKnowledge((await response.json()) as AgentToolResult);
    } catch {
      setKnowledgeError(
        "Could not load the reviewed answer from the local service.",
      );
    } finally {
      setLoadingKnowledge(false);
    }
  }

  /** Input: a verified delegated tool result. Output: the matching report or source panel reflects server state. */
  function showVoiceResult(nextResult: AgentToolResult) {
    if (
      nextResult.status === "needs_input" ||
      nextResult.status === "needs_confirmation"
    ) {
      setResult(nextResult);
      setRequestType(
        nextResult.status === "needs_input"
          ? nextResult.requestType
          : nextResult.summary.requestType,
      );
      setAction(null);
      setActionDraftId(null);
    } else if (
      nextResult.status === "answered" ||
      nextResult.status === "limited_coverage"
    ) {
      setKnowledge(nextResult);
    } else if (nextResult.status === "blocked") {
      setError(BLOCKED_MESSAGES[nextResult.code] ?? "The request was blocked.");
    }
  }

  /** Input: a click on Start another report. Output: a fresh local draft slot without deleting the saved history. */
  async function startAnotherReport() {
    setError("");
    try {
      const response = await fetch("/api/local/report/new", { method: "POST" });
      if (!response.ok) throw new Error("Could not start a new report.");
      reportEpochRef.current += 1;
      setResult(null);
      setAction(null);
      setActionDraftId(null);
      setDescription("");
      setLocation("");
    } catch {
      setError("Could not start another report. Please try again.");
    }
  }

  const missingFields =
    result?.status === "needs_input" ? result.fields.join(" and ") : "";

  return (
    <main className="page">
      <header className="page-header">
        <p className="eyebrow">
          Independent developer demo · Boulder, Colorado
        </p>
        <h1>Boulder service demo</h1>
        <p className="intro">
          Ask a reviewed city question or report a nonurgent pothole or park
          maintenance issue. Confirm the saved details to see the business-hours
          decision.
        </p>
      </header>

      <VoicePanel
        onResult={showVoiceResult}
        action={action}
        actionDraftId={actionDraftId}
        reportEpochRef={reportEpochRef}
      />

      <section className="report-card" aria-labelledby="report-heading">
        <div className="card-header">
          <h2 id="report-heading">
            {requestType === "pothole"
              ? "Pothole details"
              : "Park issue details"}
          </h2>
          <span className="draft-badge">
            {action?.status === "linear_ticket_created"
              ? "Linear demo ticket"
              : action?.status === "ticket_uncertain"
                ? "Ticket uncertain"
                : action?.status === "simulated_route"
                  ? "Mock route"
                  : "Draft only"}
          </span>
        </div>

        {loading && <p role="status">Loading saved draft…</p>}

        {loadError && (
          <div role="alert">
            <p className="error">{loadError}</p>
            <button type="button" onClick={() => window.location.reload()}>
              Retry loading
            </button>
          </div>
        )}

        {!loading && !loadError && result?.status === "needs_input" && (
          <div className="notice" role="status">
            <strong>Draft saved · revision {result.revision}</strong>
            <p>Add the {missingFields} to continue.</p>
          </div>
        )}

        {!loading && !loadError && result?.status === "needs_confirmation" && (
          <div className="notice" role="status">
            <strong>Ready for review · revision {result.revision}</strong>
            <dl className="summary">
              <div>
                <dt>Issue</dt>
                <dd>{result.summary.description}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{result.summary.location}</dd>
              </div>
            </dl>
            <p>No service request has been submitted to the City of Boulder.</p>
            <button
              type="button"
              disabled={confirming || saving || action !== null}
              onClick={confirmReport}
            >
              {confirming
                ? "Checking…"
                : action
                  ? "Decision shown"
                  : "Confirm details and check action"}
            </button>
          </div>
        )}

        {action?.status === "simulated_route" && (
          <div className="notice" role="status">
            <strong>Routing simulated during office hours</strong>
            <p>
              This report would route to {action.department.name} at mock number{" "}
              {action.department.mockDestination}. No phone call was placed.
            </p>
          </div>
        )}

        {action?.status === "ticket_path_unavailable" && (
          <div className="notice" role="status">
            <strong>Office is closed</strong>
            <p>
              This report would follow the Linear ticket path. That path is not
              connected in this local demo; no ticket was created.
            </p>
          </div>
        )}

        {action?.status === "linear_ticket_created" && (
          <div className="notice" role="status">
            <strong>Demo ticket created in Linear</strong>
            <p>
              Issue ID: {action.issueId}. Operation: {action.operationId}.
              {action.currentDetails === "fresh"
                ? " Details were read back from Linear."
                : action.currentDetails === "changed"
                  ? " The issue was updated in Linear."
                  : " The latest Linear details could not be fetched; the saved creation receipt remains available."}
            </p>
            <button type="button" disabled={confirming} onClick={confirmReport}>
              {confirming ? "Checking Linear…" : "Check Linear again"}
            </button>
          </div>
        )}

        {action?.status === "ticket_uncertain" && (
          <div className="notice" role="status">
            <strong>Ticket outcome uncertain</strong>
            <p>
              The operation may have reached Linear. Reference{" "}
              {action.operationId}
              before trying again; this page will not create a duplicate.
            </p>
            <button type="button" disabled={confirming} onClick={confirmReport}>
              {confirming ? "Checking Linear…" : "Check Linear again"}
            </button>
          </div>
        )}

        {action?.status === "ticket_failed" && (
          <div className="notice" role="status">
            <strong>Ticket was not created</strong>
            <p>Linear rejected operation {action.operationId}.</p>
          </div>
        )}

        {!loading && !loadError && (
          <form onSubmit={submitReport}>
            <div className="field">
              <label htmlFor="request-type">Report type</label>
              <select
                id="request-type"
                value={requestType}
                disabled={result !== null}
                onChange={(event) =>
                  setRequestType(event.target.value as SupportedReportType)
                }
              >
                <option value="pothole">Pothole · Transportation</option>
                <option value="park_maintenance">
                  Park maintenance · Parks & Recreation
                </option>
              </select>
            </div>
            {result && (
              <p className="form-hint">
                Enter only a missing or changed detail. Leave the other field
                empty to keep it as saved.
              </p>
            )}
            <div className="field">
              <label htmlFor="description">What is the problem?</label>
              <textarea
                id="description"
                name="description"
                rows={3}
                maxLength={500}
                placeholder={
                  requestType === "pothole"
                    ? "For example, a deep pothole in the eastbound lane"
                    : "For example, a broken swing near the playground"
                }
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="location">Where is it?</label>
              <input
                id="location"
                name="location"
                type="text"
                maxLength={500}
                placeholder={
                  requestType === "pothole"
                    ? "For example, 15th Street at Pine Street"
                    : "For example, North Boulder Park near the playground"
                }
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                type="submit"
                disabled={
                  saving ||
                  confirming ||
                  (!description.trim() && !location.trim())
                }
              >
                {saving ? "Saving…" : result ? "Update draft" : "Save draft"}
              </button>
              {result && action?.status !== "ticket_uncertain" && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={saving || confirming}
                  onClick={() => void startAnotherReport()}
                >
                  Start another report
                </button>
              )}
            </div>
          </form>
        )}
      </section>

      <section className="report-card" aria-labelledby="knowledge-heading">
        <h2 id="knowledge-heading">Try three sourced answers</h2>
        <p className="form-hint">
          These reviewed examples demonstrate municipal code, city service
          information, and one dated event. They are not a complete Boulder
          knowledge base.
        </p>
        <div className="example-actions">
          {KNOWLEDGE_EXAMPLES.map((example) => (
            <button
              type="button"
              key={example.tool}
              disabled={loadingKnowledge}
              onClick={() => tryKnowledgeExample(example)}
            >
              {example.label}
            </button>
          ))}
        </div>
        {loadingKnowledge && <p role="status">Checking reviewed source…</p>}
        {knowledgeError && (
          <p role="alert" className="error">
            {knowledgeError}
          </p>
        )}
        {knowledge?.status === "answered" && (
          <div className="notice" role="status">
            <p>{knowledge.answer}</p>
            {knowledge.sources.map((source) => (
              <p key={source.url}>
                Source:{" "}
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
                {source.excerpt && <> · “{source.excerpt}…”</>} · reviewed{" "}
                {source.verifiedOn}
              </p>
            ))}
            <p>{knowledge.limitations.join(" ")}</p>
          </div>
        )}
        {knowledge?.status === "limited_coverage" && (
          <p role="status" className="form-hint">
            This reviewed example is unavailable for the question or date.
            Consult official Boulder sources for current information.
          </p>
        )}
      </section>

      <p className="footer-note">
        Local test interface. This page does not contact Boulder or submit a
        city service request.
      </p>
    </main>
  );
}
