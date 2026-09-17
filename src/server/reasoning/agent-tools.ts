/**
 * Agent tool boundary.
 * Declares the four backend capabilities and validates model-supplied tool
 * calls before invoking a handler. Tool names/arguments are untrusted input;
 * conversation scope, time, and destinations come from server state.
 */
import {
  prepareServiceReport,
  type DraftStore,
  type PrepareReportResult,
} from "../../core/prepare-service-report.js";

/**
 * Backend tools available to the reasoning agent through any conversation channel.
 * These are application capabilities, not direct provider or policy functions.
 */
export const agentToolDefinitions = [
  {
    name: "lookupMunicipalCode",
    description:
      "Look up the reviewed Boulder municipal-code example (BRC 8-3-9, glass containers in parks). Coverage is a small reviewed set, not the full code.",
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
      "Look up reviewed Boulder city-service guidance (how to report a pothole). Coverage is a small reviewed set of examples, not a directory of every service.",
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
      "Find upcoming events from the official Boulder city calendar (live, cached). Returns dated occurrences with official links.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        startDate: { type: "string", description: "YYYY-MM-DD, if known" },
        endDate: { type: "string", description: "YYYY-MM-DD, if known" },
      },
      required: ["query"],
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
  | {
      name: "findCityEvents";
      arguments: { query: string; startDate?: string; endDate?: string };
    }
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
      status: "rejected";
      reason:
        | "unknown_tool"
        | "invalid_arguments"
        | "missing_server_context"
        | "missing_observation";
    }
  | PrepareReportResult;

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

/**
 * Returns honest placeholders until the individual use cases are implemented.
 * Input: none. Output: handlers that return `{status: "unavailable", reason: "not_implemented"}`.
 */
export function createAgentToolStubs(): AgentToolHandlers {
  const unavailable = async (): Promise<AgentToolResult> => ({
    status: "unavailable",
    reason: "not_implemented",
  });
  return {
    lookupMunicipalCode: unavailable,
    lookupCityInformation: unavailable,
    findCityEvents: unavailable,
    prepareServiceReport: unavailable,
  };
}

/**
 * Binds the report tool to a scoped draft store; model arguments never carry
 * admission, observation, draft identity, or revision authority.
 * Input: `{requestType: "pothole", location: "15th and Pine"}` plus server context.
 * Output: `needs_input` for a missing description, or a blocked evidence code.
 */
export function createReportToolHandler(
  store: DraftStore,
): AgentToolHandlers["prepareServiceReport"] {
  return async (input, context) => {
    if (!context.report || !context.admissionId) {
      return { status: "rejected", reason: "missing_server_context" };
    }
    const { draftId, expectedRevision, fieldObservationIds } = context.report;
    const locationObservationId = fieldObservationIds.location;
    const descriptionObservationId = fieldObservationIds.description;
    if (
      (input.location &&
        (!locationObservationId ||
          !context.observationIds.includes(locationObservationId))) ||
      (input.description &&
        (!descriptionObservationId ||
          !context.observationIds.includes(descriptionObservationId)))
    ) {
      return { status: "rejected", reason: "missing_observation" };
    }
    return prepareServiceReport(
      {
        conversationId: context.conversationId,
        cityId: context.cityId,
        admissionId: context.admissionId,
      },
      {
        requestType: input.requestType,
        draftId,
        expectedRevision,
        ...(input.location && locationObservationId
          ? {
              location: {
                text: input.location,
                observationId: locationObservationId,
              },
            }
          : {}),
        ...(input.description && descriptionObservationId
          ? {
              description: {
                text: input.description,
                observationId: descriptionObservationId,
              },
            }
          : {}),
      },
      store,
    );
  };
}

/**
 * Validates a model tool call and passes it to the matching application handler.
 * Input: `("findCityEvents", {query: "events this week"}, serverContext, handlers)`.
 * Output: a handler result, or `{status: "rejected", reason: "invalid_arguments"}`.
 */
export async function callAgentTool(
  name: string,
  rawArguments: unknown,
  context: AgentToolContext,
  handlers: AgentToolHandlers,
): Promise<AgentToolResult> {
  const definition = agentToolDefinitions.find((tool) => tool.name === name);
  if (!definition) return { status: "rejected", reason: "unknown_tool" };
  if (!areValidArguments(rawArguments, definition)) {
    return { status: "rejected", reason: "invalid_arguments" };
  }

  switch (name) {
    case "lookupMunicipalCode":
      return handlers.lookupMunicipalCode(
        { query: rawArguments.query as string },
        context,
      );
    case "lookupCityInformation":
      return handlers.lookupCityInformation(
        { query: rawArguments.query as string },
        context,
      );
    case "findCityEvents": {
      const { query, startDate, endDate } = rawArguments as {
        query: string;
        startDate?: string;
        endDate?: string;
      };
      return handlers.findCityEvents(
        {
          query,
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
        },
        context,
      );
    }
    case "prepareServiceReport": {
      const { requestType, location, description } = rawArguments as {
        requestType: "pothole" | "park_maintenance";
        location?: string;
        description?: string;
      };
      return handlers.prepareServiceReport(
        {
          requestType,
          ...(location ? { location } : {}),
          ...(description ? { description } : {}),
        },
        context,
      );
    }
    default:
      return { status: "rejected", reason: "unknown_tool" };
  }
}

const MAX_TOOL_TEXT_LENGTH = 500;

type ToolDefinition = (typeof agentToolDefinitions)[number];

/**
 * Checks basic arguments against the tool's own definition.
 * Input: `{query: "parks"}` with `lookupCityInformation`. Output: `true`.
 */
function areValidArguments(
  value: unknown,
  definition: ToolDefinition,
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const argumentsObject = value as Record<string, unknown>;
  const properties = definition.parameters.properties as Record<
    string,
    { type: "string"; enum?: readonly string[] }
  >;

  for (const required of definition.parameters.required) {
    if (!(required in argumentsObject)) return false;
  }
  for (const [key, argument] of Object.entries(argumentsObject)) {
    const property = properties[key];
    if (
      !property ||
      typeof argument !== "string" ||
      argument.trim().length === 0 ||
      argument.length > MAX_TOOL_TEXT_LENGTH ||
      (property.enum && !property.enum.includes(argument))
    ) {
      return false;
    }
  }
  return true;
}
