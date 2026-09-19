import { useEffect, useRef, useState, type RefObject } from "react";
import type { AgentToolResult } from "../../server/reasoning/tool-definitions.js";
import type { LocalConfirmResult } from "../../server/workflow/confirm-outcome.js";
import {
  LiveVoice,
  type LiveVoiceStatus,
  type TranscriptDelta,
} from "../voice/live-voice.js";
import {
  collectCallerText,
  matchesReportDelegation,
  waitForCallerText,
  type ReportDelegation,
} from "../voice/voice-helpers.js";
import { speechForAction, VOICE_STATUS_LABELS } from "../messages.js";

type DelegationResult =
  | { status: "completed"; speech: string; result?: AgentToolResult }
  | { status: "unavailable"; speech: string };

type VoicePanelProps = {
  onResult: (result: AgentToolResult) => void;
  action: LocalConfirmResult | null;
  actionDraftId: string | null;
  reportEpochRef: RefObject<number>;
};

const MAX_TRANSCRIPT_LENGTH = 1_500;

/** Input: a fetch failure. Output: whether a superseding caller turn canceled it. */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Simulates a phone transfer: a short ring tone, then the department desk
 * answers in one short line before the demo's outcome note. Audio is
 * best-effort; the routing is still reported in speech and on screen.
 */
async function announceSimulatedTransfer(
  voice: LiveVoice,
  departmentName: string,
): Promise<void> {
  await playRingTone();
  try {
    voice.sendInstruction(
      `For the next reply only, act as the ${departmentName} desk answering a transferred call: greet the caller and confirm the report was received in one short sentence. Make clear this is a simulated routing in a demo.`,
    );
  } catch {
    // The spoken demo outcome that follows still reports the routing honestly.
  }
  await new Promise((resolve) => setTimeout(resolve, 3200));
}

/** Input: none. Output: a short synthesized ring, or silence when audio is unavailable. */
async function playRingTone(): Promise<void> {
  try {
    const context = new AudioContext();
    const start = context.currentTime;
    for (const offset of [0, 0.7]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 440;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, start + offset + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.45);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.5);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await context.close();
  } catch {
    // Audio is optional; the spoken transfer note still runs.
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
  const activeFetchAbortRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<LiveVoiceStatus>("closed");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    return () => {
      const voice = voiceRef.current;
      voiceRef.current = null;
      activeFetchAbortRef.current?.abort();
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
    announcedActionRef.current = action;
    const activeVoice = voice;
    const delegationId = delegation.id;
    if (action.status === "simulated_route") {
      void announceSimulatedTransfer(activeVoice, action.department.name).then(
        () => {
          try {
            activeVoice.sendCommentary(delegationId, speechForAction(action));
          } catch {
            setError(
              "The action is shown on screen, but the voice update could not be sent.",
            );
          }
        },
      );
      return;
    }
    try {
      activeVoice.sendCommentary(delegationId, speechForAction(action));
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

    const controller = new AbortController();
    activeFetchAbortRef.current?.abort();
    activeFetchAbortRef.current = controller;
    setChecking(true);
    try {
      const response = await fetch("/api/local/delegation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ utterance: captured.utterance }),
        signal: controller.signal,
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
          result.result?.status === "needs_input" ||
          result.result?.status === "needs_confirmation"
        ) {
          reportDelegationRef.current = {
            id,
            draftId: result.result.draftId,
          };
        }
        if (result.result) onResult(result.result);
      }
      if (
        result.status === "completed" &&
        result.result?.status === "simulated_route"
      ) {
        await announceSimulatedTransfer(voice, result.result.department.name);
      }
      voice.sendCommentary(id, result.speech);
    } catch (error) {
      if (voiceRef.current !== voice) return;
      if (isAbortError(error)) return;
      setError("The assistant could not check that request. Please try again.");
      try {
        voice.sendCommentary(
          id,
          "I could not check that request. Please try again.",
        );
      } catch {
        // The voice session may already be closed; the visible error remains.
      }
    } finally {
      if (activeFetchAbortRef.current === controller) {
        activeFetchAbortRef.current = null;
      }
      if (voiceRef.current === voice) setChecking(false);
    }
  }

  /** Input: a click on Start voice. Output: a connected GPT-Live session or a visible permission/connection error. */
  async function startVoice() {
    if (!audioRef.current || voiceRef.current) return;
    const generation = ++sessionGenerationRef.current;
    setError("");
    setTranscript("");
    setChecking(false);
    transcriptRef.current = [];
    lastSpeakerRef.current = null;
    transcriptCursorRef.current = 0;
    delegationQueueRef.current = Promise.resolve();
    reportDelegationRef.current = null;
    announcedActionRef.current = null;
    handledDelegationsRef.current.clear();
    activeFetchAbortRef.current?.abort();
    activeFetchAbortRef.current = null;

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
        // A new caller turn supersedes any in-flight round-trip so it is not
        // serialized behind a stalled request.
        activeFetchAbortRef.current?.abort();
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
    activeFetchAbortRef.current?.abort();
    activeFetchAbortRef.current = null;
    const outcome = await voice.stop();
    if (voiceRef.current === voice) voiceRef.current = null;
    if (outcome === "unconfirmed") {
      setError("The voice connection ended without a close acknowledgment.");
    }
  }

  const active =
    status === "connecting" ||
    status === "ready" ||
    status === "reconnecting" ||
    status === "closing";

  return (
    <section className="report-card" aria-labelledby="voice-heading">
      <h2 id="voice-heading">Talk to the demo assistant</h2>
      <p className="form-hint">
        Ask about the reviewed city examples or describe a nonurgent issue.
        Voice requests use your microphone and the OpenAI service. The demo does
        not call the city or transfer to a real staff member.
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
      <p role="status">{VOICE_STATUS_LABELS[status]}</p>
      {checking && <p role="status">Checking your request…</p>}
      {/* biome-ignore lint/a11y/useMediaCaption: Live audio has no caption file; the timed transcript is displayed below. */}
      <audio
        ref={audioRef}
        controls
        aria-label="Assistant audio"
        className={status === "closed" ? "audio-idle" : undefined}
      />
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
