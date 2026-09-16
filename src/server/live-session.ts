import type { FastifyInstance } from "fastify";

const OPENAI_LIVE_SESSIONS_URL = "https://api.openai.com/v1/live/sessions";
const LIVE_MODEL = "gpt-live-1";
const MAX_SDP_LENGTH = 65_536;
const SESSION_TIMEOUT_MS = 20_000;
const MAX_LOCAL_SESSIONS = 5;
const LOCAL_ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

const LIVE_INSTRUCTIONS = [
  "You are the voice interface for an independent Boulder municipal-service demo.",
  "Be concise. Delegate factual questions and service requests to the application backend.",
  "Never claim a ticket was created or a department was reached until the backend confirms it.",
  "For unsupported requests, explain the demo's limited coverage without guessing.",
].join(" ");

type LiveSession = {
  session: { id: string };
  transport: { type: "webrtc"; sdp: string };
};

type LiveSessionResult =
  | { status: "created"; session: LiveSession }
  | { status: "unavailable"; reason: string };

/**
 * Exchanges a browser SDP offer for a GPT-Live WebRTC answer using a server-held key.
 * Input: a bounded `v=0` SDP offer. Output: session ID/answer or a safe failure code.
 */
export async function createLiveSession(
  sdp: string,
  apiKey: string | undefined,
  request: typeof fetch = fetch,
): Promise<LiveSessionResult> {
  if (!apiKey)
    return { status: "unavailable", reason: "openai_not_configured" };
  try {
    const response = await request(OPENAI_LIVE_SESSIONS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        session: {
          model: LIVE_MODEL,
          instructions: LIVE_INSTRUCTIONS,
          delegation: { type: "client" },
        },
        transport: { type: "webrtc", sdp },
      }),
      signal: AbortSignal.timeout(SESSION_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        status: "unavailable",
        reason:
          response.status === 401 || response.status === 403
            ? "openai_auth_rejected"
            : "openai_session_failed",
      };
    }
    const body: unknown = await response.json();
    if (!isLiveSession(body)) {
      return { status: "unavailable", reason: "openai_answer_invalid" };
    }
    return { status: "created", session: body };
  } catch {
    return { status: "unavailable", reason: "openai_session_unreachable" };
  }
}

/**
 * Registers the local-only WebRTC session exchange; the browser never sees the API key.
 * Input: POST `/api/local/live-session` with `{sdp:"v=0..."}` from the local UI.
 * Output: the OpenAI session ID and SDP answer, or a bounded error.
 */
export function registerLocalLiveSession(
  app: FastifyInstance,
  apiKey: string | undefined,
  request: typeof fetch = fetch,
): void {
  let sessionsCreated = 0;
  app.post<{ Body: { sdp: string } }>(
    "/api/local/live-session",
    {
      schema: {
        body: {
          type: "object",
          required: ["sdp"],
          properties: {
            sdp: {
              type: "string",
              minLength: 1,
              maxLength: MAX_SDP_LENGTH,
              pattern: "^v=0",
            },
          },
          additionalProperties: false,
        },
      },
    },
    async (incoming, reply) => {
      if (!isLocalVoiceOrigin(incoming.headers.origin)) {
        return reply
          .code(403)
          .send({ status: "blocked", reason: "origin_denied" });
      }
      if (sessionsCreated >= MAX_LOCAL_SESSIONS) {
        return reply
          .code(429)
          .send({ status: "blocked", reason: "session_limit" });
      }
      sessionsCreated += 1;
      const result = await createLiveSession(
        incoming.body.sdp,
        apiKey,
        request,
      );
      return result.status === "created"
        ? reply.code(201).send(result.session)
        : reply.code(503).send(result);
    },
  );
}

/** Input: an HTTP Origin from the local Vite page. Output: whether this loopback-only demo accepts it. */
export function isLocalVoiceOrigin(origin: string | undefined): boolean {
  return LOCAL_ORIGINS.has(origin ?? "");
}

/** Input: untrusted OpenAI JSON. Output: whether ID and WebRTC answer are usable. */
function isLiveSession(value: unknown): value is LiveSession {
  if (!value || typeof value !== "object") return false;
  const { session, transport } = value as Record<string, unknown>;
  if (!session || typeof session !== "object") return false;
  if (!transport || typeof transport !== "object") return false;
  const id = (session as Record<string, unknown>).id;
  const type = (transport as Record<string, unknown>).type;
  const sdp = (transport as Record<string, unknown>).sdp;
  return (
    typeof id === "string" &&
    id.length > 0 &&
    type === "webrtc" &&
    typeof sdp === "string" &&
    sdp.startsWith("v=0")
  );
}
