import { useEffect, useRef, useState, type RefObject } from "react";
import type { AgentToolResult } from "../server/agent-tools.js";
import type { LocalConfirmResult } from "../server/local-app.js";
import {
  LiveVoice,
  type LiveVoiceStatus,
  type TranscriptDelta,
} from "./live-voice.js";
import {
  collectCallerText,
  matchesReportDelegation,
  waitForCallerText,
  type ReportDelegation,
} from "./voice-helpers.js";

type DelegationResult =
  | { status: "completed"; speech: string; result: AgentToolResult }
  | { status: "unavailable"; speech: string };

type VoicePanelProps = {
  onResult: (result: AgentToolResult) => void;
  action: LocalConfirmResult | null;
  actionDraftId: string | null;
  reportEpochRef: RefObject<number>;
};

const MAX_TRANSCRIPT_LENGTH = 1_500;

/** Input: a verified route or Linear outcome. Output: accurate spoken copy with demo limitations. */
function speechForAction(action: LocalConfirmResult): string {
  switch (action.status) {
    case "simulated_route":
      return `The confirmed report would route to ${action.department.name} at mock number ${action.department.mockDestination}. No real phone call was placed.`;
    case "linear_ticket_created":
      return action.currentDetails === "unavailable"
        ? `A demo ticket was previously created and verified in Linear. Its issue ID is ${action.issueId}, but I could not refresh its current details.`
        : `The demo ticket was created in Linear and read back. Its issue ID is ${action.issueId}.`;
    case "ticket_path_unavailable":
      return "The office is closed, but Linear is not configured. No ticket was created.";
    case "ticket_uncertain":
      return `The Linear ticket outcome is uncertain. I will not create a duplicate. The operation reference is ${action.operationId}.`;
    case "ticket_failed":
      return "Linear rejected the demo ticket. No ticket was confirmed.";
    default:
      return "I could not confirm that report. Please review the details on screen.";
  }
}

