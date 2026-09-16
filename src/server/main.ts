import pg from "pg";
import { LinearTicketProvider } from "../adapters/linear/linear-ticket-provider.js";
import { PostgresCityPolicyStore } from "../adapters/postgres/city-policy-store.js";
import { PostgresDraftStore } from "../adapters/postgres/draft-store.js";
import { PostgresTicketOperationStore } from "../adapters/postgres/ticket-operation-store.js";
import { registerLocalLiveSession } from "./live-session.js";
import { buildLocalApp } from "./local-app.js";
import type { VisitorAccess } from "./visitor-sessions.js";

const CITY_ID = "boulder-co";
const LOCAL_API_PORT = 3001;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const LOCAL_ORIGINS = ["http://127.0.0.1:5173", "http://localhost:5173"];

/**
 * Starts the local-only report API against the local Supabase database.
 * Input: `LOCAL_DATABASE_URL=... node dist/server/main.js`.
 * Output: an HTTP server on `127.0.0.1:3001` or a startup failure.
 */
async function startLocalApi(): Promise<void> {
  const databaseUrl = process.env.LOCAL_DATABASE_URL;
  const linearApiKey = process.env.LINEAR_API_KEY;
  const linearTeamId = process.env.LINEAR_TEAM_ID;
  const linearProjectId = process.env.LINEAR_PROJECT_ID;
  if (
    process.env.APP_MODE &&
    process.env.APP_MODE !== "reviewer" &&
    process.env.APP_MODE !== "development"
  ) {
    throw new Error("APP_MODE must be development or reviewer");
  }
  const mode = process.env.APP_MODE === "reviewer" ? "reviewer" : "development";
  const reviewerCode = process.env.REVIEWER_ACCESS_CODE;
  if (!databaseUrl || !LOOPBACK_HOSTS.has(new URL(databaseUrl).hostname)) {
    throw new Error("LOCAL_DATABASE_URL must point to a loopback database");
  }
  if (
    [linearApiKey, linearTeamId, linearProjectId].some(Boolean) &&
    ![linearApiKey, linearTeamId, linearProjectId].every(Boolean)
  ) {
    throw new Error(
      "LINEAR_API_KEY, LINEAR_TEAM_ID, and LINEAR_PROJECT_ID must be set together",
    );
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    if (mode === "reviewer" && !reviewerCode) {
      throw new Error("REVIEWER_ACCESS_CODE is required in reviewer mode");
    }
    await pool.query("select 1 from app.conversations limit 1");
    const store = new PostgresDraftStore(pool);
    const access: VisitorAccess = {
      mode,
      cityId: CITY_ID,
      openConversation: (cityId) => store.openConversation(cityId),
      allowedOrigins:
        mode === "reviewer" ? [process.env.PUBLIC_ORIGIN ?? ""] : LOCAL_ORIGINS,
      ...(reviewerCode ? { accessCode: reviewerCode } : {}),
    };
    const app = buildLocalApp(
      store,
      null,
      new PostgresCityPolicyStore(pool),
      () => new Date(),
      linearApiKey && linearTeamId && linearProjectId
        ? {
            operations: new PostgresTicketOperationStore(pool),
            provider: new LinearTicketProvider({
              apiKey: linearApiKey,
              teamId: linearTeamId,
              projectId: linearProjectId,
            }),
          }
        : undefined,
      { apiKey: process.env.OPENAI_API_KEY },
      access,
    );
    registerLocalLiveSession(app, process.env.OPENAI_API_KEY);
    await app.listen({ host: "127.0.0.1", port: LOCAL_API_PORT });
    process.stdout.write(
      `Local API ready at http://127.0.0.1:${LOCAL_API_PORT}\n`,
    );

    const close = async () => {
      await app.close();
      await pool.end();
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  } catch (error) {
    await pool.end();
    throw error;
  }
}

startLocalApi().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown failure";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
