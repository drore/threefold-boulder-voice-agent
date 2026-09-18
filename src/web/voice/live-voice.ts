const SESSION_ENDPOINT = "/api/local/live-session";
const EVENT_CHANNEL = "oai-events";
const ICE_TIMEOUT_MS = 10_000;
const START_TIMEOUT_MS = 15_000;
const CLOSE_TIMEOUT_MS = 15_000;

export type LiveVoiceStatus =
  | "connecting"
  | "ready"
  | "reconnecting"
  | "closing"
  | "closed"
  | "disconnected";

export type TranscriptDelta = {
  speaker: "caller" | "agent";
  delta: string;
  startMs: number;
  endMs: number;
};

export type ClientDelegation = { id: string; offsetMs: number };

export type LiveVoiceHandlers = {
  onStatus?: (status: LiveVoiceStatus) => void;
  onTranscript?: (transcript: TranscriptDelta) => void;
  onDelegation?: (delegation: ClientDelegation) => void;
  onError?: (message: string) => void;
};

type SessionAnswer = {
  session: { id: string };
  transport: { type: "webrtc"; sdp: string };
};

/** Input: a peer with pending ICE candidates. Output: an SDP-ready promise or a timeout error. */
function waitForIce(
  peer: RTCPeerConnection,
  signal: AbortSignal,
): Promise<void> {
  if (peer.iceGatheringState === "complete") return Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", onChange);
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onChange = () => {
      if (peer.iceGatheringState === "complete") finish();
    };
    const onAbort = () => finish(new Error("Voice connection was stopped."));
    const timeout = setTimeout(
      () => finish(new Error("Timed out while gathering ICE candidates.")),
      ICE_TIMEOUT_MS,
    );

    peer.addEventListener("icegatheringstatechange", onChange);
    signal.addEventListener("abort", onAbort, { once: true });
    onChange();
    if (signal.aborted) onAbort();
  });
}

/** Input: `new LiveVoice(audioElement, handlers)`. Output: a browser voice controller. */
export class LiveVoice {
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private microphone: MediaStream | null = null;
  private abort: AbortController | null = null;
  private state: "idle" | "connecting" | "ready" | "closing" = "idle";
  private expectedSessionId: string | null = null;
  private startWaiter: {
    resolve: (id: string) => void;
    reject: (error: Error) => void;
  } | null = null;
  private closeWaiter: ((result: "closed" | "unconfirmed") => void) | null =
    null;
  private closePromise: Promise<"closed" | "unconfirmed"> | null = null;
  private closeTimeout: ReturnType<typeof setTimeout> | null = null;
  private knownDelegations = new Set<string>();

  constructor(
    private readonly audio: HTMLAudioElement,
    private readonly handlers: LiveVoiceHandlers = {},
  ) {}