/** Input: a browser visitor starts a microphone session. Output: spoken replies and the same reviewed results shown by the text UI. */
export function VoicePanel({
  onResult,
  action,
  actionDraftId,
  reportEpochRef,
}: VoicePanelProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const voiceRef = useRef<LiveVoice | null>(null);
  const transcriptRef = useRef<TranscriptDelta[]>([]);
  const lastSpeakerRef = useRef<TranscriptDelta["speaker"] | null>(null);
  const transcriptCursorRef = useRef(0);
  const delegationQueueRef = useRef(Promise.resolve());
  const reportDelegationRef = useRef<ReportDelegation | null>(null);
  const announcedActionRef = useRef<LocalConfirmResult | null>(null);
  const sessionGenerationRef = useRef(0);
  const handledDelegationsRef = useRef(new Set<string>());
  const [status, setStatus] = useState<LiveVoiceStatus>("closed");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      const voice = voiceRef.current;
      voiceRef.current = null;
      if (voice) void voice.stop();
    };
  }, []);

  useEffect(() => {
    const voice = voiceRef.current;
    const delegation = reportDelegationRef.current;
    if (
      !action ||
      action === announcedActionRef.current ||
      !voice ||
      !matchesReportDelegation(delegation, actionDraftId) ||
      status !== "ready"
    )
      return;
    try {
      voice.sendCommentary(delegation.id, speechForAction(action));
      announcedActionRef.current = action;
    } catch {
      setError(
        "The action is shown on screen, but the voice update could not be sent.",
      );
    }
  }, [action, actionDraftId, status]);

  /** Input: one timed Live transcript delta. Output: a bounded visible log and recent caller history for delegation. */
  function recordTranscript(part: TranscriptDelta) {
    transcriptRef.current.push(part);
    if (transcriptRef.current.length > 200) {
      transcriptRef.current.shift();
      transcriptCursorRef.current = Math.max(
        0,
        transcriptCursorRef.current - 1,
      );
    }
    const label =
      lastSpeakerRef.current === part.speaker
        ? ""
        : `\n${part.speaker === "caller" ? "Caller" : "Assistant"}: `;
    lastSpeakerRef.current = part.speaker;
    setTranscript((previous) =>
      `${previous}${label}${part.delta}`.slice(-MAX_TRANSCRIPT_LENGTH),
    );
  }

  /** Input: a delegation ID and offset from GPT-Live. Output: a verified backend reply returned to that delegation. */
  async function handleDelegation(
    voice: LiveVoice,
    id: string,
    offsetMs: number,
    reportEpoch: number,
  ) {
    if (voiceRef.current !== voice) return;
    const captured = await waitForCallerText(
      () =>
        collectCallerText(
          transcriptRef.current,
          transcriptCursorRef.current,
          offsetMs,
        ),
      () => reportEpoch === reportEpochRef.current,
    );
    if (voiceRef.current !== voice) return;
    if (!captured) {
      try {
        voice.sendCommentary(
          id,
          "A new report started while I was checking. Please repeat your request.",
        );
      } catch {
        // The voice session may already be closed.
      }
      return;
    }
    if (!captured.utterance) {
      try {
        voice.sendCommentary(
          id,
          "I did not catch the request. Please repeat it.",
        );
      } catch {
        setError(
          "The voice connection ended before I could ask for clarification.",
        );
      }
      return;
    }
    transcriptCursorRef.current = captured.nextCursor;

    try {
      const response = await fetch("/api/local/delegation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ utterance: captured.utterance }),
      });
      const result = (await response.json()) as DelegationResult;
      if (!response.ok || !result.speech) {
        throw new Error("The delegated request could not be checked.");
      }
      if (voiceRef.current !== voice) return;
      if (reportEpoch !== reportEpochRef.current) {
        voice.sendCommentary(
          id,
          "A new report started while I was checking. Please repeat your request.",
        );
        return;
      }
      if (result.status === "completed") {
        if (
          result.result.status === "needs_input" ||
          result.result.status === "needs_confirmation"
        ) {
          reportDelegationRef.current = {
            id,
            draftId: result.result.draftId,
          };
        }
        onResult(result.result);
      }
      voice.sendCommentary(id, result.speech);
    } catch {
      if (voiceRef.current !== voice) return;
      setError("The assistant could not check that request. Please try again.");
      try {
        voice.sendCommentary(
          id,
          "I could not check that request. Please try again or use the form on screen.",
        );
      } catch {
        // The voice session may already be closed; the visible error remains.
      }
    }
  }

  /** Input: a click on Start voice. Output: a connected GPT-Live session or a visible permission/connection error. */
  async function startVoice() {
    if (!audioRef.current || voiceRef.current) return;
    const generation = ++sessionGenerationRef.current;
    setError("");
    setTranscript("");
    transcriptRef.current = [];
    lastSpeakerRef.current = null;
    transcriptCursorRef.current = 0;
    delegationQueueRef.current = Promise.resolve();
    reportDelegationRef.current = null;
    announcedActionRef.current = null;
    handledDelegationsRef.current.clear();

    const voice = new LiveVoice(audioRef.current, {
      onStatus: (nextStatus) => {
        setStatus(nextStatus);
        if (
          (nextStatus === "closed" || nextStatus === "disconnected") &&
          voiceRef.current === voice
        ) {
          voiceRef.current = null;
        }
      },
      onTranscript: recordTranscript,
      onDelegation: ({ id, offsetMs }) => {
        if (handledDelegationsRef.current.has(id)) return;
        handledDelegationsRef.current.add(id);
        const reportEpoch = reportEpochRef.current;
        delegationQueueRef.current = delegationQueueRef.current.then(() =>
          handleDelegation(voice, id, offsetMs, reportEpoch),
        );
      },
      onError: setError,
    });
    voiceRef.current = voice;
    try {
      await voice.start();
    } catch (cause) {
      if (voiceRef.current === voice) voiceRef.current = null;
      if (sessionGenerationRef.current === generation) {
        setError(
          cause instanceof Error ? cause.message : "Could not start voice.",
        );
      }
    }
  }

  /** Input: a click on End voice. Output: immediate microphone release and an acknowledged or uncertain close state. */
  async function stopVoice() {
    const voice = voiceRef.current;
    if (!voice) return;
    sessionGenerationRef.current += 1;
    const outcome = await voice.stop();
    if (voiceRef.current === voice) voiceRef.current = null;
    if (outcome === "unconfirmed") {
      setError("The voice connection ended without a close acknowledgment.");
    }
  }

  const active =
    status === "connecting" || status === "ready" || status === "closing";

  return (
    <section className="report-card" aria-labelledby="voice-heading">
      <h2 id="voice-heading">Talk to the Boulder demo assistant</h2>
      <p className="form-hint">
        Ask about the reviewed city examples or describe a nonurgent issue.
        Voice requests use your microphone and the OpenAI service. The demo does
        not call Boulder or transfer to a real staff member.
      </p>
      <div className="example-actions">
        <button
          type="button"
          disabled={active}
          onClick={() => void startVoice()}
        >
          Start voice
        </button>
        <button
          type="button"
          disabled={!active || status === "closing"}
          onClick={() => void stopVoice()}
        >
          End voice
        </button>
      </div>
      <p role="status">Voice: {status}</p>
      {/* biome-ignore lint/a11y/useMediaCaption: Live audio has no caption file; the timed transcript is displayed below. */}
      <audio ref={audioRef} controls aria-label="Assistant audio" />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {transcript && (
        <p
          className="voice-transcript"
          role="log"
          aria-label="Recent voice transcript"
        >
          {transcript}
        </p>
      )}
    </section>
  );
}
