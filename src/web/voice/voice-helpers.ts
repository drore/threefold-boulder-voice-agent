import type { TranscriptDelta } from "./live-voice.js";

export type ReportDelegation = { id: string; draftId: string };

const TRANSCRIPT_POLL_MS = 250;
const TRANSCRIPT_QUIET_MS = 500;
const TRANSCRIPT_WAIT_MS = 2_000;

/** Input: caller fragments before offset 500 ms. Output: their text and the next unconsumed index. */
export function collectCallerText(
  parts: readonly TranscriptDelta[],
  cursor: number,
  offsetMs: number,
): { utterance: string; nextCursor: number } {
  let utterance = "";
  let nextCursor = cursor;
  for (let index = cursor; index < parts.length; index += 1) {
    const part = parts[index];
    if (part?.speaker !== "caller" || part.startMs > offsetMs) continue;
    utterance += part.delta;
    nextCursor = index + 1;
  }
  return { utterance: utterance.trim(), nextCursor };
}

/** Input: a caller transcript that changes while the current report resets. Output: null before that old turn is sent. */
export async function waitForCallerText(
  read: () => { utterance: string; nextCursor: number },
  isCurrent: () => boolean,
): Promise<{ utterance: string; nextCursor: number } | null> {
  let previous = "";
  let quietMs = 0;
  for (
    let waitedMs = 0;
    waitedMs < TRANSCRIPT_WAIT_MS;
    waitedMs += TRANSCRIPT_POLL_MS
  ) {
    if (!isCurrent()) return null;
    await new Promise((resolve) => setTimeout(resolve, TRANSCRIPT_POLL_MS));
    if (!isCurrent()) return null;
    const current = read();
    quietMs =
      current.utterance && current.utterance === previous
        ? quietMs + TRANSCRIPT_POLL_MS
        : 0;
    if (quietMs >= TRANSCRIPT_QUIET_MS) return current;
    previous = current.utterance;
  }
  return isCurrent() ? read() : null;
}

/** Input: delegation for draft A and confirmed draft B. Output: false, so B is never announced as A's result. */
export function matchesReportDelegation(
  delegation: ReportDelegation | null,
  actionDraftId: string | null,
): delegation is ReportDelegation {
  return delegation !== null && delegation.draftId === actionDraftId;
}