  /** Input: a user clicks Start and grants microphone access. Output: `"live_123"` after `session.started`. */
  async start(): Promise<string> {
    if (this.state !== "idle")
      throw new Error("A voice connection is already active.");
    this.state = "connecting";
    this.handlers.onStatus?.("connecting");

    let peer: RTCPeerConnection;
    try {
      peer = new RTCPeerConnection();
    } catch (error) {
      this.state = "idle";
      this.handlers.onStatus?.("disconnected");
      throw error;
    }
    const abort = new AbortController();
    this.peer = peer;
    this.abort = abort;

    peer.addEventListener("track", ({ track }) => {
      this.audio.srcObject = new MediaStream([track]);
      void this.audio
        .play()
        .catch(() =>
          this.handlers.onError?.(
            "Select Play on the audio control to hear the assistant.",
          ),
        );
    });
    peer.addEventListener("connectionstatechange", () => {
      if (this.peer !== peer) return;
      if (peer.connectionState === "failed") {
        this.cleanup("disconnected");
        return;
      }
      if (peer.connectionState === "disconnected" && this.state === "ready") {
        this.handlers.onStatus?.("reconnecting");
        return;
      }
      if (peer.connectionState === "connected" && this.state === "ready") {
        this.handlers.onStatus?.("ready");
      }
    });

    try {
      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (this.peer !== peer || this.state !== "connecting") {
        for (const track of microphone.getTracks()) track.stop();
        throw new Error("Voice connection was stopped.");
      }
      this.microphone = microphone;
      for (const track of microphone.getAudioTracks())
        peer.addTrack(track, microphone);

      const channel = peer.createDataChannel(EVENT_CHANNEL);
      this.channel = channel;
      channel.addEventListener("message", (message) =>
        this.handleEvent(message.data),
      );
      channel.addEventListener("close", () => {
        if (this.channel === channel) this.cleanup("disconnected");
      });

      const offer = await peer.createOffer();
      this.assertConnecting(peer);
      await peer.setLocalDescription(offer);
      await waitForIce(peer, abort.signal);
      this.assertConnecting(peer);

      const sdp = peer.localDescription?.sdp;
      if (!sdp) throw new Error("The browser did not create an SDP offer.");
      const response = await fetch(SESSION_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp }),
        signal: abort.signal,
      });
      if (!response.ok)
        throw new Error(
          `Live session creation failed (HTTP ${response.status}).`,
        );
      const answer = (await response.json()) as SessionAnswer | null;
      if (
        !answer ||
        typeof answer.session?.id !== "string" ||
        answer.transport?.type !== "webrtc" ||
        typeof answer.transport.sdp !== "string" ||
        !answer.transport.sdp
      ) {
        throw new Error("The Live session response was incomplete.");
      }
      this.assertConnecting(peer);
      this.expectedSessionId = answer.session.id;
      await peer.setRemoteDescription({
        type: "answer",
        sdp: answer.transport.sdp,
      });
      return await this.waitForStart(abort.signal);
    } catch (error) {
      if (this.peer === peer) this.cleanup("disconnected");
      throw error;
    }
  }

  /** Input: the visitor clicks End during a ready session. Output: `"closed"` on final acknowledgment or `"unconfirmed"`. */
  async stop(): Promise<"closed" | "unconfirmed"> {
    if (this.state === "idle") return "closed";
    if (this.state === "connecting") {
      this.cleanup("disconnected");
      return "unconfirmed";
    }
    if (this.closePromise) return this.closePromise;

    const channel = this.channel;
    if (channel?.readyState !== "open") {
      this.cleanup("disconnected");
      return "unconfirmed";
    }
    this.releaseMicrophone();
    this.state = "closing";
    this.handlers.onStatus?.("closing");
    const closing = new Promise<"closed" | "unconfirmed">((resolve) => {
      this.closeWaiter = resolve;
      this.closeTimeout = setTimeout(
        () => this.cleanup("disconnected"),
        CLOSE_TIMEOUT_MS,
      );
    });
    this.closePromise = closing;
    try {
      channel.send(JSON.stringify({ type: "session.close" }));
    } catch {
      this.cleanup("disconnected");
    }
    return closing;
  }

  /** Input: `sendCommentary("item_123", "The request was recorded.")`. Output: spoken-result appends. */
  sendCommentary(delegationId: string, content: string): void {
    if (this.state !== "ready" || this.channel?.readyState !== "open") {
      throw new Error("The voice session is not ready.");
    }
    if (!this.knownDelegations.has(delegationId)) {
      throw new Error("The delegation ID is not active in this session.");
    }
    const text = content.trim();
    if (!text) throw new Error("A spoken result is required.");

    for (const chunk of splitForAppend(text)) {
      this.channel.send(
        JSON.stringify({
          type: "session.commentary.append",
          event_id: crypto.randomUUID(),
          delegation_id: delegationId,
          content: chunk,
        }),
      );
    }
  }

  /**
   * Steers the live model for the rest of the session without speaking the text
   * itself, for example the department persona during a simulated transfer.
   * Input: `"Act as the Transportation desk for the next reply."`.
   */
  sendInstruction(content: string): void {
    if (this.state !== "ready" || this.channel?.readyState !== "open") {
      throw new Error("The voice session is not ready.");
    }
    const text = content.trim();
    if (!text) throw new Error("An instruction is required.");
    this.channel.send(
      JSON.stringify({
        type: "session.instructions.append",
        event_id: crypto.randomUUID(),
        delegation_id: null,
        content: text,
      }),
    );
  }

  /** Input: the peer created by `start()`. Output: no error while connecting, otherwise a stopped error. */
  private assertConnecting(peer: RTCPeerConnection): void {
    if (this.peer !== peer || this.state !== "connecting") {
      throw new Error("Voice connection was stopped.");
    }
  }

  /** Input: a pending start and `session.started`. Output: the matching ID, for example `"live_123"`. */
  private waitForStart(signal: AbortSignal): Promise<string> {
    if (this.state === "ready" && this.expectedSessionId) {
      return Promise.resolve(this.expectedSessionId);
    }
    if (signal.aborted)
      return Promise.reject(new Error("Voice connection was stopped."));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => this.cleanup("disconnected"),
        START_TIMEOUT_MS,
      );
      this.startWaiter = {
        resolve: (id) => {
          clearTimeout(timeout);
          resolve(id);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      };
    });
  }

  /** Input: a `session.input_transcript.delta` JSON message. Output: one caller transcript callback. */
  private handleEvent(data: unknown): void {
    let event: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(String(data));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return;
      event = parsed as Record<string, unknown>;
    } catch {
      return;
    }

    if (event.type === "session.started") {
      if (this.state !== "connecting") return;
      const session = event.session as { id?: unknown } | undefined;
      if (
        session?.id !== this.expectedSessionId ||
        typeof session.id !== "string"
      ) {
        this.handlers.onError?.(
          "The Live session ID did not match the server response.",
        );
        this.cleanup("disconnected");
        return;
      }
      this.state = "ready";
      this.handlers.onStatus?.("ready");
      this.startWaiter?.resolve(session.id);
      this.startWaiter = null;
      return;
    }
    if (event.type === "session.closed") {
      this.cleanup("closed");
      return;
    }
    if (event.type === "error") {
      this.handlers.onError?.("The voice service reported an error.");
      return;
    }
    if (
      (event.type === "session.input_transcript.delta" ||
        event.type === "session.output_transcript.delta") &&
      typeof event.delta === "string" &&
      typeof event.start_ms === "number" &&
      typeof event.end_ms === "number"
    ) {
      this.handlers.onTranscript?.({
        speaker:
          event.type === "session.input_transcript.delta" ? "caller" : "agent",
        delta: event.delta,
        startMs: event.start_ms,
        endMs: event.end_ms,
      });
      return;
    }
    if (event.type === "session.delegation.created") {
      const delegation = event.delegation as
        | { id?: unknown; target?: unknown }
        | undefined;
      if (
        delegation?.target === "client" &&
        typeof delegation.id === "string" &&
        typeof event.offset_ms === "number"
      ) {
        this.knownDelegations.add(delegation.id);
        this.handlers.onDelegation?.({
          id: delegation.id,
          offsetMs: event.offset_ms,
        });
      }
    }
  }

  /** Input: an active local microphone. Output: its tracks stop once, before any close acknowledgment. */
  private releaseMicrophone(): void {
    if (!this.microphone) return;
    for (const track of this.microphone.getTracks()) track.stop();
    this.microphone = null;
  }

  /** Input: `session.closed` or disconnect. Output: released media and a `closed` or `disconnected` status. */
  private cleanup(status: "closed" | "disconnected"): void {
    if (this.state === "idle") return;
    this.state = "idle";
    this.abort?.abort();
    this.releaseMicrophone();
    this.channel?.close();
    this.peer?.close();
    this.audio.srcObject = null;
    if (this.closeTimeout) clearTimeout(this.closeTimeout);
    this.startWaiter?.reject(
      new Error("The voice session ended before it was ready."),
    );
    this.closeWaiter?.(status === "closed" ? "closed" : "unconfirmed");
    this.peer = null;
    this.channel = null;
    this.microphone = null;
    this.abort = null;
    this.expectedSessionId = null;
    this.startWaiter = null;
    this.closeWaiter = null;
    this.closePromise = null;
    this.closeTimeout = null;
    this.knownDelegations.clear();
    this.handlers.onStatus?.(status);
  }
}

/**
 * Keeps each append inside the guide's 500-token limit by splitting on sentence
 * boundaries (hard-splitting a very long sentence). Repeated appends continue
 * the same client delegation.
 * Input: a 3000-character answer. Output: chunks of at most 1200 characters.
 */
function splitForAppend(content: string): string[] {
  const MAX_APPEND_CHARS = 1200;
  if (content.length <= MAX_APPEND_CHARS) return [content];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of content.split(/(?<=[.!?])s+/)) {
    if (sentence.length > MAX_APPEND_CHARS) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let index = 0; index < sentence.length; index += MAX_APPEND_CHARS) {
        chunks.push(sentence.slice(index, index + MAX_APPEND_CHARS));
      }
      continue;
    }
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > MAX_APPEND_CHARS) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
