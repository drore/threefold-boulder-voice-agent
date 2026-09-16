import type {
  AgentSourceCard,
  AgentToolHandlers,
  AgentToolResult,
} from "./agent-tools.js";

type ReviewedAnswer = Readonly<{
  status: "answered";
  coverage: "reviewed_example";
  answer: string;
  sources: readonly AgentSourceCard[];
  limitations: readonly string[];
}>;

type LimitedCoverage = Readonly<{
  status: "limited_coverage";
  coverage: "reviewed_examples_only";
  reason: "unsupported_query" | "past_or_stale_event";
  supportedTopics: readonly string[];
}>;

type ReviewedKnowledgeResult = ReviewedAnswer | LimitedCoverage;

const SUPPORTED_TOPICS = [
  "BRC 8-3-9 glass containers in parks/open space",
  "Boulder pothole reporting information",
  "City Council Study Session on 2026-09-24",
] as const;

const GLASS_CONTAINER_SOURCE: AgentSourceCard = {
  title: "Boulder Revised Code 8-3-9: Glass Bottles Prohibited",
  url: "https://library.municode.com/co/boulder/codes/municipal_code?nodeId=TIT8PAOPSPSTPUWA_CH3PAREPESPMOPA_8-3-9GLBOPR",
  kind: "municipal_code",
  verifiedOn: "2026-09-16",
  note: "Supplement 167 Update 3; ordinances effective through 2026-07-30.",
  excerpt:
    "No person shall carry or possess any glass bottle or other glass container, except one containing prescription medication",
};

const POTHOLE_SOURCE: AgentSourceCard = {
  title: "City of Boulder Transportation Maintenance",
  url: "https://bouldercolorado.gov/services/transportation-maintenance",
  kind: "city_website",
  verifiedOn: "2026-09-16",
  note: "Official city service page reviewed for pothole intake guidance.",
};

const COUNCIL_EVENT_SOURCE: AgentSourceCard = {
  title: "City Council Study Session",
  url: "https://bouldercolorado.gov/events/city-council-study-session-61",
  kind: "city_event",
  verifiedOn: "2026-09-16",
  note: "Official city event detail page.",
};

const COUNCIL_EVENT_DATE = "2026-09-24";
const COUNCIL_EVENT_STALE_AFTER_UTC = "2026-09-17T00:00:00.000Z";
const COUNCIL_EVENT_END_UTC = "2026-09-25T03:00:00.000Z";

const GLASS_CONTAINER_ANSWER =
  "BRC 8-3-9 prohibits glass bottles and glass containers in city parks, parkways, recreation areas, and open space. The reviewed code includes an exception for a container holding prescription medication.";

const POTHOLE_ANSWER =
  "Boulder's Transportation Maintenance page directs pothole reports through the city's online request path and says to include the location, such as an address or intersection, and a description of the issue.";

const COUNCIL_EVENT_ANSWER =
  "The reviewed City Council Study Session is scheduled for Thursday, 2026-09-24 from 18:00 to 21:00 America/Denver, and the city detail page lists it as virtual.";

/**
 * Creates reviewed local knowledge handlers for the three P0 examples.
 * Input: a server clock fixed at `2026-09-16T12:00:00Z`.
 * Output: handlers that answer the reviewed code, service, and event examples.
 */
export function createReviewedKnowledgeToolHandlers(
  clock: () => Date = () => new Date(),
): Pick<
  AgentToolHandlers,
  "lookupMunicipalCode" | "lookupCityInformation" | "findCityEvents"
> {
  return {
    lookupMunicipalCode: async ({ query }) =>
      matchesGlassContainerQuery(query)
        ? answered(GLASS_CONTAINER_ANSWER, GLASS_CONTAINER_SOURCE, [
            "This reviewed slice covers only BRC 8-3-9, not the full municipal code.",
          ])
        : limitedCoverage("unsupported_query"),
    lookupCityInformation: async ({ query }) =>
      matchesPotholeQuery(query)
        ? answered(POTHOLE_ANSWER, POTHOLE_SOURCE, [
            "This is service guidance, not a municipal-code citation.",
          ])
        : limitedCoverage("unsupported_query"),
    findCityEvents: async ({ query, startDate, endDate }) => {
      if (!matchesCouncilEventQuery(query)) {
        return limitedCoverage("unsupported_query");
      }
      if (hasUnsupportedEventQualifier(query)) {
        return limitedCoverage("unsupported_query");
      }
      if (!dateRangeIncludesCouncilEvent(startDate, endDate)) {
        return limitedCoverage("unsupported_query");
      }
      const nowMs = clock().getTime();
      if (
        nowMs >= Date.parse(COUNCIL_EVENT_STALE_AFTER_UTC) ||
        nowMs > Date.parse(COUNCIL_EVENT_END_UTC)
      ) {
        return limitedCoverage("past_or_stale_event");
      }
      return answered(COUNCIL_EVENT_ANSWER, COUNCIL_EVENT_SOURCE, [
        "This result is a reviewed example and does not enumerate every Boulder event.",
      ]);
    },
  };
}

