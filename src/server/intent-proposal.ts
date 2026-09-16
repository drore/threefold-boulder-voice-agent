const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const REASONING_MODEL = "gpt-5.6-luna";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_UTTERANCE_LENGTH = 1_200;
const MAX_PROPOSAL_TEXT_LENGTH = 500;
const MAX_OUTPUT_TOKENS = 400;

const INTENTS = [
  "municipal_code",
  "city_information",
  "city_event",
  "service_report",
  "capabilities",
  "unclear",
  "out_of_scope",
] as const;
const REQUEST_TYPES = ["pothole", "park_maintenance"] as const;

type CitizenIntent = (typeof INTENTS)[number];
type RequestType = (typeof REQUEST_TYPES)[number];

export type ActiveDraftContext = Readonly<{
  requestType: RequestType;
  missingFields: readonly ("location" | "description")[];
}>;

export type CitizenIntentProposal = Readonly<{
  intent: CitizenIntent;
  requestType: RequestType | null;
  location: string | null;
  description: string | null;
  query: string | null;
}>;

export type IntentProposalResult =
  | { status: "proposed"; proposal: CitizenIntentProposal }
  | {
      status: "unavailable";
      reason:
        | "invalid_utterance"
        | "openai_not_configured"
        | "openai_auth_rejected"
        | "openai_request_failed"
        | "openai_unreachable"
        | "openai_response_incomplete"
        | "openai_refused"
        | "invalid_proposal";
    };

const INTENT_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: INTENTS },
    requestType: { type: ["string", "null"], enum: [...REQUEST_TYPES, null] },
    location: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    query: { type: ["string", "null"] },
  },
  required: ["intent", "requestType", "location", "description", "query"],
  additionalProperties: false,
} as const;

const INTENT_INSTRUCTIONS = [
  "Classify the current caller utterance for a limited Boulder municipal demo.",
  "Supported: code, city information, dated events, nonurgent pothole and park-maintenance reports.",
  "Questions about what the demo can do or what the caller can ask use the capabilities intent.",
  "Use unclear or out_of_scope when needed. Never propose a ticket, transfer, or confirmation.",
  "Extract report fields only from the current utterance. Active draft only hints request type and missing fields.",
  "Put information questions in query. Use null when absent; never invent details.",
].join(" ");

/**
 * Classifies one observed caller utterance into an untrusted, typed proposal.
 * Input: `"At 15th and Pine"` with an active pothole draft needing location.
 * Output: `{status:"proposed", proposal:{intent:"service_report", location:"15th and Pine", ...}}` or a safe failure.
 */
export async function proposeCitizenIntent(
  utterance: string,
  apiKey: string | undefined,
  request: typeof fetch = fetch,
  activeDraft?: ActiveDraftContext,
): Promise<IntentProposalResult> {
  const currentUtterance = utterance.trim();
  if (
    currentUtterance.length === 0 ||
    currentUtterance.length > MAX_UTTERANCE_LENGTH
  ) {
    return { status: "unavailable", reason: "invalid_utterance" };
  }
  if (!apiKey) {
    return { status: "unavailable", reason: "openai_not_configured" };
  }

  let response: Response;
  try {
    response = await request(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: REASONING_MODEL,
        store: false,
        reasoning: { effort: "none" },
        max_output_tokens: MAX_OUTPUT_TOKENS,
        input: [
          { role: "developer", content: INTENT_INSTRUCTIONS },
          {
            role: "user",
            content: JSON.stringify({
              utterance: currentUtterance,
              activeDraft: activeDraft ?? null,
            }),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "citizen_intent",
            strict: true,
            schema: INTENT_SCHEMA,
          },
        },
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
    return { status: "unavailable", reason: "invalid_proposal" };
  }
  if (!isRecord(body) || body.status !== "completed") {
    return { status: "unavailable", reason: "openai_response_incomplete" };
  }
  const messages = Array.isArray(body.output)
    ? body.output.filter(
        (item): item is Record<string, unknown> =>
          isRecord(item) && item.type === "message",
      )
    : [];
  if (messages.length !== 1 || !Array.isArray(messages[0]?.content)) {
    return { status: "unavailable", reason: "invalid_proposal" };
  }
  const content = messages[0].content;
  if (
    content.some((item: unknown) => isRecord(item) && item.type === "refusal")
  ) {
    return { status: "unavailable", reason: "openai_refused" };
  }
  const outputText = content.filter(
    (item: unknown): item is Record<string, unknown> =>
      isRecord(item) && item.type === "output_text",
  );
  if (outputText.length !== 1 || typeof outputText[0]?.text !== "string") {
    return { status: "unavailable", reason: "invalid_proposal" };
  }

  try {
    const proposal = parseProposal(JSON.parse(outputText[0].text), activeDraft);
    return proposal
      ? { status: "proposed", proposal }
      : { status: "unavailable", reason: "invalid_proposal" };
  } catch {
    return { status: "unavailable", reason: "invalid_proposal" };
  }
}

/** Input: a report follow-up with no type and an active pothole draft. Output: a validated proposal for that draft. */
function parseProposal(
  value: unknown,
  activeDraft?: ActiveDraftContext,
): CitizenIntentProposal | null {
  if (!isRecord(value)) return null;
  const keys = INTENT_SCHEMA.required;
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  ) {
    return null;
  }
  const { intent, requestType } = value;
  if (!INTENTS.includes(intent as CitizenIntent)) return null;
  if (
    requestType !== null &&
    !REQUEST_TYPES.includes(requestType as RequestType)
  ) {
    return null;
  }
  const location = parseOptionalText(value.location);
  const description = parseOptionalText(value.description);
  const query = parseOptionalText(value.query);
  if (
    location === undefined ||
    description === undefined ||
    query === undefined
  ) {
    return null;
  }
  const isInformationRequest =
    intent === "municipal_code" ||
    intent === "city_information" ||
    intent === "city_event";
  if (
    (intent === "service_report" && requestType === null && !activeDraft) ||
    (isInformationRequest && query === null)
  ) {
    return null;
  }
  return {
    intent: intent as CitizenIntent,
    requestType: requestType as RequestType | null,
    location,
    description,
    query,
  };
}

/** Input: `" 15th and Pine "`. Output: `"15th and Pine"`; invalid text returns `undefined`. */
function parseOptionalText(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length > 0 && text.length <= MAX_PROPOSAL_TEXT_LENGTH
    ? text
    : undefined;
}

/** Input: `{intent:"unclear"}`. Output: `true`; arrays and null return `false`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
