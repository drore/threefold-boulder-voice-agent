/**
 * Website page selector.
 * A small model call that chooses which official candidate page best answers
 * the caller's question. Retrieval stays deterministic (the sitemap matcher
 * proposes candidates); the selector may only return one of them, so it can
 * never introduce an arbitrary URL.
 */
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_TOKENS = 120;

export type PageSelectionInput = Readonly<{
  query: string;
  candidates: readonly string[];
}>;

export type PageSelector = (
  input: PageSelectionInput,
) => Promise<string | null>;

const SELECTION_SCHEMA = {
  type: "object",
  properties: { url: { type: ["string", "null"] } },
  required: ["url"],
  additionalProperties: false,
} as const;

const SELECTION_INSTRUCTIONS = [
  "Choose the official city page that best answers the caller's question.",
  "Return exactly one of the candidate URLs, or null when none of them is relevant.",
  "Judge from the URL paths; the most specific page for the question wins.",
  "When the question asks how to register, join, apply, or sign up, prefer the candidate whose path names that action.",
  "Never invent a URL and never choose a page that only shares a city name.",
].join(" ");

/**
 * Creates the model-backed page selector.
 * Input: the API key and optional model/fetch overrides.
 * Output: a selector that returns a candidate URL or null, or null on failure.
 */
export function createPageSelector(options: {
  apiKey: string | undefined;
  model: string;
  request?: typeof fetch;
}): PageSelector {
  const request = options.request ?? fetch;
  const model = options.model;
  return async ({ query, candidates }) => {
    if (!options.apiKey || candidates.length === 0) return null;
    let response: Response;
    try {
      response = await request(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          store: false,
          reasoning: { effort: "none" },
          max_output_tokens: MAX_OUTPUT_TOKENS,
          input: [
            { role: "developer", content: SELECTION_INSTRUCTIONS },
            {
              role: "user",
              content: JSON.stringify({ query, candidates }),
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "page_selection",
              strict: true,
              schema: SELECTION_SCHEMA,
            },
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return null;
    }
    if (!response.ok) return null;
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return null;
    }
    const text = extractOutputText(body);
    if (text === null) return null;
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null) return null;
      const url = (parsed as { url?: unknown }).url;
      return typeof url === "string" ? url : null;
    } catch {
      return null;
    }
  };
}

/** Input: a Responses envelope. Output: its single output text, or `null`. */
function extractOutputText(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const output = (body as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (typeof item !== "object" || item === null) continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (
        typeof part === "object" &&
        part !== null &&
        (part as { type?: unknown }).type === "output_text" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}
