import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresCityPolicyStore } from "../../src/adapters/postgres/city-policy-store.js";
import { PostgresDraftStore } from "../../src/adapters/postgres/draft-store.js";
import type { ReportContext } from "../../src/core/service-report/prepare-service-report.js";
import { buildLocalApp } from "../../src/server/build-app.js";

const databaseUrl = process.env.LOCAL_DATABASE_URL;
const LOCAL_ORIGIN = "http://127.0.0.1:5173";

if (
  databaseUrl &&
  !new Set(["127.0.0.1", "localhost", "[::1]"]).has(
    new URL(databaseUrl).hostname,
  )
) {
  throw new Error("Voice integration tests require a loopback database");
}

/** Input: response output items. Output: the Responses envelope the app consumes. */
function modelOutput(output: unknown[]): Response {
  return new Response(JSON.stringify({ status: "completed", output }), {
    status: 200,
  });
}

/** Input: a tool call the model should make. Output: a function-call response. */
function toolCall(
  name: string,
  args: Record<string, unknown>,
  callId: string,
): Response {
  return modelOutput([
    {
      type: "function_call",
      name,
      arguments: JSON.stringify(args),
      call_id: callId,
    },
  ]);
}

/** Input: the model's final spoken reply. Output: a message response. */
function message(text: string): Response {
  return modelOutput([
    { type: "message", content: [{ type: "output_text", text }] },
  ]);
}

