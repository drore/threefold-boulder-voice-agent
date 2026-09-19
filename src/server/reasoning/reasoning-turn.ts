/**
 * Reasoning turn.
 * Runs one bounded tool-calling turn for a delegated caller utterance: the
 * capable model chooses application tools, the server executes each through
 * validated handlers, and the model composes a short grounded spoken reply.
 * The model never performs effects; the server owns scope and authorization.
 */
import {
  agentToolDefinitions,
  type AgentToolResult,
} from "./tool-definitions.js";
import { trace } from "../trace.js";
import { reasoningInstructions } from "../../prompts/reasoning.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const REASONING_MODEL = "gpt-5.6-luna";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_UTTERANCE_LENGTH = 1_200;
const MAX_TOOL_CALLS = 4;
const MAX_OUTPUT_TOKENS = 600;

const OPENAI_TOOLS = agentToolDefinitions.map((tool) => ({
  type: "function" as const,
  name: tool.name,
  description: tool.description,
  parameters: tool.parameters,
}));

export type ReasoningToolCall = Readonly<{
  name: string;
  arguments: Record<string, unknown>;
  result: AgentToolResult;
}>;

export type ReasoningUnavailableReason =
  | "invalid_utterance"
  | "openai_not_configured"
  | "openai_auth_rejected"
  | "openai_request_failed"
  | "openai_unreachable"
  | "openai_response_incomplete"
  | "openai_refused"
  | "invalid_response";

export type ReasoningTurnResult =
  | {
      status: "completed";
      speech: string;
      toolCalls: readonly ReasoningToolCall[];
    }
  | { status: "unavailable"; reason: ReasoningUnavailableReason };

type OpenAiItem = Record<string, unknown>;

/**
 * Runs one tool-calling turn and returns the model's spoken reply plus the
 * executed tool calls.
 * Input: a delegated utterance, the demo's tool executor, and the API key.
 * Output: a short grounded speech reply, or an explicit unavailable reason.
 */
export type RunReasoningTurnInput = Readonly<{
  utterance: string;
  cityName: string;
  activeDraft?: Readonly<{
    requestType: string;
    missingFields: readonly string[];
  }>;
  officeStatus?: "open" | "closed" | "unavailable";
  previousReply?: string;
  apiKey: string | undefined;
  executeTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<AgentToolResult>;
  request?: typeof fetch;
  maxToolCalls?: number;
  model?: string;
}>;

/**
 * Runs one tool-calling turn and returns the model's spoken reply plus the
 * executed tool calls. The turn emits a `reasoning_turn` trace line with the
 * model, outcome, and token usage so a run can be inspected after the fact.
 */
export async function runReasoningTurn(
  input: RunReasoningTurnInput,
): Promise<ReasoningTurnResult> {
  const request = input.request ?? fetch;
  const utterance = input.utterance.trim();
  if (utterance.length === 0 || utterance.length > MAX_UTTERANCE_LENGTH) {
    return { status: "unavailable", reason: "invalid_utterance" };
  }
  if (!input.apiKey) {
    return { status: "unavailable", reason: "openai_not_configured" };
  }
  const apiKey = input.apiKey;

  const model = input.model ?? REASONING_MODEL;
  const usage = { input: 0, output: 0, total: 0 };
  const result = await runToolLoop(input, apiKey, request, model, usage);
  trace("reasoning_turn", {
    model,
    status: result.status,
    usage,
    ...(result.status === "completed"
      ? { toolCount: result.toolCalls.length }
      : { reason: result.reason }),
  });
  return result;
}

