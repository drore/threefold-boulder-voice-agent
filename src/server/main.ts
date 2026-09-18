/**
 * Service entry point.
 * Reads runtime config, connects Postgres, composes the adapters/providers, and
 * starts the API, serving the built UI in reviewer mode.
 */
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createCityEventsProvider } from "../adapters/city-website/events.js";
import { createPageSelector } from "../adapters/city-website/page-selector.js";
import { createCityWebsiteProvider } from "../adapters/city-website/website.js";
import { LinearTicketProvider } from "../adapters/linear/linear-ticket-provider.js";
import { PostgresCityKnowledgeStore } from "../adapters/postgres/city-knowledge-store.js";
import { PostgresCityPolicyStore } from "../adapters/postgres/city-policy-store.js";
import { PostgresDraftStore } from "../adapters/postgres/draft-store.js";
import { PostgresTicketOperationStore } from "../adapters/postgres/ticket-operation-store.js";
import { registerLocalLiveSession } from "./voice/live-session.js";
import { buildLocalApp } from "./build-app.js";
import { REASONING_MODEL } from "./reasoning/reasoning-turn.js";
import { readRuntimeConfig } from "./runtime-config.js";
import { registerStaticWeb } from "./static-web.js";
import type { VisitorAccess } from "./visitor-sessions.js";

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
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
    query_timeout: 10_000,
    lock_timeout: 10_000,
    application_name: "threefold-boulder-agent",
    ...(config.mode === "reviewer"
      ? { ssl: { rejectUnauthorized: true } }
      : {}),
  });
  try {
    await pool.query("select 1 from app.conversations limit 1");
    const cityId = process.env.CITY_ID?.trim();
    if (!cityId) {
      throw new Error("CITY_ID is required and must name a configured city");
    }
    const policyStore = new PostgresCityPolicyStore(pool);
    const loadedPolicy = await policyStore.load(cityId);
    if (loadedPolicy.status !== "available") {
      throw new Error(`City policy for ${cityId} is unavailable or invalid`);
    }
    const policy = loadedPolicy.policy;
    const store = new PostgresDraftStore(pool);
    const access: VisitorAccess = {
      mode: config.mode,
      cityId,
      openConversation: (cityId) => store.openConversation(cityId),
      allowedOrigins: config.allowedOrigins,
      ...(config.reviewerCode ? { accessCode: config.reviewerCode } : {}),
    };
    const app = buildLocalApp(
      store,
      null,
      policyStore,
      {
        cityId,
        displayName: policy.displayName,
        timeZone: policy.schedule.timeZone,
        eventsListingUrl: policy.eventsListingUrl,
        websiteBaseUrl: policy.websiteBaseUrl,
        knowledge: new PostgresCityKnowledgeStore(pool),
      },
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
      createCityEventsProvider({ listingUrl: policy.eventsListingUrl }),
      createCityWebsiteProvider({
        baseUrl: policy.websiteBaseUrl,
        selectPage: createPageSelector({
          apiKey: config.openAiApiKey,
          model: config.reasoningModel ?? REASONING_MODEL,
        }),
      }),
    );
    registerLocalLiveSession(app, config.openAiApiKey, policy.displayName);
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
