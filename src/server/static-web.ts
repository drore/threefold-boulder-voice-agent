import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

/**
 * Serves only the built browser files from one explicit directory.
 * Input: Fastify app and `/app/dist/web`. Output: `/` and `/assets/*` from that directory.
 */
export function registerStaticWeb(app: FastifyInstance, root: string): void {
  app.register(fastifyStatic, { root, prefix: "/" });
}
