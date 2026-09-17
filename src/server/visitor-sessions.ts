import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type {
  ReportContext,
  SupportedReportType,
} from "../core/prepare-service-report.js";

const SESSION_LIFETIME_SECONDS = 30 * 60;
const MAX_ACTIVE_VISITORS = 30;
const MAX_FAILED_ACCESS_ATTEMPTS = 30;

export type VisitorSession = {
  context: ReportContext;
  currentDraft: {
    draftId: string;
    revision: number;
    requestType: SupportedReportType;
  } | null;
  delegationCount: number;
  liveSessionCount: number;
  reportGeneration: number;
  reportWork: Promise<void>;
  /** Last spoken reply, so the next reasoning turn can avoid repeating itself. */
  lastAssistantSpeech: string | null;
};

export type VisitorAccess = {
  mode: "development" | "reviewer";
  allowedOrigins: readonly string[];
  cityId: string;
  openConversation: (
    cityId: string,
  ) => Promise<
    { status: "created"; context: ReportContext } | { status: "unavailable" }
  >;
  accessCode?: string;
};

declare module "fastify" {
  interface FastifyRequest {
    visitorSession: VisitorSession | null;
  }
}

/** Input: one server-owned DB conversation. Output: isolated draft and usage state for that visitor. */
export function newVisitorSession(context: ReportContext): VisitorSession {
  return {
    context,
    currentDraft: null,
    delegationCount: 0,
    liveSessionCount: 0,
    reportGeneration: 0,
    reportWork: Promise.resolve(),
    lastAssistantSpeech: null,
  };
}

/**
 * Admits a local visitor automatically or a reviewer with a secret code.
 * Input: `POST /api/access` with a correct code. Output: an HttpOnly session cookie.
 */
export function registerVisitorSessions(
  app: FastifyInstance,
  access: VisitorAccess,
): void {
  if (
    access.mode === "reviewer" &&
    (!access.accessCode ||
      access.accessCode.length < 20 ||
      access.allowedOrigins.length !== 1 ||
      !isExactHttpsOrigin(access.allowedOrigins[0]))
  ) {
    throw new Error(
      "Reviewer access requires a strong code and one HTTPS origin",
    );
  }

  const cookieName =
    access.mode === "reviewer" ? "__Host-boulder_session" : "boulder_session";
  const sessions = new Map<
    string,
    { session: VisitorSession; expiresAt: number }
  >();
  let creating = 0;
  let failedAttempts = 0;
  let failedWindowStart = Date.now();

  /** Input: an existing cookie. Output: its unexpired server-owned session, if any. */
  function findSession(request: FastifyRequest): VisitorSession | null {
    const token = readCookie(request.headers.cookie, cookieName);
    if (!token) return null;
    const stored = sessions.get(token);
    if (!stored) return null;
    if (stored.expiresAt <= Date.now()) {
      sessions.delete(token);
      return null;
    }
    return stored.session;
  }

  /** Input: an admitted visitor. Output: a fresh conversation and bounded opaque cookie. */
  async function createSession(reply: import("fastify").FastifyReply) {
    for (const [token, stored] of sessions) {
      if (stored.expiresAt <= Date.now()) sessions.delete(token);
    }
    if (sessions.size + creating >= MAX_ACTIVE_VISITORS) {
      return { status: "full" as const };
    }
    creating += 1;
    try {
      const opened = await access.openConversation(access.cityId);
      if (opened.status !== "created")
        return { status: "unavailable" as const };
      const session = newVisitorSession(opened.context);
      const token = randomBytes(32).toString("hex");
      sessions.set(token, {
        session,
        expiresAt: Date.now() + SESSION_LIFETIME_SECONDS * 1000,
      });
      reply.header(
        "set-cookie",
        `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_LIFETIME_SECONDS}${access.mode === "reviewer" ? "; Secure" : ""}`,
      );
      return { status: "created" as const, session };
    } finally {
      creating -= 1;
    }
  }

  app.decorateRequest("visitorSession", null);
  app.addHook("onRequest", async (request, reply) => {
    const route = request.routeOptions.url;
    if (!route?.startsWith("/api/")) return;
    if (
      request.method !== "GET" &&
      !access.allowedOrigins.includes(request.headers.origin ?? "") &&
      (access.mode === "reviewer" || request.headers.origin !== undefined)
    ) {
      return reply
        .code(403)
        .send({ status: "blocked", reason: "origin_denied" });
    }
    if (route === "/api/access" && request.method === "POST") return;

    const existing = findSession(request);
    if (existing) {
      request.visitorSession = existing;
      return;
    }
    if (access.mode === "reviewer") {
      return reply.code(401).send({ status: "access_required" });
    }
    const created = await createSession(reply);
    if (created.status === "created") {
      request.visitorSession = created.session;
      return;
    }
    return reply.code(created.status === "full" ? 429 : 503).send({
      status: "unavailable",
      reason: created.status === "full" ? "visitor_limit" : "store_unavailable",
    });
  });

  app.get("/api/access", async () => ({
    status: "admitted",
  }));

  app.post<{ Body: { code: string } }>(
    "/api/access",
    {
      schema: {
        body: {
          type: "object",
          required: ["code"],
          properties: {
            code: { type: "string", minLength: 1, maxLength: 200 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (access.mode !== "reviewer") {
        return reply.code(404).send({ status: "unavailable" });
      }
      if (Date.now() - failedWindowStart > 10 * 60 * 1000) {
        failedWindowStart = Date.now();
        failedAttempts = 0;
      }
      if (failedAttempts >= MAX_FAILED_ACCESS_ATTEMPTS) {
        return reply.code(429).send({ status: "unavailable" });
      }
      const supplied = createHash("sha256").update(request.body.code).digest();
      const expected = createHash("sha256")
        .update(access.accessCode ?? "")
        .digest();
      if (!timingSafeEqual(supplied, expected)) {
        failedAttempts += 1;
        return reply.code(401).send({ status: "access_denied" });
      }
      const existing = findSession(request);
      if (existing) return { status: "admitted" };
      const created = await createSession(reply);
      if (created.status !== "created") {
        return reply.code(created.status === "full" ? 429 : 503).send({
          status: "unavailable",
        });
      }
      return reply.code(201).send({ status: "admitted" });
    },
  );
}

/** Input: `https://demo.example`. Output: true only for a complete HTTPS origin without a path. */
function isExactHttpsOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" && parsed.origin === origin;
  } catch {
    return false;
  }
}

/** Input: a `Cookie` header. Output: one well-formed opaque token or no token. */
function readCookie(header: string | undefined, name: string): string | null {
  const values = (header ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (values.length !== 1) return null;
  const token = values[0]?.slice(name.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
