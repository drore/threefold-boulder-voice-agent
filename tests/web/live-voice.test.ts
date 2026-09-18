import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveVoice } from "../../src/web/voice/live-voice.js";

class FakeChannel extends EventTarget {
  readyState: RTCDataChannelState = "open";
  sent: unknown[] = [];

  /** Input: a JSON Live client event. Output: the event is captured for assertion. */
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  /** Input: an event such as `session.started`. Output: the browser message listener receives it. */
  receive(event: object): void {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(event) }),
    );
  }

  /** Input: an open channel. Output: a close event and closed state. */
  close(): void {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    this.dispatchEvent(new Event("close"));
  }
}

class FakePeer extends EventTarget {
  static latest: FakePeer;
  static deferIce = false;
  readonly channel = new FakeChannel();
  iceGatheringState: RTCIceGatheringState = "complete";
  connectionState: RTCPeerConnectionState = "new";
  localDescription: { sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  closed = false;

  constructor() {
    super();
    FakePeer.latest = this;
  }

  /** Input: one microphone track. Output: the fake peer accepts it. */
  addTrack(): void {}

  /** Input: the `oai-events` label. Output: the fake data channel. */
  createDataChannel(label: string): FakeChannel {
    expect(label).toBe("oai-events");
    return this.channel;
  }

  /** Input: an initialized peer. Output: an SDP offer. */
  async createOffer(): Promise<{ type: "offer"; sdp: string }> {
    return { type: "offer", sdp: "initial-offer" };
  }

  /** Input: the browser offer. Output: its gathered SDP becomes available. */
  async setLocalDescription(): Promise<void> {
    if (FakePeer.deferIce) {
      this.iceGatheringState = "gathering";
      this.localDescription = { sdp: "pre-ice-offer" };
    } else {
      this.localDescription = { sdp: "gathered-offer" };
    }
  }

  /** Input: pending ICE gathering. Output: the final SDP and an ICE completion event. */
  completeIce(): void {
    this.localDescription = { sdp: "gathered-offer" };
    this.iceGatheringState = "complete";
    this.dispatchEvent(new Event("icegatheringstatechange"));
  }

  /** Input: the server SDP answer. Output: the peer receives it and emits `session.started`. */
  async setRemoteDescription(answer: {
    type: string;
    sdp: string;
  }): Promise<void> {
    this.remoteDescription = answer;
    queueMicrotask(() =>
      this.channel.receive({
        type: "session.started",
        session: { id: "live_123" },
      }),
    );
  }

  /** Input: an active peer. Output: it records closure. */
  close(): void {
    this.closed = true;
  }
}

const track = { stop: vi.fn() };
const microphone = {
  getAudioTracks: () => [track],
  getTracks: () => [track],
};

/** Input: a test that starts browser voice. Output: a fake WebRTC transport with no external API call. */
function stubBrowser(): HTMLAudioElement {
  vi.stubGlobal("RTCPeerConnection", FakePeer);
  vi.stubGlobal(
    "MediaStream",
    class {
      constructor(readonly tracks: unknown[]) {}
    },
  );
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: vi.fn(async () => microphone) },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        session: { id: "live_123" },
        transport: { type: "webrtc", sdp: "answer-sdp" },
      }),
    })),
  );
  return {
    srcObject: null,
    play: vi.fn(async () => {}),
  } as unknown as HTMLAudioElement;
}

