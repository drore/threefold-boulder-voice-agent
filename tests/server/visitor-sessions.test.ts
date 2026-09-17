import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { PostgresDraftStore } from "../../src/adapters/postgres/draft-store.js";
import type {
  ReportContext,
  ReportDraft,
  ServiceReportData,
} from "../../src/core/service-report/prepare-service-report.js";
import type { CityPolicyStore } from "../../src/core/service-report/confirm-service-report.js";
import { buildLocalApp } from "../../src/server/build-app.js";
import { registerLocalLiveSession } from "../../src/server/voice/live-session.js";
import type { VisitorAccess } from "../../src/server/visitor-sessions.js";

const ORIGIN = "https://boulder-demo.example";
const CODE = "reviewer-secret-with-24-characters";

/** Input: one or more admitted visitors. Output: a small in-memory draft store that enforces conversation scope. */
function makeStore() {
  const drafts = new Map<string, ReportDraft>();
  const observations: string[] = [];
  const store = {
    async recordObservation(context: ReportContext) {
      observations.push(context.conversationId);
      return { status: "recorded" as const, observationId: randomUUID() };
    },
    async load(context: ReportContext, draftId: string | null) {
      if (!draftId) return { status: "empty" as const };
      const draft = drafts.get(draftId);
      return draft?.conversationId === context.conversationId
        ? { status: "found" as const, draft }
        : { status: "denied" as const };
    },
    async save(
      context: ReportContext,
      draftId: string | null,
      expectedRevision: number | null,
      fields: ServiceReportData,
    ) {
      const current = draftId ? drafts.get(draftId) : undefined;
      if (current && current.conversationId !== context.conversationId) {
        return { status: "denied" as const };
      }
      if ((current?.revision ?? null) !== expectedRevision) {
        return { status: "conflict" as const };
      }
      const draft: ReportDraft = {
        ...fields,
        draftId: draftId ?? randomUUID(),
        conversationId: context.conversationId,
        cityId: context.cityId,
        revision: (current?.revision ?? 0) + 1,
      };
      drafts.set(draft.draftId, draft);
      return { status: "saved" as const, draft };
    },
  };
  return { store: store as unknown as PostgresDraftStore, observations };
}

/** Input: a code and origin. Output: a new admitted reviewer cookie. */
async function admit(app: ReturnType<typeof buildLocalApp>): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/access",
    headers: { origin: ORIGIN },
    payload: { code: CODE },
  });
  expect(response.statusCode).toBe(201);
  const cookie = response.headers["set-cookie"];
  expect(cookie).toContain("HttpOnly; SameSite=Strict");
  expect(cookie).toContain("; Secure");
  return String(cookie).split(";")[0] ?? "";
}

