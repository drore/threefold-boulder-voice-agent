const LOCAL_API_PORT = 3001;
const LOCAL_HOST = "127.0.0.1";
const LOCAL_ORIGINS = ["http://127.0.0.1:5173", "http://localhost:5173"];
const LOOPBACK_HOSTS = new Set([LOCAL_HOST, "localhost", "[::1]"]);

export type RuntimeConfig = {
  mode: "development" | "reviewer";
  databaseUrl: string;
  host: string;
  port: number;
  allowedOrigins: readonly string[];
  reviewerCode?: string;
  openAiApiKey?: string;
  linear?: { apiKey: string; teamId: string; projectId: string };
};

/**
 * Validates the two supported runtimes before opening any network connection.
 * Input: `{APP_MODE:"reviewer", DATABASE_URL:"postgres://...", ...}`.
 * Output: a reviewer config with HTTPS origin and a verified-TLS database setting.
 */
export function readRuntimeConfig(
  env: Record<string, string | undefined>,
): RuntimeConfig {
  const mode = env.APP_MODE ?? "development";
  if (mode !== "development" && mode !== "reviewer") {
    throw new Error("APP_MODE must be development or reviewer");
  }

  const databaseUrl =
    mode === "reviewer" ? env.DATABASE_URL : env.LOCAL_DATABASE_URL;
  const database = parseDatabaseUrl(databaseUrl);
  const isLoopback = LOOPBACK_HOSTS.has(database.hostname);
  if (mode === "development" && !isLoopback) {
    throw new Error("LOCAL_DATABASE_URL must point to a loopback database");
  }
  if (mode === "reviewer" && isLoopback) {
    throw new Error("DATABASE_URL must point to the hosted database");
  }
  if (mode === "reviewer" && database.search) {
    throw new Error("DATABASE_URL must not contain URL options");
  }

  const linear = readLinearConfig(env, mode === "reviewer");
  if (mode === "development") {
    return {
      mode,
      databaseUrl: databaseUrl ?? "",
      host: LOCAL_HOST,
      port: LOCAL_API_PORT,
      allowedOrigins: LOCAL_ORIGINS,
      ...(linear ? { linear } : {}),
      ...(env.OPENAI_API_KEY ? { openAiApiKey: env.OPENAI_API_KEY } : {}),
    };
  }

  const origin = env.PUBLIC_ORIGIN;
  if (!origin || !isExactHttpsOrigin(origin)) {
    throw new Error("PUBLIC_ORIGIN must be one exact HTTPS origin");
  }
  if (!env.REVIEWER_ACCESS_CODE || env.REVIEWER_ACCESS_CODE.length < 20) {
    throw new Error("REVIEWER_ACCESS_CODE must contain at least 20 characters");
  }
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required in reviewer mode");
  }
  if (!linear) {
    throw new Error("Linear ticketing is required in reviewer mode");
  }
  const port = Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port in reviewer mode");
  }

  return {
    mode,
    databaseUrl: databaseUrl ?? "",
    host: "0.0.0.0",
    port,
    allowedOrigins: [origin],
    reviewerCode: env.REVIEWER_ACCESS_CODE,
    openAiApiKey: env.OPENAI_API_KEY,
    linear,
  };
}

/** Input: a database URL. Output: a parsed Postgres URL or a safe configuration error. */
function parseDatabaseUrl(value: string | undefined): URL {
  try {
    if (!value) throw new Error("missing");
    const url = new URL(value);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      !url.username ||
      !url.pathname ||
      url.pathname === "/"
    ) {
      throw new Error("invalid");
    }
    return url;
  } catch {
    throw new Error("A valid Postgres database URL is required");
  }
}

/** Input: optional Linear credentials. Output: a complete adapter config or an error. */
function readLinearConfig(
  env: Record<string, string | undefined>,
  required: boolean,
): RuntimeConfig["linear"] {
  const values = [
    env.LINEAR_API_KEY,
    env.LINEAR_TEAM_ID,
    env.LINEAR_PROJECT_ID,
  ];
  if (!values.some(Boolean) && !required) return undefined;
  if (!values.every(Boolean)) {
    throw new Error(
      "LINEAR_API_KEY, LINEAR_TEAM_ID, and LINEAR_PROJECT_ID must be set together",
    );
  }
  return {
    apiKey: env.LINEAR_API_KEY ?? "",
    teamId: env.LINEAR_TEAM_ID ?? "",
    projectId: env.LINEAR_PROJECT_ID ?? "",
  };
}

/** Input: `https://demo.example`. Output: true only for a complete HTTPS origin. */
function isExactHttpsOrigin(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.origin === value;
  } catch {
    return false;
  }
}
