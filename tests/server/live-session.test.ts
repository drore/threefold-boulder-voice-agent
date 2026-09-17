import fastify from "fastify";
import { describe, expect, it } from "vitest";
import {
  createLiveSession,
  registerLocalLiveSession,
} from "../../src/server/voice/live-session.js";

const SDP_OFFER = "v=0\r\no=browser 1 1 IN IP4 127.0.0.1";
const SDP_ANSWER = "v=0\r\no=openai 1 1 IN IP4 127.0.0.1";

describe("GPT-Live session exchange", () => {
  it("sends the fixed client-delegation config with a server-held key", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const request: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          session: { id: "live-test-1" },
          transport: { type: "webrtc", sdp: SDP_ANSWER },
        }),
        { status: 201 },
      );
    };

    expect(
      await createLiveSession(SDP_OFFER, "synthetic-key", "Testville", request),
    ).toEqual({
      status: "created",
      session: {
        session: { id: "live-test-1" },
        transport: { type: "webrtc", sdp: SDP_ANSWER },
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://api.openai.com/v1/live/sessions");
    expect(requests[0]?.init?.headers).toMatchObject({
      authorization: "Bearer synthetic-key",
    });
    expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({
      session: { model: "gpt-live-1", delegation: { type: "client" } },
      transport: { type: "webrtc", sdp: SDP_OFFER },
    });
  });

  it("rejects malformed provider answers and keeps auth errors generic", async () => {
    const malformed: typeof fetch = async () =>
      new Response(JSON.stringify({ session: { id: "live-test-1" } }), {
        status: 201,
      });
    expect(
      await createLiveSession(
        SDP_OFFER,
        "synthetic-key",
        "Testville",
        malformed,
      ),
    ).toEqual({ status: "unavailable", reason: "openai_answer_invalid" });

    const denied: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: "secret detail" } }), {
        status: 401,
      });
    expect(
      await createLiveSession(SDP_OFFER, "synthetic-key", "Testville", denied),
    ).toEqual({ status: "unavailable", reason: "openai_auth_rejected" });
  });

  it("blocks nonlocal origins and malformed SDP before contacting OpenAI", async () => {
    let calls = 0;
    const request: typeof fetch = async () => {
      calls += 1;
      return new Response("{}", { status: 201 });
    };
    const app = fastify({
      ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
    });
    registerLocalLiveSession(app, "synthetic-key", "Testville", request);
    try {
      const foreign = await app.inject({
        method: "POST",
        url: "/api/local/live-session",
        headers: { origin: "https://untrusted.example" },
        payload: { sdp: SDP_OFFER },
      });
      expect(foreign.statusCode).toBe(403);
      const invalid = await app.inject({
        method: "POST",
        url: "/api/local/live-session",
        headers: { origin: "http://127.0.0.1:5173" },
        payload: { sdp: "not an offer" },
      });
      expect(invalid.statusCode).toBe(400);
      expect(calls).toBe(0);
    } finally {
      await app.close();
    }
  });

  it("caps paid session creation attempts in one local developer run", async () => {
    let calls = 0;
    const request: typeof fetch = async () => {
      calls += 1;
      return new Response(
        JSON.stringify({
          session: { id: `live-test-${calls}` },
          transport: { type: "webrtc", sdp: SDP_ANSWER },
        }),
        { status: 201 },
      );
    };
    const app = fastify();
    registerLocalLiveSession(app, "synthetic-key", "Testville", request);
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await app.inject({
          method: "POST",
          url: "/api/local/live-session",
          headers: { origin: "http://127.0.0.1:5173" },
          payload: { sdp: SDP_OFFER },
        });
        expect(response.statusCode).toBe(201);
      }
      const limited = await app.inject({
        method: "POST",
        url: "/api/local/live-session",
        headers: { origin: "http://127.0.0.1:5173" },
        payload: { sdp: SDP_OFFER },
      });
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toEqual({
        status: "blocked",
        reason: "session_limit",
      });
      expect(calls).toBe(5);
    } finally {
      await app.close();
    }
  });
});
