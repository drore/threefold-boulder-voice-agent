/**
 * Shared transaction boundary for the Postgres store adapters.
 * Opens one transaction per call, releases its client on every outcome, and
 * reports a thrown error through the calling store's diagnostic logger. The
 * work callback decides per outcome whether the transaction commits or rolls
 * back; provider network calls never belong inside it.
 */
import type { Pool, PoolClient } from "pg";
import { logDatabaseError } from "./log-database-error.js";

/** A store's decision for one transaction step: persist or discard its result. */
export type TransactionStep<T> =
  | Readonly<{ action: "commit"; value: T }>
  | Readonly<{ action: "rollback"; value: T }>;

/** Input: the result to return after committing. Output: a commit step. */
export function commit<T>(value: T): TransactionStep<T> {
  return { action: "commit", value };
}

/** Input: the result to return after rolling back. Output: a rollback step. */
export function rollback<T>(value: T): TransactionStep<T> {
  return { action: "rollback", value };
}

/**
 * Runs one store transaction on a pooled client.
 * Input: the pool, store and operation names, and the work to run.
 * Output: the work's committed or rolled-back value, or `unavailable` on failure.
 */
export async function runInTransaction<T>(
  pool: Pool,
  store: string,
  operation: string,
  work: (client: PoolClient) => Promise<TransactionStep<T>>,
): Promise<T | { status: "unavailable" }> {
  let client: PoolClient | undefined;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query("begin");
    transactionStarted = true;

    const step = await work(client);
    await client.query(step.action);
    return step.value;
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("rollback");
      } catch {
        // The connection may already be gone; the caller still gets unavailable.
      }
    }
    logDatabaseError(store, operation, error);
    return { status: "unavailable" };
  } finally {
    client?.release();
  }
}