describe("LiveVoice", () => {
  beforeEach(() => {
    track.stop.mockClear();
    FakePeer.deferIce = false;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("connects with the gathered offer, relays transcripts and delegation results, and closes gracefully", async () => {
    const audio = stubBrowser();
    const onTranscript = vi.fn();
    const onDelegation = vi.fn();
    const onStatus = vi.fn();
    const voice = new LiveVoice(audio, {
      onTranscript,
      onDelegation,
      onStatus,
    });

    await expect(voice.start()).resolves.toBe("live_123");
    expect(fetch).toHaveBeenCalledWith(
      "/api/local/live-session",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sdp: "gathered-offer" }),
      }),
    );
    expect(FakePeer.latest.remoteDescription).toEqual({
      type: "answer",
      sdp: "answer-sdp",
    });
    const channel = FakePeer.latest.channel;
    channel.receive({
      type: "session.input_transcript.delta",
      delta: "Pine Street",
      start_ms: 100,
      end_ms: 900,
    });
    channel.receive({
      type: "session.output_transcript.delta",
      delta: "Which cross street?",
      start_ms: 950,
      end_ms: 1500,
    });
    channel.receive({
      type: "session.delegation.created",
      offset_ms: 1600,
      delegation: { id: "item_123", target: "client" },
    });
    expect(onTranscript).toHaveBeenCalledWith({
      speaker: "caller",
      delta: "Pine Street",
      startMs: 100,
      endMs: 900,
    });
    expect(onTranscript).toHaveBeenCalledWith({
      speaker: "agent",
      delta: "Which cross street?",
      startMs: 950,
      endMs: 1500,
    });
    expect(onDelegation).toHaveBeenCalledWith({
      id: "item_123",
      offsetMs: 1600,
    });
    expect(() =>
      voice.sendCommentary("unknown", "No ticket was created."),
    ).toThrow();
    voice.sendCommentary("item_123", "The request was recorded.");
    expect(channel.sent).toContainEqual(
      expect.objectContaining({
        type: "session.commentary.append",
        delegation_id: "item_123",
        content: "The request was recorded.",
      }),
    );

    const stopped = voice.stop();
    expect(channel.sent).toContainEqual({ type: "session.close" });
    expect(track.stop).toHaveBeenCalledOnce();
    channel.receive({ type: "session.closed" });
    await expect(stopped).resolves.toBe("closed");
    expect(track.stop).toHaveBeenCalledOnce();
    expect(FakePeer.latest.closed).toBe(true);
    expect(audio.srcObject).toBeNull();
    expect(onStatus.mock.calls.map(([status]) => status)).toEqual([
      "connecting",
      "ready",
      "closing",
      "closed",
    ]);
  });

  it("stops a pending microphone request without creating an external session", async () => {
    const audio = stubBrowser();
    let resolveMicrophone!: (stream: typeof microphone) => void;
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: () =>
          new Promise<typeof microphone>((resolve) => {
            resolveMicrophone = resolve;
          }),
      },
    });
    const voice = new LiveVoice(audio);

    const starting = voice.start();
    await expect(voice.stop()).resolves.toBe("unconfirmed");
    resolveMicrophone(microphone);
    await expect(starting).rejects.toThrow("stopped");
    expect(track.stop).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("waits for complete ICE gathering before posting the SDP offer", async () => {
    const audio = stubBrowser();
    FakePeer.deferIce = true;
    const voice = new LiveVoice(audio);

    const starting = voice.start();
    await vi.waitFor(() =>
      expect(FakePeer.latest.localDescription?.sdp).toBe("pre-ice-offer"),
    );
    expect(fetch).not.toHaveBeenCalled();
    FakePeer.latest.completeIce();
    await expect(starting).resolves.toBe("live_123");
    expect(fetch).toHaveBeenCalledWith(
      "/api/local/live-session",
      expect.objectContaining({
        body: JSON.stringify({ sdp: "gathered-offer" }),
      }),
    );
    const stopped = voice.stop();
    FakePeer.latest.channel.receive({ type: "session.closed" });
    await expect(stopped).resolves.toBe("closed");
  });

  it("reports unconfirmed closure if the event channel drops before `session.closed`", async () => {
    const audio = stubBrowser();
    const onStatus = vi.fn();
    const voice = new LiveVoice(audio, { onStatus });
    await voice.start();

    const stopped = voice.stop();
    FakePeer.latest.channel.close();

    await expect(stopped).resolves.toBe("unconfirmed");
    expect(track.stop).toHaveBeenCalledOnce();
    expect(onStatus).toHaveBeenLastCalledWith("disconnected");
  });

  it("surfaces a reconnecting status on a transient disconnect and recovers", async () => {
    const audio = stubBrowser();
    const onStatus = vi.fn();
    const voice = new LiveVoice(audio, { onStatus });
    await voice.start();
    onStatus.mockClear();

    FakePeer.latest.connectionState = "disconnected";
    FakePeer.latest.dispatchEvent(new Event("connectionstatechange"));
    expect(onStatus).toHaveBeenCalledWith("reconnecting");

    FakePeer.latest.connectionState = "connected";
    FakePeer.latest.dispatchEvent(new Event("connectionstatechange"));
    expect(onStatus).toHaveBeenCalledWith("ready");

    const stopped = voice.stop();
    FakePeer.latest.channel.receive({ type: "session.closed" });
    await expect(stopped).resolves.toBe("closed");
  });
});
