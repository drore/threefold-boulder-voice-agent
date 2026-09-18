/**
 * Agent tool boundary.
 * Validates model-supplied tool calls before invoking a handler and provides
 * the stubs and the report-tool adapter. Tool names/arguments are untrusted
 * input; conversation scope, time, and destinations come from server state.
 * The catalog and contracts live in tool-definitions.ts.
 */
import {
  prepareServiceReport,
  type DraftStore,
} from "../../core/service-report/prepare-service-report.js";
import {
  agentToolDefinitions,
  type AgentToolContext,
  type AgentToolHandlers,
  type AgentToolResult,
} from "./tool-definitions.js";

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
    lookupCityWebsite: unavailable,
    findCityEvents: unavailable,
    confirmReport: unavailable,
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
    case "lookupCityWebsite":
      return handlers.lookupCityWebsite(
        { query: rawArguments.query as string },
        context,
      );
    case "findCityEvents": {
      const { query, title, startDate, endDate } = rawArguments as {
        query: string;
        title?: string;
        startDate?: string;
        endDate?: string;
      };
      return handlers.findCityEvents(
        {
          query,
          ...(title ? { title } : {}),
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
        },
        context,
      );
    }
    case "confirmReport":
      return handlers.confirmReport({}, context);
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
    if (!property) return false;
    // Models commonly send null or an empty string for optional fields;
    // treat those as absent instead of invalid.
    const isOptional = !(
      definition.parameters.required as readonly string[]
    ).includes(key);
    if (
      isOptional &&
      (argument === null ||
        (typeof argument === "string" && argument.trim().length === 0))
    ) {
      continue;
    }
    if (
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
