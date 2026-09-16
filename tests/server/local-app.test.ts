import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
    app = buildLocalApp(store, opened.context);
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
