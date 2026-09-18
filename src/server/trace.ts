/**
 * Lightweight structured tracing.
 * Emits one JSON line per event so a voice or text run can be analyzed after
 * the fact — specifically, what the reasoning model proposed and what the
 * server accepted. It never logs caller text, keys, or credentials: only
 * correlation IDs, tool names, validated enums, and result codes.
 */
export type TraceFields = Readonly<Record<string, unknown>>;

/** Input: `("tool_call", { runId, tool: "prepareServiceReport", requestType: "park_maintenance" })`. Output: one JSON line. */
export function trace(event: string, fields: TraceFields): void {
  process.stdout.write(
    `${JSON.stringify({ at: new Date().toISOString(), event, ...fields })}\n`,
  );
}

/** Input: an agent tool result. Output: its stable status plus an optional code/reason. */
export function traceResult(
  result: { status?: string; code?: string; reason?: string } | undefined,
): TraceFields {
  if (!result) return {};
  const code =
    "code" in result && typeof result.code === "string"
      ? result.code
      : undefined;
  const reason =
    "reason" in result && typeof result.reason === "string"
      ? result.reason
      : undefined;
  return {
    resultStatus: result.status ?? "unknown",
    ...(code ? { code } : {}),
    ...(reason ? { reason } : {}),
  };
}
