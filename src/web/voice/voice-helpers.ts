import type { TranscriptDelta } from "./live-voice.js";

export type ReportDelegation = { id: string; draftId: string };

const TRANSCRIPT_POLL_MS = 250;
const QUIET_PERIOD_MS = 900;
const TRANSCRIPT_WAIT_MS = 2_400;

/** Input: caller fragments up to the delegation offset. Output: their text and the next unconsumed index. */
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
  if (utterance.trim().length > 0) {
    return { utterance: utterance.trim(), nextCursor };
  }
  // A late-arriving final delta can start just after the delegation offset and
  // be excluded above, leaving the turn empty. Fall back to the last caller
  // fragment so the caller is not forced to repeat a completed turn.
  for (let index = parts.length - 1; index >= cursor; index -= 1) {
    const part = parts[index];
    if (part?.speaker !== "caller") continue;
    return { utterance: part.delta.trim(), nextCursor: index + 1 };
  }
  return { utterance: "", nextCursor };
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
    if (quietMs >= QUIET_PERIOD_MS) return current;
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
