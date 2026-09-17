/**
 * Agent tool catalog and contracts.
 * Declares the backend capabilities the reasoning model may call and the
 * provider-neutral result/context/handler shapes they share. Dispatch and
 * argument validation live in agent-tools.ts.
 */
import type { LocalConfirmResult } from "../workflow/confirm-outcome.js";
import type { PrepareReportResult } from "../../core/service-report/prepare-service-report.js";

/**
 * Backend tools available to the reasoning agent through any conversation channel.
 * These are application capabilities, not direct provider or policy functions.
 */
export const agentToolDefinitions = [
  {
    name: "lookupMunicipalCode",
    description:
      "Look up a reviewed municipal-code answer for the configured city. Coverage is a small reviewed set, not the full code; the answer states its own scope.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "lookupCityInformation",
    description:
      "Look up reviewed city-service guidance for the configured city. Coverage is a small reviewed set of examples, not a directory of every service.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "lookupCityWebsite",
    description:
      "Look up the official city website for a caller question when the reviewed examples do not cover it. Pass the caller's key words; the server selects and fetches the most relevant official page.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "findCityEvents",
    description:
      "Find upcoming events from the configured city's official calendar (live, cached). The date range is optional; omit it to cover the next two weeks. Never ask the caller for dates.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        title: {
          type: "string",
          description: "Specific event name the caller mentioned, if any",
        },
        startDate: { type: "string", description: "YYYY-MM-DD, if known" },
        endDate: { type: "string", description: "YYYY-MM-DD, if known" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "confirmReport",
    description:
      "Confirm the caller's current saved report so the server routes or files it. Call only after you have summarized the exact saved details and the caller clearly agrees. Takes no arguments; the server uses the current saved revision.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "prepareServiceReport",
    description:
      "Propose a nonurgent pothole or park-maintenance report for validation and caller confirmation. This does not submit it.",
    parameters: {
      type: "object",
      properties: {
        requestType: { type: "string", enum: ["pothole", "park_maintenance"] },
        location: { type: "string" },
        description: { type: "string" },
      },
      required: ["requestType"],
      additionalProperties: false,
    },
  },
] as const;

export type AgentToolName = (typeof agentToolDefinitions)[number]["name"];

export type AgentToolInput =
  | { name: "lookupMunicipalCode"; arguments: { query: string } }
  | { name: "lookupCityInformation"; arguments: { query: string } }
  | { name: "lookupCityWebsite"; arguments: { query: string } }
  | {
      name: "findCityEvents";
      arguments: {
        query: string;
        title?: string;
        startDate?: string;
        endDate?: string;
      };
    }
  | { name: "confirmReport"; arguments: Record<string, never> }
  | {
      name: "prepareServiceReport";
      arguments: {
        requestType: "pothole" | "park_maintenance";
        location?: string;
        description?: string;
      };
    };

export type AgentSourceCard = {
  title: string;
  url: string;
  kind: "municipal_code" | "city_website" | "city_event";
  verifiedOn: string;
  note: string;
  excerpt?: string;
};

export type AgentToolResult =
  | { status: "unavailable"; reason: "not_implemented" }
  | {
      status: "answered";
      coverage: "reviewed_example" | "live_official_source";
      answer: string;
      sources: readonly AgentSourceCard[];
      limitations: readonly string[];
    }
  | {
      status: "limited_coverage";
      coverage: "reviewed_examples_only";
      reason: "unsupported_query" | "source_unavailable";
      supportedTopics: readonly string[];
    }
  | {
      status: "page_evidence";
      coverage: "live_official_source";
      pageTitle: string;
      pageUrl: string;
      fetchedAtUtc: string;
      pageText: string;
      limitations: readonly string[];
    }
  | {
      status: "rejected";
      reason:
        | "unknown_tool"
        | "invalid_arguments"
        | "missing_server_context"
        | "missing_observation";
    }
  | PrepareReportResult
  | LocalConfirmResult;

// The coordinator must create this context from authenticated server state.
export type AgentToolContext = Readonly<{
  conversationId: string;
  cityId: string;
  admissionId: string;
  runId: string;
  channel: "voice" | "text";
  observationIds: readonly string[];
  report?: Readonly<{
    draftId: string | null;
    expectedRevision: number | null;
    fieldObservationIds: Readonly<{
      location?: string;
      description?: string;
    }>;
  }>;
}>;

export type AgentToolHandlers = {
  [Name in AgentToolName]: (
    input: Extract<AgentToolInput, { name: Name }>["arguments"],
    context: AgentToolContext,
  ) => Promise<AgentToolResult>;
};
