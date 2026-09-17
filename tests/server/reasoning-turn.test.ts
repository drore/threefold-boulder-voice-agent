import { describe, expect, it, vi } from "vitest";
import { runReasoningTurn } from "../../src/server/reasoning/reasoning-turn.js";

/** Input: response output items. Output: the Responses API envelope the loop consumes. */
function modelReply(output: unknown[]): Response {
  return new Response(JSON.stringify({ status: "completed", output }), {
    status: 200,
  });
}

const FUNCTION_CALL = {
  type: "function_call",
  name: "lookupMunicipalCode",
  arguments: '{"query":"glass in parks"}',
  call_id: "call-1",
};

const MESSAGE = {
  type: "message",
  content: [
    { type: "output_text", text: "Glass bottles are banned in parks." },
  ],
};

describe("reasoning turn", () => {
  it("executes the model's chosen tool and returns its grounded reply", async () => {
    const responses = [modelReply([FUNCTION_CALL]), modelReply([MESSAGE])];
    const request = vi.fn(async () => responses.shift() as Response);
    const executeTool = vi.fn(async () => ({
      status: "answered" as const,
      coverage: "reviewed_example" as const,
      answer: "Glass bottles are banned in parks.",
      sources: [],
      limitations: [],
    }));

    const result = await runReasoningTurn({
      cityName: "Testville",
      utterance: "Can I bring glass to a park?",
      apiKey: "synthetic-key",
      executeTool,
      request,
    });

    expect(executeTool).toHaveBeenCalledExactlyOnceWith("lookupMunicipalCode", {
      query: "glass in parks",
    });
    expect(result).toEqual({
      status: "completed",
      speech: "Glass bottles are banned in parks.",
      toolCalls: [
        {
          name: "lookupMunicipalCode",
          arguments: { query: "glass in parks" },
          result: {
            status: "answered",
            coverage: "reviewed_example",
            answer: "Glass bottles are banned in parks.",
            sources: [],
            limitations: [],
          },
        },
      ],
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("returns a conversational reply when the model calls no tool", async () => {
    const request = vi.fn(async () => modelReply([MESSAGE]));
    const executeTool = vi.fn();

    const result = await runReasoningTurn({
      cityName: "Testville",
      utterance: "What can you do?",
      apiKey: "synthetic-key",
      executeTool,
      request,
    });

    expect(executeTool).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "completed",
      toolCalls: [],
    });
  });

  it("fails safely without an API key or on an auth rejection", async () => {
    const missingKey = await runReasoningTurn({
      cityName: "Testville",
      utterance: "hello",
      apiKey: undefined,
      executeTool: vi.fn(),
    });
    expect(missingKey).toEqual({
      status: "unavailable",
      reason: "openai_not_configured",
    });

    const rejected = await runReasoningTurn({
      cityName: "Testville",
      utterance: "hello",
      apiKey: "synthetic-key",
      executeTool: vi.fn(),
      request: async () => new Response("denied", { status: 401 }),
    });
    expect(rejected).toEqual({
      status: "unavailable",
      reason: "openai_auth_rejected",
    });
  });

  it("stops after the bounded number of tool calls", async () => {
    const request = vi.fn(async () => modelReply([FUNCTION_CALL]));
    const executeTool = vi.fn(async () => ({
      status: "unavailable" as const,
      reason: "not_implemented" as const,
    }));

    const result = await runReasoningTurn({
      cityName: "Testville",
      utterance: "loop please",
      apiKey: "synthetic-key",
      executeTool,
      request,
      maxToolCalls: 2,
    });

    expect(result).toEqual({
      status: "unavailable",
      reason: "invalid_response",
    });
    expect(executeTool).toHaveBeenCalledTimes(2);
  });

  it("sends the configured reasoning model in the request", async () => {
    let sentBody: Record<string, unknown> = {};
    const request: typeof fetch = async (_input, init) => {
      sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return modelReply([MESSAGE]);
    };

    await runReasoningTurn({
      cityName: "Testville",
      utterance: "hello",
      apiKey: "synthetic-key",
      model: "candidate-2",
      executeTool: vi.fn(),
      request,
    });

    expect(sentBody.model).toBe("candidate-2");
  });

  it("rejects a malformed tool-call argument payload", async () => {
    const request = vi.fn(async () =>
      modelReply([
        {
          type: "function_call",
          name: "findCityEvents",
          arguments: "not json",
          call_id: "call-2",
        },
      ]),
    );

    const result = await runReasoningTurn({
      cityName: "Testville",
      utterance: "events please",
      apiKey: "synthetic-key",
      executeTool: vi.fn(),
      request,
    });

    expect(result).toEqual({
      status: "unavailable",
      reason: "invalid_response",
    });
  });
});
