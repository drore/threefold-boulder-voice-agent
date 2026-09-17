/**
 * Report panel.
 * Renders the report form, revision notices, and the confirmed route/ticket
 * outcome. All state and calls come from the report-flow hook.
 */
import type { SupportedReportType } from "../../core/prepare-service-report.js";
import type { ReportFlow } from "../hooks/useReportFlow.js";

export function ReportPanel({ flow }: { flow: ReportFlow }) {
  const { result, action } = flow;

  return (
    <section className="report-card" aria-labelledby="report-heading">
      <div className="card-header">
        <h2 id="report-heading">
          {flow.requestType === "pothole"
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

      {flow.loading && <p role="status">Loading saved draft…</p>}

      {flow.loadError && (
        <div role="alert">
          <p className="error">{flow.loadError}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Retry loading
          </button>
        </div>
      )}

      {!flow.loading && !flow.loadError && result?.status === "needs_input" && (
        <div className="notice" role="status">
          <strong>Draft saved · revision {result.revision}</strong>
          <p>Add the {flow.missingFields} to continue.</p>
        </div>
      )}

      {!flow.loading &&
        !flow.loadError &&
        result?.status === "needs_confirmation" && (
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
              disabled={flow.confirming || flow.saving || action !== null}
              onClick={() => void flow.confirm()}
            >
              {flow.confirming
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
          <button
            type="button"
            disabled={flow.confirming}
            onClick={() => void flow.confirm()}
          >
            {flow.confirming ? "Checking Linear…" : "Check Linear again"}
          </button>
        </div>
      )}

      {action?.status === "ticket_uncertain" && (
        <div className="notice" role="status">
          <strong>Ticket outcome uncertain</strong>
          <p>
            The operation may have reached Linear. Reference{" "}
            {action.operationId} before trying again; this page will not create
            a duplicate.
          </p>
          <button
            type="button"
            disabled={flow.confirming}
            onClick={() => void flow.confirm()}
          >
            {flow.confirming ? "Checking Linear…" : "Check Linear again"}
          </button>
        </div>
      )}

      {action?.status === "ticket_failed" && (
        <div className="notice" role="status">
          <strong>Ticket was not created</strong>
          <p>Linear rejected operation {action.operationId}.</p>
        </div>
      )}

      {!flow.loading && !flow.loadError && (
        <form onSubmit={flow.submit}>
          <div className="field">
            <label htmlFor="request-type">Report type</label>
            <select
              id="request-type"
              value={flow.requestType}
              disabled={result !== null}
              onChange={(event) =>
                flow.setRequestType(event.target.value as SupportedReportType)
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
                flow.requestType === "pothole"
                  ? "For example, a deep pothole in the eastbound lane"
                  : "For example, a broken swing near the playground"
              }
              value={flow.description}
              onChange={(event) => flow.setDescription(event.target.value)}
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
                flow.requestType === "pothole"
                  ? "For example, 15th Street at Pine Street"
                  : "For example, North Boulder Park near the playground"
              }
              value={flow.location}
              onChange={(event) => flow.setLocation(event.target.value)}
            />
          </div>
          {flow.error && (
            <p className="error" role="alert">
              {flow.error}
            </p>
          )}
          <div className="form-actions">
            <button
              type="submit"
              disabled={
                flow.saving ||
                flow.confirming ||
                (!flow.description.trim() && !flow.location.trim())
              }
            >
              {flow.saving ? "Saving…" : result ? "Update draft" : "Save draft"}
            </button>
            {result && action?.status !== "ticket_uncertain" && (
              <button
                type="button"
                className="secondary-button"
                disabled={flow.saving || flow.confirming}
                onClick={() => void flow.startAnother()}
              >
                Start another report
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
