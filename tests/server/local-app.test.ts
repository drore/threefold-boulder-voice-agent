import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PostgresCityPolicyStore } from "../../src/adapters/postgres/city-policy-store.js";
import { PostgresDraftStore } from "../../src/adapters/postgres/draft-store.js";
import type { ReportContext } from "../../src/core/prepare-service-report.js";
import { buildLocalApp } from "../../src/server/local-app.js";

const localDatabaseUrl = process.env.LOCAL_DATABASE_URL;
if (localDatabaseUrl) {
  const host = new URL(localDatabaseUrl).hostname;
  if (!new Set(["127.0.0.1", "localhost", "[::1]"]).has(host)) {
    throw new Error("Local API integration test requires a loopback database");
  }
}

describe.skipIf(!localDatabaseUrl)("local report API", () => {
  let pool: Pool;
  let app: ReturnType<typeof buildLocalApp>;
  let context: ReportContext;
  let store: PostgresDraftStore;

  beforeAll(async () => {
    pool = new Pool({ connectionString: localDatabaseUrl });
    store = new PostgresDraftStore(pool);
    const opened = await store.openConversation("boulder-co");
    if (opened.status !== "created") throw new Error("Local DB unavailable");
    context = opened.context;
    app = buildLocalApp(
      store,
      opened.context,
      new PostgresCityPolicyStore(pool),
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

  it("moves observed text through the tool into one persisted report draft", async () => {
    const empty = await app.inject({ method: "GET", url: "/api/local/report" });
    expect(empty.json()).toEqual({ status: "empty" });

    const first = await app.inject({
      method: "POST",
      url: "/api/local/report",
      payload: { description: "Large pothole in driving lane" },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      status: "needs_input",
      revision: 1,
      fields: ["location"],
    });

    const second = await app.inject({
      method: "POST",
      url: "/api/local/report",
      payload: { location: "15th and Pine" },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      status: "needs_confirmation",
      draftId: first.json().draftId,
      revision: 2,
      summary: {
        requestType: "pothole",
        location: "15th and Pine",
        description: "Large pothole in driving lane",
      },
    });
    expect(
      await new PostgresDraftStore(pool).load(context, first.json().draftId),
    ).toMatchObject({ status: "found", draft: { revision: 2 } });

    const reloaded = await app.inject({
      method: "GET",
      url: "/api/local/report",
    });
    expect(reloaded.json()).toMatchObject({
      status: "needs_confirmation",
      draftId: first.json().draftId,
      revision: 2,
      summary: {
        location: "15th and Pine",
        description: "Large pothole in driving lane",
      },
    });

    for (const payload of [
      { location: "15th and Pearl", confirmed: true },
      { location: 42 },
      { description: true },
      { description: null },
    ]) {
      const invalid = await app.inject({
        method: "POST",
        url: "/api/local/report",
        payload,
      });
      expect(invalid.statusCode).toBe(400);
    }
    expect(await store.load(context, first.json().draftId)).toMatchObject({
      status: "found",
      draft: { revision: 2 },
    });
    const observationCount = await pool.query<{ count: string }>(
      "select count(*) from app.observations where conversation_id = $1",
      [context.conversationId],
    );
    expect(observationCount.rows[0]?.count).toBe("2");
  });
});

describe.skipIf(!localDatabaseUrl)("local report confirmation", () => {
  let pool: Pool;
  const sessions: Array<{
    app: Awaited<ReturnType<typeof buildLocalApp>>;
    context: ReportContext;
  }> = [];

  beforeAll(() => {
    pool = new Pool({ connectionString: localDatabaseUrl });
  });

  afterEach(async () => {
    for (const session of sessions.splice(0)) {
      await session.app.close();
      await pool.query(
        "delete from app.request_drafts where conversation_id = $1",
        [session.context.conversationId],
      );
      await pool.query(
        "delete from app.observations where conversation_id = $1",
        [session.context.conversationId],
      );
      await pool.query("delete from app.conversations where id = $1", [
        session.context.conversationId,
      ]);
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  /** Input: Boulder and `2026-09-16T16:00:00Z`. Output: an isolated local API with a fixed clock. */
  async function openSession(cityId: string, time: string) {
    const store = new PostgresDraftStore(pool);
    const opened = await store.openConversation(cityId);
    if (opened.status !== "created") throw new Error("Local DB unavailable");
    const app = buildLocalApp(
      store,
      opened.context,
      new PostgresCityPolicyStore(pool),
      () => new Date(time),
    );
    await app.ready();
    sessions.push({ app, context: opened.context });
    return app;
  }

  /** Input: pothole details. Output: a saved revision bound to the local conversation. */
  async function saveReport(app: Awaited<ReturnType<typeof buildLocalApp>>) {
    const response = await app.inject({
      method: "POST",
      url: "/api/local/report",
      payload: {
        location: "15th and Pine",
        description: "Large pothole in driving lane",
      },
    });
    expect(response.statusCode).toBe(200);
    const saved = response.json();
    return {
      draftId: saved.draftId as string,
      revision: saved.revision as number,
    };
  }

  it("uses the DB destination to simulate open-hours routing only after current confirmation", async () => {
    const app = await openSession("boulder-co", "2026-09-16T16:00:00Z");
    const noDraft = await app.inject({
      method: "POST",
      url: "/api/local/report/confirm",
      payload: { draftId: "not-saved", revision: 1 },
    });
    expect(noDraft.json()).toEqual({
      status: "blocked",
      code: "missing_draft",
    });

    const draft = await saveReport(app);
    const wrongDraft = await app.inject({
      method: "POST",
      url: "/api/local/report/confirm",
      payload: { draftId: "another-draft", revision: draft.revision },
    });
    expect(wrongDraft.statusCode).toBe(409);

    for (const extra of [
      { currentTime: "2026-09-17T00:00:00Z" },
      { mockDestination: "+13035550199" },
    ]) {
      const rejected = await app.inject({
        method: "POST",
        url: "/api/local/report/confirm",
        payload: { ...draft, ...extra },
      });
      expect(rejected.statusCode).toBe(400);
    }

    const confirmed = await app.inject({
      method: "POST",
      url: "/api/local/report/confirm",
      payload: draft,
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toEqual({
      status: "simulated_route",
      draftId: draft.draftId,
      revision: draft.revision,
      policyRevision: 1,
      department: {
        name: "Transportation & Mobility Department",
        mockDestination: "+13035550101",
      },
    });

    const repeated = await app.inject({
      method: "POST",
      url: "/api/local/report/confirm",
      payload: draft,
    });
    expect(repeated.json()).toEqual(confirmed.json());
  });

  it("shows the unavailable ticket path after closing without claiming a ticket", async () => {
    const app = await openSession("boulder-co", "2026-09-17T00:00:00Z");
    const draft = await saveReport(app);
    const confirmed = await app.inject({
      method: "POST",
      url: "/api/local/report/confirm",
      payload: draft,
    });

    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toEqual({
      status: "ticket_path_unavailable",
      reason: "outside_business_hours",
    });
  });

  it("rejects an old revision after a correction and reloads the latest draft", async () => {
    const app = await openSession("boulder-co", "2026-09-16T16:00:00Z");
    const oldDraft = await saveReport(app);
    const correction = await app.inject({
      method: "POST",
      url: "/api/local/report",
      payload: { location: "16th and Pine" },
    });
    expect(correction.json().revision).toBe(oldDraft.revision + 1);

    const stale = await app.inject({
      method: "POST",
      url: "/api/local/report/confirm",
      payload: oldDraft,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({
      status: "blocked",
      code: "revision_conflict",
    });

    const current = await app.inject({
      method: "POST",
      url: "/api/local/report/confirm",
      payload: {
        draftId: oldDraft.draftId,
        revision: correction.json().revision,
      },
    });
    expect(current.json().status).toBe("simulated_route");

    await pool.query(
      "update app.request_drafts set revision = revision + 1 where id = $1",
      [oldDraft.draftId],
    );
    const changedInStore = await app.inject({
      method: "POST",
      url: "/api/local/report/confirm",
      payload: {
        draftId: oldDraft.draftId,
        revision: correction.json().revision,
      },
    });
    expect(changedInStore.statusCode).toBe(409);
  });

  it("blocks a partial draft and a city with no DB policy", async () => {
    const app = await openSession("boulder-co", "2026-09-16T16:00:00Z");
    const partial = await app.inject({
      method: "POST",
      url: "/api/local/report",
      payload: { description: "Large pothole" },
    });
    const incomplete = await app.inject({
      method: "POST",
      url: "/api/local/report/confirm",
      payload: {
        draftId: partial.json().draftId,
        revision: partial.json().revision,
      },
    });
    expect(incomplete.statusCode).toBe(400);
    expect(incomplete.json()).toEqual({
      status: "blocked",
      code: "incomplete_draft",
    });

    const missingCityApp = await openSession(
      "boulder-no-policy",
      "2026-09-16T16:00:00Z",
    );
    const draft = await saveReport(missingCityApp);
    const missing = await missingCityApp.inject({
      method: "POST",
      url: "/api/local/report/confirm",
      payload: draft,
    });
    expect(missing.statusCode).toBe(503);
    expect(missing.json()).toEqual({
      status: "blocked",
      code: "policy_unavailable",
    });
  });
});