/** Input: a validated turn plus a token counter. Output: the bounded tool loop result. */
async function runToolLoop(
  input: RunReasoningTurnInput,
  apiKey: string,
  request: typeof fetch,
  model: string,
  usage: { input: number; output: number; total: number },
): Promise<ReasoningTurnResult> {
  const toolCalls: ReasoningToolCall[] = [];
  const maxToolCalls = input.maxToolCalls ?? MAX_TOOL_CALLS;
  const conversation: OpenAiItem[] = [
    {
      role: "developer",
      content: reasoningInstructions(input.cityName),
    },
    {
      role: "user",
      content: JSON.stringify({
        utterance: input.utterance,
        activeDraft: input.activeDraft ?? null,
        officeStatus: input.officeStatus ?? null,
        previousReply: input.previousReply ?? null,
      }),
    },
  ];

  for (let round = 0; round <= MAX_TOOL_CALLS; round += 1) {
    const response = await sendRequest(request, apiKey, model, conversation);
    if (response.status !== "completed") return response;
    usage.input += response.usage.input;
    usage.output += response.usage.output;
    usage.total += response.usage.total;

    const functionCalls = response.output.filter(
      (item) => item.type === "function_call",
    );
    if (functionCalls.length === 0) {
      const speech = readMessageText(response.output);
      return speech === null
        ? { status: "unavailable", reason: "invalid_response" }
        : { status: "completed", speech, toolCalls };
    }

    for (const call of functionCalls) {
      if (toolCalls.length >= maxToolCalls) {
        return { status: "unavailable", reason: "invalid_response" };
      }
      const name = typeof call.name === "string" ? call.name : "";
      const callId = typeof call.call_id === "string" ? call.call_id : "";
      const args = parseArguments(call.arguments);
      if (!name || !callId || args === null) {
        return { status: "unavailable", reason: "invalid_response" };
      }
      const result = await input.executeTool(name, args);
      toolCalls.push({ name, arguments: args, result });
      conversation.push(call);
      conversation.push({
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(result),
      });
    }
  }

  return { status: "unavailable", reason: "invalid_response" };
}

type SendResult =
  | {
      status: "completed";
      output: OpenAiItem[];
      usage: { input: number; output: number; total: number };
    }
  | { status: "unavailable"; reason: ReasoningUnavailableReason };

/** Input: the running conversation. Output: the model output items or a safe failure. */
async function sendRequest(
  request: typeof fetch,
  apiKey: string,
  model: string,
  conversation: readonly OpenAiItem[],
): Promise<SendResult> {
  let response: Response;
  try {
    response = await request(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "none" },
        max_output_tokens: MAX_OUTPUT_TOKENS,
        input: conversation,
        tools: OPENAI_TOOLS,
        tool_choice: "auto",
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { status: "unavailable", reason: "openai_unreachable" };
  }
  if (!response.ok) {
    return {
      status: "unavailable",
      reason:
        response.status === 401 || response.status === 403
          ? "openai_auth_rejected"
          : "openai_request_failed",
    };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: "unavailable", reason: "invalid_response" };
  }
  if (!isRecord(body) || body.status !== "completed") {
    return { status: "unavailable", reason: "openai_response_incomplete" };
  }
  if (
    Array.isArray(body.output) &&
    body.output.some((item) => isRecord(item) && item.type === "refusal")
  ) {
    return { status: "unavailable", reason: "openai_refused" };
  }
  if (!Array.isArray(body.output)) {
    return { status: "unavailable", reason: "invalid_response" };
  }
  const usage = isRecord(body.usage)
    ? {
        input:
          typeof body.usage.input_tokens === "number"
            ? body.usage.input_tokens
            : 0,
        output:
          typeof body.usage.output_tokens === "number"
            ? body.usage.output_tokens
            : 0,
        total:
          typeof body.usage.total_tokens === "number"
            ? body.usage.total_tokens
            : 0,
      }
    : { input: 0, output: 0, total: 0 };
  return {
    status: "completed",
    output: body.output.filter(isRecord),
    usage,
  };
}

/** Input: model output items. Output: the single text message, or `null`. */
function readMessageText(output: readonly OpenAiItem[]): string | null {
  const messages = output.filter((item) => item.type === "message");
  if (messages.length !== 1 || !Array.isArray(messages[0]?.content))
    return null;
  const text = messages[0].content
    .filter(
      (item: unknown): item is Record<string, unknown> =>
        isRecord(item) && item.type === "output_text",
    )
    .map((item) => item.text)
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .trim();
  return text.length > 0 ? text : null;
}

/** Input: a function-call `arguments` string. Output: an object, or `null`. */
function parseArguments(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Input: a possible object. Output: whether it is a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
