/**
 * Shared Postgres adapter diagnostics.
 * Each store reports its own name and failed operation, so a database error
 * stays attributable without logging credentials, SQL text, or caller data.
 */

/** Input: `("PostgresDraftStore", "save", error)`. Output: one compact console line. */
export function logDatabaseError(
  store: string,
  operation: string,
  error: unknown,
): void {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "unknown";
  console.error(`${store}.${operation} failed`, { code });
}