describe.skipIf(!databaseUrl)("local voice delegation", () => {
  let pool: Pool;
  let context: ReportContext;
  let app: ReturnType<typeof buildLocalApp>;
  const modelInputs: unknown[] = [];
  const responses: Response[] = [
    toolCall("lookupMunicipalCode", { query: "BRC 8-3-9 glass" }, "call-1"),
    message("Glass bottles are banned in city parks, with an exception."),
    toolCall(
      "prepareServiceReport",
      {
        requestType: "pothole",
        location: "Invented location",
        description: "Deep pothole",
      },
      "call-2",
    ),
    message("I saved that. What's the location?"),
    toolCall(
      "prepareServiceReport",
      { requestType: "pothole", location: "15th and Pine" },
      "call-3",
    ),
    message(
      "I've got Deep pothole at 15th and Pine. Please confirm on screen.",
    ),
    message("I can help with glass containers, potholes, events, and reports."),
  ];

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    const store = new PostgresDraftStore(pool);
    const opened = await store.openConversation("boulder-co");
    if (opened.status !== "created")
      throw new Error("Local database unavailable");
    context = opened.context;
    const request: typeof fetch = async (_input, init) => {
      modelInputs.push(JSON.parse(String(init?.body)));
      const response = responses.shift();
      if (!response) throw new Error("Unexpected model request");
      return response;
    };
    app = buildLocalApp(
      store,
      context,
      new PostgresCityPolicyStore(pool),
      () => new Date("2026-09-16T16:00:00Z"),
      undefined,
      { apiKey: "synthetic-key", request },
    );
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    if (context) {
      await pool.query(
        "delete from app.request_drafts where conversation_id = $1",
        [context.conversationId],
      );
      await pool.query(
        "delete from app.observations where conversation_id = $1",
        [context.conversationId],
      );
      await pool.query("delete from app.conversations where id = $1", [
        context.conversationId,
      ]);
    }
    await pool?.end();
  });

  it("rejects foreign origins before recording or calling the model", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/local/delegation",
      headers: { origin: "https://elsewhere.example" },
      payload: { utterance: "What is BRC 8-3-9?" },
    });
    expect(response.statusCode).toBe(403);
    expect(modelInputs).toHaveLength(0);
  });

  it("answers reviewed code and persists an information-only caller turn", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/local/delegation",
      headers: { origin: LOCAL_ORIGIN },
      payload: { utterance: "What does BRC 8-3-9 say about glass in parks?" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "completed",
      speech: expect.stringContaining("Glass bottles"),
      result: { status: "answered", coverage: "reviewed_example" },
    });
    const observations = await pool.query(
      "select id from app.observations where conversation_id = $1",
      [context.conversationId],
    );
    expect(observations.rowCount).toBe(1);
    const drafts = await pool.query(
      "select id from app.request_drafts where conversation_id = $1",
      [context.conversationId],
    );
    expect(drafts.rowCount).toBe(0);
  });

  it("accepts only observed report fields and routes after explicit confirmation", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/api/local/delegation",
      headers: { origin: LOCAL_ORIGIN },
      payload: { utterance: "There is a Deep pothole" },
    });
    expect(first.json()).toMatchObject({
      status: "completed",
      result: { status: "needs_input", fields: ["location"] },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/local/delegation",
      headers: { origin: LOCAL_ORIGIN },
      payload: { utterance: "It is at 15th and Pine" },
    });
    expect(second.json()).toMatchObject({
      status: "completed",
      result: {
        status: "needs_confirmation",
        summary: { location: "15th and Pine", description: "Deep pothole" },
      },
    });
    const modelInput = modelInputs[4] as { input: Array<{ content: string }> };
    expect(JSON.parse(modelInput.input[1]?.content ?? "{}")).toMatchObject({
      activeDraft: { requestType: "pothole", missingFields: ["location"] },
    });

    const { draftId, revision } = second.json().result;
    const confirmation = await app.inject({
      method: "POST",
      url: "/api/local/report/confirm",
      payload: { draftId, revision },
    });
    expect(confirmation.json()).toMatchObject({
      status: "simulated_route",
      department: { name: "Transportation & Mobility Department" },
    });
  });

  it("answers a conversational capability question without touching the draft", async () => {
    const draftsBefore = await pool.query(
      "select id from app.request_drafts where conversation_id = $1",
      [context.conversationId],
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/local/delegation",
      headers: { origin: LOCAL_ORIGIN },
      payload: { utterance: "What can you do for me?" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "completed",
      speech: expect.stringContaining("I can help"),
    });
    expect(response.json().result).toBeUndefined();
    const observations = await pool.query(
      "select id from app.observations where conversation_id = $1",
      [context.conversationId],
    );
    expect(observations.rowCount).toBe(4);
    const draftsAfter = await pool.query(
      "select id from app.request_drafts where conversation_id = $1",
      [context.conversationId],
    );
    expect(draftsAfter.rowCount).toBe(draftsBefore.rowCount);
  });

  it("does not revive a voice report after a new report starts", async () => {
    let notifyModelStarted!: () => void;
    let releaseModel!: (response: Response) => void;
    const modelStarted = new Promise<void>((resolve) => {
      notifyModelStarted = resolve;
    });
    const modelReply = new Promise<Response>((resolve) => {
      releaseModel = resolve;
    });
    let calls = 0;
    const delayedRequest: typeof fetch = async () => {
      calls += 1;
      if (calls === 1) {
        notifyModelStarted();
        return modelReply;
      }
      return message("Done.");
    };
    const delayedApp = buildLocalApp(
      new PostgresDraftStore(pool),
      context,
      new PostgresCityPolicyStore(pool),
      () => new Date("2026-09-16T16:00:00Z"),
      undefined,
      { apiKey: "synthetic-key", request: delayedRequest },
    );
    await delayedApp.ready();
    try {
      const pending = delayedApp.inject({
        method: "POST",
        url: "/api/local/delegation",
        headers: { origin: LOCAL_ORIGIN },
        payload: { utterance: "There is a deep pothole at 15th and Pine" },
      });
      await modelStarted;
      const reset = await delayedApp.inject({
        method: "POST",
        url: "/api/local/report/new",
      });
      expect(reset.statusCode).toBe(200);
      releaseModel(
        toolCall(
          "prepareServiceReport",
          {
            requestType: "pothole",
            location: "15th and Pine",
            description: "deep pothole",
          },
          "call-late",
        ),
      );
      expect((await pending).json()).toMatchObject({
        status: "unavailable",
        speech: "A new report was started. Please repeat your request.",
      });
      expect(
        (
          await delayedApp.inject({ method: "GET", url: "/api/local/report" })
        ).json(),
      ).toEqual({ status: "empty" });
    } finally {
      await delayedApp.close();
    }
  });

  it("waits for an in-flight voice draft write before clearing the active report", async () => {
    let notifySaveStarted!: () => void;
    let releaseSave!: () => void;
    const saveStarted = new Promise<void>((resolve) => {
      notifySaveStarted = resolve;
    });
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    class DelayedDraftStore extends PostgresDraftStore {
      /** Input: a voice report write. Output: the normal saved draft after the test releases the gate. */
      override async save(...args: Parameters<PostgresDraftStore["save"]>) {
        notifySaveStarted();
        await saveGate;
        return super.save(...args);
      }
    }
    let calls = 0;
    const request: typeof fetch = async () => {
      calls += 1;
      return calls === 1
        ? toolCall(
            "prepareServiceReport",
            {
              requestType: "pothole",
              location: "15th and Pine",
              description: "deep pothole",
            },
            "call-4",
          )
        : message("I've got that. Please confirm on screen.");
    };
    const delayedApp = buildLocalApp(
      new DelayedDraftStore(pool),
      context,
      new PostgresCityPolicyStore(pool),
      () => new Date("2026-09-16T16:00:00Z"),
      undefined,
      { apiKey: "synthetic-key", request },
    );
    await delayedApp.ready();
    try {
      const pendingReport = delayedApp.inject({
        method: "POST",
        url: "/api/local/delegation",
        headers: { origin: LOCAL_ORIGIN },
        payload: { utterance: "There is a deep pothole at 15th and Pine" },
      });
      await saveStarted;
      let resetFinished = false;
      const pendingReset = delayedApp
        .inject({ method: "POST", url: "/api/local/report/new" })
        .then((response) => {
          resetFinished = true;
          return response;
        });
      await new Promise((resolve) => setImmediate(resolve));
      expect(resetFinished).toBe(false);
      releaseSave();
      await Promise.all([pendingReport, pendingReset]);
      expect(
        (
          await delayedApp.inject({ method: "GET", url: "/api/local/report" })
        ).json(),
      ).toEqual({ status: "empty" });
    } finally {
      releaseSave();
      await delayedApp.close();
    }
  });
});