describe("visitor admission and isolation", () => {
  const apps: Array<ReturnType<typeof buildLocalApp>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  /** Input: the selected access mode. Output: an API with independent server-owned conversation contexts. */
  async function makeApp(mode: VisitorAccess["mode"] = "reviewer") {
    const { store, observations } = makeStore();
    let opened = 0;
    const access: VisitorAccess = {
      mode,
      cityId: "boulder-co",
      allowedOrigins:
        mode === "reviewer" ? [ORIGIN] : ["http://127.0.0.1:5173"],
      openConversation: async (cityId) => ({
        status: "created",
        context: {
          conversationId: `conversation-${++opened}`,
          cityId,
          admissionId: randomUUID(),
        },
      }),
      ...(mode === "reviewer" ? { accessCode: CODE } : {}),
    };
    const app = buildLocalApp(
      store,
      null,
      {} as CityPolicyStore,
      {
        cityId: "test-city",
        displayName: "Testville",
        timeZone: "America/Denver",
        eventsListingUrl: "https://example.test/events",
        knowledge: { list: async () => ({ status: "unavailable" }) },
      },
      () => new Date("2026-09-16T16:00:00Z"),
      undefined,
      undefined,
      access,
    );
    apps.push(app);
    return { app, observations, opened: () => opened };
  }

  it("guards every API before opening a conversation or calling a provider", async () => {
    const { app, opened } = await makeApp();
    let providerCalls = 0;
    registerLocalLiveSession(app, "synthetic-key", "Testville", async () => {
      providerCalls += 1;
      throw new Error("Provider must not be called");
    });
    for (const [method, url, payload] of [
      ["GET", "/api/local/report", undefined],
      [
        "POST",
        "/api/local/knowledge",
        { tool: "lookupCityInformation", query: "pothole" },
      ],
      ["POST", "/api/local/delegation", { utterance: "pothole" }],
      ["POST", "/api/local/live-session", { sdp: "v=0" }],
    ] as const) {
      const response = await app.inject({
        method,
        url,
        headers: { origin: ORIGIN },
        ...(payload ? { payload } : {}),
      });
      expect(response.statusCode).toBe(401);
    }
    const forged = await app.inject({
      method: "GET",
      url: "/api/local/report",
      headers: { cookie: `__Host-boulder_session=${"0".repeat(64)}` },
    });
    expect(forged.statusCode).toBe(401);
    expect(opened()).toBe(0);
    expect(providerCalls).toBe(0);
  });

  it("guards encoded paths that Fastify resolves to application routes", async () => {
    const { app, opened } = await makeApp();
    const access = await app.inject({ method: "GET", url: "/%61pi/access" });
    const report = await app.inject({
      method: "GET",
      url: "/%61pi/local/report",
    });
    const forgedAccess = await app.inject({
      method: "POST",
      url: "/%61pi/access",
      headers: { origin: "https://foreign.example" },
      payload: { code: CODE },
    });
    expect(access.statusCode).toBe(401);
    expect(report.statusCode).toBe(401);
    expect(forgedAccess.statusCode).toBe(403);
    expect(opened()).toBe(0);
  });

  it("requires the secret and exact origin before setting a secure cookie", async () => {
    const { app, opened } = await makeApp();
    const foreign = await app.inject({
      method: "POST",
      url: "/api/access",
      headers: { origin: "https://foreign.example" },
      payload: { code: CODE },
    });
    expect(foreign.statusCode).toBe(403);
    const incorrect = await app.inject({
      method: "POST",
      url: "/api/access",
      headers: { origin: ORIGIN },
      payload: { code: "incorrect" },
    });
    expect(incorrect.statusCode).toBe(401);
    expect(opened()).toBe(0);

    const cookie = await admit(app);
    expect(opened()).toBe(1);
    const noOrigin = await app.inject({
      method: "POST",
      url: "/api/local/knowledge",
      headers: { cookie },
      payload: { tool: "lookupCityInformation", query: "pothole" },
    });
    expect(noOrigin.statusCode).toBe(403);
    const admitted = await app.inject({
      method: "GET",
      url: "/api/access",
      headers: { cookie },
    });
    expect(admitted.json()).toMatchObject({ status: "admitted" });
  });

  it("keeps draft pointers, scopes, and delegated-model quotas separate", async () => {
    const { app, observations } = await makeApp();
    const firstCookie = await admit(app);
    const secondCookie = await admit(app);
    const first = await app.inject({
      method: "POST",
      url: "/api/local/report",
      headers: { cookie: firstCookie, origin: ORIGIN },
      payload: { description: "Fictional pothole" },
    });
    expect(first.json()).toMatchObject({
      status: "needs_input",
      fields: ["location"],
    });
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/local/report",
          headers: { cookie: secondCookie },
        })
      ).json(),
    ).toEqual({ status: "empty" });
    const foreignConfirm = await app.inject({
      method: "POST",
      url: "/api/local/report/confirm",
      headers: { cookie: secondCookie, origin: ORIGIN },
      payload: { draftId: first.json().draftId, revision: 1 },
    });
    expect(foreignConfirm.json()).toMatchObject({
      status: "blocked",
      code: "missing_draft",
    });
    expect(observations).toEqual(["conversation-1"]);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/local/delegation",
        headers: { cookie: firstCookie, origin: ORIGIN },
        payload: { utterance: "What is BRC 8-3-9?" },
      });
      expect(response.statusCode).toBe(503);
    }
    const limited = await app.inject({
      method: "POST",
      url: "/api/local/delegation",
      headers: { cookie: firstCookie, origin: ORIGIN },
      payload: { utterance: "What is BRC 8-3-9?" },
    });
    expect(limited.statusCode).toBe(429);
    const second = await app.inject({
      method: "POST",
      url: "/api/local/delegation",
      headers: { cookie: secondCookie, origin: ORIGIN },
      payload: { utterance: "What is BRC 8-3-9?" },
    });
    expect(second.statusCode).toBe(503);
    expect(observations.at(-1)).toBe("conversation-2");
  });

  it("limits paid voice-session creation separately for each admitted visitor", async () => {
    const { app } = await makeApp();
    let providerCalls = 0;
    registerLocalLiveSession(app, "synthetic-key", "Testville", async () => {
      providerCalls += 1;
      return new Response(
        JSON.stringify({
          session: { id: `synthetic-${providerCalls}` },
          transport: { type: "webrtc", sdp: "v=0 answer" },
        }),
        { status: 200 },
      );
    });
    const firstCookie = await admit(app);
    const secondCookie = await admit(app);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/local/live-session",
        headers: { cookie: firstCookie, origin: ORIGIN },
        payload: { sdp: "v=0 offer" },
      });
      expect(response.statusCode).toBe(201);
    }
    const limited = await app.inject({
      method: "POST",
      url: "/api/local/live-session",
      headers: { cookie: firstCookie, origin: ORIGIN },
      payload: { sdp: "v=0 offer" },
    });
    expect(limited.statusCode).toBe(429);
    const second = await app.inject({
      method: "POST",
      url: "/api/local/live-session",
      headers: { cookie: secondCookie, origin: ORIGIN },
      payload: { sdp: "v=0 offer" },
    });
    expect(second.statusCode).toBe(201);
    expect(providerCalls).toBe(6);
  });

  it("opens separate local visitor conversations without a login", async () => {
    const { app, opened } = await makeApp("development");
    const first = await app.inject({ method: "GET", url: "/api/access" });
    const second = await app.inject({ method: "GET", url: "/api/access" });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.headers["set-cookie"]).not.toEqual(
      second.headers["set-cookie"],
    );
    expect(opened()).toBe(2);
    const revisited = await app.inject({
      method: "GET",
      url: "/api/access",
      headers: { cookie: String(first.headers["set-cookie"]).split(";")[0] },
    });
    expect(revisited.statusCode).toBe(200);
    expect(opened()).toBe(2);
  });
});
