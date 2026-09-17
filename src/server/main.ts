/**
 * Service entry point.
 * Reads runtime config, connects Postgres, composes the adapters/providers, and
 * starts the API, serving the built UI in reviewer mode.
 */
import { fileURLToPath } from "node:url";
import pg from "pg";
import { LinearTicketProvider } from "../adapters/linear/linear-ticket-provider.js";
import { PostgresCityPolicyStore } from "../adapters/postgres/city-policy-store.js";
import { PostgresDraftStore } from "../adapters/postgres/draft-store.js";
import { PostgresTicketOperationStore } from "../adapters/postgres/ticket-operation-store.js";
import { registerLocalLiveSession } from "./voice/live-session.js";
import { buildLocalApp } from "./build-app.js";
import { readRuntimeConfig } from "./runtime-config.js";
import { registerStaticWeb } from "./static-web.js";
import type { VisitorAccess } from "./visitor-sessions.js";

const CITY_ID = "boulder-co";
const BUILT_WEB_ROOT = fileURLToPath(new URL("../web/", import.meta.url));

/**
 * Starts the local API or the single-service HTTPS reviewer demo.
 * Input: local `LOCAL_DATABASE_URL`, or reviewer `DATABASE_URL` and `PUBLIC_ORIGIN`.
 * Output: a listening API and, for reviewers, the built UI; otherwise a startup error.
 */
async function startApi(): Promise<void> {
  const config = readRuntimeConfig(process.env);
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 5,
    ...(config.mode === "reviewer"
      ? { ssl: { rejectUnauthorized: true } }
      : {}),
  });
  try {
    await pool.query("select 1 from app.conversations limit 1");
    const store = new PostgresDraftStore(pool);
    const access: VisitorAccess = {
      mode: config.mode,
      cityId: CITY_ID,
      openConversation: (cityId) => store.openConversation(cityId),
      allowedOrigins: config.allowedOrigins,
      ...(config.reviewerCode ? { accessCode: config.reviewerCode } : {}),
    };
    const app = buildLocalApp(
      store,
      null,
      new PostgresCityPolicyStore(pool),
      () => new Date(),
      config.linear
        ? {
            operations: new PostgresTicketOperationStore(pool),
            provider: new LinearTicketProvider({
              apiKey: config.linear.apiKey,
              teamId: config.linear.teamId,
              projectId: config.linear.projectId,
            }),
          }
        : undefined,
      {
        apiKey: config.openAiApiKey,
        ...(config.reasoningModel ? { model: config.reasoningModel } : {}),
      },
      access,
    );
    registerLocalLiveSession(app, config.openAiApiKey);
    if (config.mode === "reviewer") registerStaticWeb(app, BUILT_WEB_ROOT);
    await app.listen({ host: config.host, port: config.port });
    process.stdout.write(`API ready on ${config.host}:${config.port}\n`);

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

startApi().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown failure";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
