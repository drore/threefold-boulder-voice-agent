import pg from "pg";
import { PostgresCityPolicyStore } from "../adapters/postgres/city-policy-store.js";
import { PostgresDraftStore } from "../adapters/postgres/draft-store.js";
import { buildLocalApp } from "./local-app.js";

const CITY_ID = "boulder-co";
const LOCAL_API_PORT = 3001;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * Starts the local-only report API against the local Supabase database.
 * Input: `LOCAL_DATABASE_URL=... node dist/server/main.js`.
 * Output: an HTTP server on `127.0.0.1:3001` or a startup failure.
 */
async function startLocalApi(): Promise<void> {
  const databaseUrl = process.env.LOCAL_DATABASE_URL;
  if (!databaseUrl || !LOOPBACK_HOSTS.has(new URL(databaseUrl).hostname)) {
    throw new Error("LOCAL_DATABASE_URL must point to a loopback database");
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const store = new PostgresDraftStore(pool);
    const opened = await store.openConversation(CITY_ID);
    if (opened.status !== "created") {
      throw new Error("Local database is unavailable or not migrated");
    }
    const app = buildLocalApp(
      store,
      opened.context,
      new PostgresCityPolicyStore(pool),
    );
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
