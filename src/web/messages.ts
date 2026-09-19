/**
 * Browser-facing message catalog.
 * Small typed copy for server blocked codes, voice status, and spoken action
 * outcomes, kept out of the components so wording is single-sourced.
 */
import type { LocalConfirmResult } from "../server/workflow/confirm-outcome.js";
import type { LiveVoiceStatus } from "./voice/live-voice.js";

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

export const VOICE_STATUS_LABELS: Record<LiveVoiceStatus, string> = {
  connecting: "Connecting to the voice assistant…",
  ready: "Connected. You can speak.",
  closing: "Ending the voice session…",
  closed: "Voice is off.",
  disconnected: "Voice connection lost.",
  reconnecting: "Reconnecting to the voice assistant…",
};

/** Input: a verified route or Linear outcome. Output: accurate spoken copy with demo limitations. */
export function speechForAction(action: LocalConfirmResult): string {
  switch (action.status) {
    case "simulated_route":
      return `Since it's during business hours, this would go to ${action.department.name}. This is a demo, so no call is actually made.`;
    case "linear_ticket_created": {
      const reference = action.issueKey
        ? ` Its reference is ${action.issueKey}.`
        : "";
      return action.currentDetails === "unavailable"
        ? `I filed this as a test ticket in Linear, but I can't check its current status right now.${reference}`
        : `I filed this as a test ticket in Linear and verified it.${reference}`;
    }
    case "ticket_path_unavailable":
      return "The office is closed and the ticket system isn't set up right now, so nothing was filed.";
    case "ticket_uncertain":
      return `I'm not sure the ticket went through, so I won't file a second one. The reference is ${action.operationId}.`;
    case "ticket_failed":
      return "The ticket system rejected it, so nothing was filed.";
    default:
      return "I could not confirm that report. Please review the details on screen.";
  }
}
