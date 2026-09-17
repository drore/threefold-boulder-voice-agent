/**
 * Reasoning turn.
 * Runs one bounded tool-calling turn for a delegated caller utterance: the
 * capable model chooses application tools, the server executes each through
 * validated handlers, and the model composes a short grounded spoken reply.
 * The model never performs effects; the server owns scope and authorization.
 */
import { agentToolDefinitions, type AgentToolResult } from "./agent-tools.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const REASONING_MODEL = "gpt-5.6-luna";
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

const REASONING_INSTRUCTIONS = [
  "You are the reasoning backend for a small Boulder, Colorado municipal-service voice demo.",
  "A caller turn was delegated to you. Call the available tools when the caller asks about city code, city services, dated events, or wants to report a nonurgent pothole or park issue.",
  "Answer only from tool results and the capabilities listed in the tools. Never invent facts, times, sections, or citations.",
  "If the request is unrelated to those topics, briefly decline and say what you can help with. Never answer unrelated requests such as recipes, general trivia, or personal tasks.",
  "Describe your coverage only as the tools describe it; never claim topics, code sections, or sources beyond the reviewed examples.",
  "When a tool returns limited_coverage or source_unavailable, relay that limitation honestly instead of guessing.",
  "When you call prepareServiceReport, pass the caller's own words for location and description exactly as spoken; never paraphrase, summarize, or invent them.",
  "Call prepareServiceReport whenever the caller states or changes report details, including answers to your own follow-up questions, so the draft is updated.",
  "Your previous reply is provided as previousReply and the active draft lists its missing fields. Never ask again for something the caller just answered or that the draft already has.",
  "Speak only what the tool result states. If a result asks for a missing field, ask for that field; never claim a value was saved that the result does not confirm.",
  "The server gives you the current office status as context. If it is closed, tell the caller their confirmed report will be filed as a ticket for the responsible department; if it is open, it will be routed to that department. Never decide or change this yourself.",
  "If the caller asks to be transferred, explain that this demo simulates routing: a confirmed report routes to the configured department and no real call is placed.",
  "Never claim a ticket was created, a department was reached, or anything was submitted; the server handles effects only after on-screen confirmation.",
  "Keep replies short, natural, and suitable for speaking aloud. Match the caller's language.",
].join(" ");

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
export async function runReasoningTurn(input: {
  utterance: string;
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
}): Promise<ReasoningTurnResult> {
  const request = input.request ?? fetch;
  const utterance = input.utterance.trim();
  if (utterance.length === 0 || utterance.length > MAX_UTTERANCE_LENGTH) {
    return { status: "unavailable", reason: "invalid_utterance" };
  }
  if (!input.apiKey) {
    return { status: "unavailable", reason: "openai_not_configured" };
  }

  const toolCalls: ReasoningToolCall[] = [];
  const maxToolCalls = input.maxToolCalls ?? MAX_TOOL_CALLS;
  const conversation: OpenAiItem[] = [
    { role: "developer", content: REASONING_INSTRUCTIONS },
    {
      role: "user",
      content: JSON.stringify({
        utterance,
        activeDraft: input.activeDraft ?? null,
        officeStatus: input.officeStatus ?? null,
        previousReply: input.previousReply ?? null,
      }),
    },
  ];

  for (let round = 0; round <= MAX_TOOL_CALLS; round += 1) {
    const response = await sendRequest(
      request,
      input.apiKey,
      input.model ?? REASONING_MODEL,
      conversation,
    );
    if (response.status !== "completed") return response;

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
  | { status: "completed"; output: OpenAiItem[] }
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
  return {
    status: "completed",
    output: body.output.filter(isRecord),
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
