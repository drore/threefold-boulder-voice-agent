/**
 * Browser-facing message catalog.
 * Small typed copy for server blocked codes, kept out of the components.
 */

const BLOCKED_MESSAGES: Record<string, string> = {
  invalid_input: "Please check the details and try again.",
  unsupported_request_type:
    "This demo supports pothole and park maintenance reports only.",
  scope_mismatch: "This draft is no longer available in this session.",
  revision_conflict: "The draft changed. Reload this page before editing.",
  store_unavailable: "The draft could not be saved. Please try again later.",
  missing_draft: "Save the report details before confirming.",
  incomplete_draft: "Add both the issue and location before confirming.",
  policy_unavailable: "The city schedule is unavailable. No action was taken.",
};

/** Input: a server blocked code. Output: user-facing copy. */
export function blockedMessage(code: string): string {
  return BLOCKED_MESSAGES[code] ?? "The request could not be completed.";
}