/**
 * Builds a supported answer with one reviewed source card.
 * Input: `"answer"`, `{kind:"city_event"}`, `["limited"]`.
 * Output: `{status:"answered", coverage:"reviewed_example", ...}`.
 */
function answered(
  answer: string,
  source: AgentSourceCard,
  limitations: readonly string[],
): AgentToolResult {
  return {
    status: "answered",
    coverage: "reviewed_example",
    answer,
    sources: [source],
    limitations,
  } satisfies ReviewedKnowledgeResult;
}

/**
 * Builds the honest response for questions outside the reviewed examples.
 * Input: `"unsupported_query"`. Output: `{status:"limited_coverage", ...}`.
 */
function limitedCoverage(reason: LimitedCoverage["reason"]): AgentToolResult {
  return {
    status: "limited_coverage",
    coverage: "reviewed_examples_only",
    reason,
    supportedTopics: SUPPORTED_TOPICS,
  } satisfies ReviewedKnowledgeResult;
}

/**
 * Detects the single supported municipal-code example.
 * Input: `"Can I bring glass to a Boulder park?"`. Output: `true`.
 */
function matchesGlassContainerQuery(query: string): boolean {
  const text = normalizeQuery(query);
  if (
    /\b(repeal|repealed|amend|amended|changed|current|latest|still)\b/.test(
      text,
    )
  ) {
    return false;
  }
  if (text.includes("8-3-9")) return true;
  return (
    (text.includes("glass") || text.includes("bottle")) &&
    (text.includes("park") ||
      text.includes("open space") ||
      text.includes("recreation"))
  );
}

/**
 * Rejects free-text dates and status checks this one-event example cannot verify.
 * Input: `"study session on October 22"`. Output: `true`.
 */
function hasUnsupportedEventQualifier(query: string): boolean {
  const text = normalizeQuery(query);
  return (
    /\d/.test(text) ||
    /\b(today|tomorrow|tonight|this week|next week|this weekend|next weekend|cancelled|canceled|postponed|rescheduled|status)\b/.test(
      text,
    ) ||
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/.test(
      text,
    )
  );
}

/**
 * Checks whether the caller's requested local-date range can include the event.
 * Input: `("2026-09-20", "2026-09-25")`. Output: `true`.
 */
function dateRangeIncludesCouncilEvent(
  startDate?: string,
  endDate?: string,
): boolean {
  if (startDate && !isValidLocalDate(startDate)) return false;
  if (endDate && !isValidLocalDate(endDate)) return false;
  if (startDate && startDate > COUNCIL_EVENT_DATE) return false;
  if (endDate && endDate < COUNCIL_EVENT_DATE) return false;
  return true;
}

/**
 * Validates the local date format used by the event tool.
 * Input: `"2026-02-30"`. Output: `false`.
 */
function isValidLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return (
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day
  );
}

/**
 * Detects the single supported city-service example.
 * Input: `"How do I report a pothole at 15th and Pine?"`. Output: `true`.
 */
function matchesPotholeQuery(query: string): boolean {
  const text = normalizeQuery(query);
  return (
    text.includes("pothole") &&
    /\b(report|submit|request)\b/.test(text) &&
    !/\b(claim|claims|who|person|staff|handles)\b/.test(text)
  );
}

/**
 * Detects the single supported dated event example.
 * Input: `"Any city council events coming up?"`. Output: `true`.
 */
function matchesCouncilEventQuery(query: string): boolean {
  const text = normalizeQuery(query);
  return (
    text.includes("study session") ||
    (text.includes("council") &&
      (text.includes("upcoming") || text.includes("coming up")))
  );
}

/**
 * Normalizes model-controlled query text for deterministic matching.
 * Input: `"  Glass in PARKS? "`. Output: `"glass in parks?"`.
 */
function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}
