import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import type { ConfirmPotholeResult } from "../core/confirm-pothole-route.js";
import type { PrepareReportResult } from "../core/prepare-service-report.js";

type SavedReport = { status: "empty" } | PrepareReportResult;

const BLOCKED_MESSAGES: Record<string, string> = {
  invalid_input: "Please check the details and try again.",
  unsupported_request_type: "This demo supports pothole reports only.",
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
  const [result, setResult] = useState<PrepareReportResult | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [action, setAction] = useState<ConfirmPotholeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

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
    setAction(null);
    try {
      const response = await fetch("/api/local/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
      const nextAction = (await response.json()) as ConfirmPotholeResult;
      if (nextAction.status === "blocked") {
        setError(
          BLOCKED_MESSAGES[nextAction.code] ??
            "The report could not be confirmed. Reload and review the latest details.",
        );
        return;
      }
      if (!response.ok) throw new Error("The local service did not respond.");
      setAction(nextAction);
    } catch {
      setError("Could not reach the local service. Please try again.");
    } finally {
      setConfirming(false);
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
        <h1>Report a pothole</h1>
        <p className="intro">
          Describe the issue and its location, then confirm the saved details to
          see the local business-hours decision.
        </p>
      </header>

      <section className="report-card" aria-labelledby="report-heading">
        <div className="card-header">
          <h2 id="report-heading">Pothole details</h2>
          <span className="draft-badge">Draft only</span>
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
            <p>No service request has been submitted.</p>
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

        {!loading && !loadError && (
          <form onSubmit={submitReport}>
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
                placeholder="For example, a deep pothole in the eastbound lane"
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
                placeholder="For example, 15th Street at Pine Street"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
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
          </form>
        )}
      </section>

      <p className="footer-note">
        Local test interface. This page does not contact Boulder or submit a
        city service request.
      </p>
    </main>
  );
}
