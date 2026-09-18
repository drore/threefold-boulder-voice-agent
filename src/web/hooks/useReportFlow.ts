/**
 * Report-flow hook.
 * Owns the report draft state, its API calls, and the confirmed action outcome
 * for the single task screen. The voice path feeds draft results in through
 * `acceptDraft` so both channels share one state model.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  PrepareReportResult,
  SupportedReportType,
} from "../../core/service-report/prepare-service-report.js";
import type { LocalConfirmResult } from "../../server/workflow/confirm-outcome.js";
import {
  confirmReport,
  loadSavedReport,
  saveReport,
  startNewReport,
} from "../api.js";
import { blockedMessage } from "../messages.js";

export type ReportFlow = ReturnType<typeof useReportFlow>;

export function useReportFlow() {
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
  const reportEpochRef = useRef(0);

  useEffect(() => {
    const request = new AbortController();

    /** Input: the page opens with a saved draft. Output: its revision and fields appear before editing. */
    async function load() {
      try {
        const saved = await loadSavedReport(request.signal);
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

    void load();
    return () => request.abort();
  }, []);

  /** Input: submitted report fields. Output: a saved draft or a blocked message. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextDescription = description.trim();
    const nextLocation = location.trim();
    if (!nextDescription && !nextLocation) return;

    setSaving(true);
    setError("");
    try {
      const nextResult = await saveReport({
        requestType,
        ...(nextDescription ? { description: nextDescription } : {}),
        ...(nextLocation ? { location: nextLocation } : {}),
      });
      if (nextResult.status === "blocked") {
        setError(blockedMessage(nextResult.code));
        return;
      }
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

  /** Input: the on-screen review button. Output: the route simulation or ticket outcome. */
  async function confirm() {
    if (result?.status !== "needs_confirmation") return;
    setConfirming(true);
    setError("");
    try {
      const nextAction = await confirmReport(result.draftId, result.revision);
      if (nextAction.status === "blocked") {
        setError(blockedMessage(nextAction.code));
        return;
      }
      setAction(nextAction);
      setActionDraftId(result.draftId);
    } catch {
      setError("Could not reach the local service. Please try again.");
    } finally {
      setConfirming(false);
    }
  }

  /** Input: a click on Start another report. Output: a fresh draft slot. */
  async function startAnother() {
    setError("");
    try {
      await startNewReport();
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

  /** Input: a voice-path draft result. Output: the report panel reflects it. */
  function acceptDraft(nextResult: PrepareReportResult) {
    if (
      nextResult.status !== "needs_input" &&
      nextResult.status !== "needs_confirmation"
    ) {
      return;
    }
    setResult(nextResult);
    setRequestType(
      nextResult.status === "needs_input"
        ? nextResult.requestType
        : nextResult.summary.requestType,
    );
    setAction(null);
    setActionDraftId(null);
  }

  /** Input: a blocked voice-path result code. Output: the panel shows the message. */
  function showBlocked(code: string) {
    setError(blockedMessage(code));
  }

  /** Input: a voice-confirmed route/ticket outcome. Output: the panel shows the same notice as on-screen confirm. */
  function acceptVoiceAction(nextAction: LocalConfirmResult) {
    setAction(nextAction);
    setActionDraftId(null);
  }

  const missingFields =
    result?.status === "needs_input" ? result.fields.join(" and ") : "";

  return {
    description,
    setDescription,
    location,
    setLocation,
    requestType,
    setRequestType,
    result,
    error,
    setError,
    saving,
    confirming,
    action,
    actionDraftId,
    loading,
    loadError,
    missingFields,
    reportEpochRef,
    submit,
    confirm,
    startAnother,
    acceptDraft,
    showBlocked,
    acceptVoiceAction,
  };
}
