import { describe, expect, it } from "vitest";
import {
  proposeCitizenIntent,
  type ActiveDraftContext,
} from "../../src/server/intent-proposal.js";

const ACTIVE_POTHOLE: ActiveDraftContext = {
  requestType: "pothole",
  missingFields: ["location"],
};

const POTHOLE_PROPOSAL = {
  intent: "service_report",
  requestType: "pothole",
  location: "15th and Pine",
  description: null,
  query: null,
};

/** Input: model proposal JSON. Output: a completed Responses API fixture. */
function completedResponse(proposal: unknown): Response {
  return new Response(
    JSON.stringify({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(proposal) }],
        },
      ],
    }),
    { status: 200 },
  );
}

describe("citizen intent proposal", () => {
  it("sends bounded transcript and active-draft hints with the server key", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const request: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return completedResponse(POTHOLE_PROPOSAL);
    };

    expect(
      await proposeCitizenIntent(
        "At 15th and Pine",
        "synthetic-key",
        request,
        ACTIVE_POTHOLE,
      ),
    ).toEqual({ status: "proposed", proposal: POTHOLE_PROPOSAL });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/responses");
    expect(calls[0]?.init?.headers).toMatchObject({
      authorization: "Bearer synthetic-key",
    });
    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body).toMatchObject({
      model: "gpt-5.6-luna",
      store: false,
      reasoning: { effort: "none" },
      text: {
        format: {
          type: "json_schema",
          strict: true,
          name: "citizen_intent",
        },
      },
    });
    expect(JSON.parse(body.input[1].content)).toEqual({
      utterance: "At 15th and Pine",
      activeDraft: ACTIVE_POTHOLE,
    });
    expect(body.text.format.schema.required).toEqual([
      "intent",
      "requestType",
      "location",
      "description",
      "query",
    ]);
  });

  it("rejects invalid input before any provider request", async () => {
    let calls = 0;
    const request: typeof fetch = async () => {
      calls += 1;
      return completedResponse(POTHOLE_PROPOSAL);
    };

    expect(await proposeCitizenIntent(" ", "synthetic-key", request)).toEqual({
      status: "unavailable",
      reason: "invalid_utterance",
    });
    expect(
      await proposeCitizenIntent("x".repeat(1_201), "synthetic-key", request),
    ).toEqual({ status: "unavailable", reason: "invalid_utterance" });
    expect(await proposeCitizenIntent("Pothole", undefined, request)).toEqual({
      status: "unavailable",
      reason: "openai_not_configured",
    });
    expect(calls).toBe(0);
  });

  it("accepts a type-free location follow-up only for an active report", async () => {
    const followUp = { ...POTHOLE_PROPOSAL, requestType: null };
    const request: typeof fetch = async () => completedResponse(followUp);
    expect(
      await proposeCitizenIntent(
        "At 15th and Pine",
        "synthetic-key",
        request,
        ACTIVE_POTHOLE,
      ),
    ).toEqual({ status: "proposed", proposal: followUp });
    expect(
      await proposeCitizenIntent("At 15th and Pine", "synthetic-key", request),
    ).toEqual({ status: "unavailable", reason: "invalid_proposal" });
  });

  it("does not accept malformed, incomplete, or refused model output", async () => {
    const malformed: typeof fetch = async () =>
      completedResponse({ ...POTHOLE_PROPOSAL, requestType: "emergency" });
    expect(
      await proposeCitizenIntent(
        "There is a pothole",
        "synthetic-key",
        malformed,
      ),
    ).toEqual({ status: "unavailable", reason: "invalid_proposal" });

    const incomplete: typeof fetch = async () =>
      new Response(JSON.stringify({ status: "incomplete", output: [] }), {
        status: 200,
      });
    expect(
      await proposeCitizenIntent(
        "There is a pothole",
        "synthetic-key",
        incomplete,
      ),
    ).toEqual({ status: "unavailable", reason: "openai_response_incomplete" });

    const refused: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          status: "completed",
          output: [{ type: "message", content: [{ type: "refusal" }] }],
        }),
        { status: 200 },
      );
    expect(
      await proposeCitizenIntent(
        "There is a pothole",
        "synthetic-key",
        refused,
      ),
    ).toEqual({ status: "unavailable", reason: "openai_refused" });
  });

  it("reports provider and transport failures without exposing error text", async () => {
    const denied: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: "private detail" } }), {
        status: 401,
      });
    expect(
      await proposeCitizenIntent("Pothole", "synthetic-key", denied),
    ).toEqual({ status: "unavailable", reason: "openai_auth_rejected" });

    const offline: typeof fetch = async () => {
      throw new Error("private network detail");
    };
    expect(
      await proposeCitizenIntent("Pothole", "synthetic-key", offline),
    ).toEqual({ status: "unavailable", reason: "openai_unreachable" });
  });
});
