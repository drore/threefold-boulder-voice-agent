import { describe, expect, it, vi } from "vitest";
import {
  collectCallerText,
  matchesReportDelegation,
  waitForCallerText,
} from "../../src/web/voice-helpers.js";
import type { TranscriptDelta } from "../../src/web/live-voice.js";

describe("delegated caller transcript", () => {
  it("includes a late final caller fragment that started before delegation", () => {
    const parts: TranscriptDelta[] = [
      { speaker: "caller", delta: "It is at ", startMs: 100, endMs: 250 },
      { speaker: "agent", delta: "Okay", startMs: 280, endMs: 350 },
      { speaker: "caller", delta: "15th and Pine", startMs: 400, endMs: 650 },
    ];
    expect(collectCallerText(parts, 0, 500)).toEqual({
      utterance: "It is at 15th and Pine",
      nextCursor: 3,
    });
  });

  it("keeps future caller fragments for the next delegation", () => {
    const parts: TranscriptDelta[] = [
      {
        speaker: "caller",
        delta: "What is BRC 8-3-9?",
        startMs: 100,
        endMs: 400,
      },
      {
        speaker: "caller",
        delta: "And a park issue",
        startMs: 900,
        endMs: 1200,
      },
    ];
    expect(collectCallerText(parts, 0, 500)).toEqual({
      utterance: "What is BRC 8-3-9?",
      nextCursor: 1,
    });
    expect(collectCallerText(parts, 1, 1300)).toEqual({
      utterance: "And a park issue",
      nextCursor: 2,
    });
  });

  it("does not consume the cursor when the caller transcript has not arrived", () => {
    expect(collectCallerText([], 0, 500)).toEqual({
      utterance: "",
      nextCursor: 0,
    });
  });

  it("drops a delegation whose report resets while transcript is still arriving", async () => {
    vi.useFakeTimers();
    try {
      let current = true;
      const pending = waitForCallerText(
        () => ({ utterance: "At 15th", nextCursor: 1 }),
        () => current,
      );
      await vi.advanceTimersByTimeAsync(250);
      current = false;
      await vi.advanceTimersByTimeAsync(250);
      expect(await pending).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("confirmed report voice update", () => {
  it("speaks only for the draft that started the voice delegation", () => {
    const delegation = { id: "delegation-1", draftId: "draft-A" };
    expect(matchesReportDelegation(delegation, "draft-A")).toBe(true);
    expect(matchesReportDelegation(delegation, "draft-B")).toBe(false);
    expect(matchesReportDelegation(delegation, null)).toBe(false);
  });
});
