/**
 * Reviewed knowledge handlers.
 * Answers the reviewed municipal-code and city-service examples from checked-in
 * evidence and delegates event questions to the live cached calendar provider.
 */
import type {
  BoulderEventOccurrence,
  CityEventsProvider,
} from "../../adapters/boulder/events.js";
import {
  addLocalDays,
  formatShortLocalDate,
  isValidLocalDate,
  localDateIn,
  utcDate,
} from "../../core/date-time.js";
import type {
  AgentSourceCard,
  AgentToolHandlers,
  AgentToolResult,
} from "./agent-tools.js";

type ReviewedAnswer = Readonly<{
  status: "answered";
  coverage: "reviewed_example" | "live_official_source";
  answer: string;
  sources: readonly AgentSourceCard[];
  limitations: readonly string[];
}>;

type LimitedCoverage = Readonly<{
  status: "limited_coverage";
  coverage: "reviewed_examples_only";
  reason: "unsupported_query" | "source_unavailable";
  supportedTopics: readonly string[];
}>;

type ReviewedKnowledgeResult = ReviewedAnswer | LimitedCoverage;

const SUPPORTED_TOPICS = [
  "BRC 8-3-9 glass containers in parks/open space",
  "Boulder pothole reporting information",
  "Upcoming events from the official Boulder calendar",
] as const;

const EVENTS_WINDOW_DAYS = 14;
const MAX_EVENT_ANSWERS = 3;
const BOULDER_TIME_ZONE = "America/Denver";

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

const EVENTS_LISTING_SOURCE: AgentSourceCard = {
  title: "City of Boulder Events Calendar",
  url: "https://bouldercolorado.gov/events",
  kind: "city_event",
  verifiedOn: "live_fetch",
  note: "Official city calendar listing fetched and parsed at answer time.",
};

const GLASS_CONTAINER_ANSWER =
  "BRC 8-3-9 prohibits glass bottles and glass containers in city parks, parkways, recreation areas, and open space. The reviewed code includes an exception for a container holding prescription medication.";

const POTHOLE_ANSWER =
  "Boulder's Transportation Maintenance page directs pothole reports through the city's online request path and says to include the location, such as an address or intersection, and a description of the issue.";

const EMPTY_EVENTS_ANSWER =
  "No Boulder events appear on the official calendar in the checked date range.";

const EMPTY_NAMED_EVENTS_ANSWER =
  "No event by that name appears on the official city calendar in the checked window.";

/**
 * Creates reviewed local knowledge handlers for the P0 examples plus a live
 * cached official-calendar event path.
 * Input: a server clock and the live-events provider.
 * Output: handlers for code/service answers and bounded live event answers.
 */
export function createKnowledgeToolHandlers(
  clock: () => Date = () => new Date(),
  events: CityEventsProvider,
): Pick<
  AgentToolHandlers,
  "lookupMunicipalCode" | "lookupCityInformation" | "findCityEvents"
> {
  return {
    lookupMunicipalCode: async ({ query }) =>
      matchesGlassContainerQuery(query)
        ? answered(
            GLASS_CONTAINER_ANSWER,
            [GLASS_CONTAINER_SOURCE],
            [
              "This reviewed slice covers only BRC 8-3-9, not the full municipal code.",
            ],
          )
        : limitedCoverage("unsupported_query"),
    lookupCityInformation: async ({ query }) =>
      matchesPotholeQuery(query)
        ? answered(
            POTHOLE_ANSWER,
            [POTHOLE_SOURCE],
            ["This is service guidance, not a municipal-code citation."],
          )
        : limitedCoverage("unsupported_query"),
    findCityEvents: async ({ query, title, startDate, endDate }) => {
      if (hasUnverifiableEventQualifier(query)) {
        return limitedCoverage("unsupported_query");
      }
      if (startDate && !isValidLocalDate(startDate)) {
        return limitedCoverage("unsupported_query");
      }
      if (endDate && !isValidLocalDate(endDate)) {
        return limitedCoverage("unsupported_query");
      }
      const today = boulderToday(clock);
      const rangeStart = startDate ?? today;
      const rangeEnd = endDate ?? addLocalDays(today, EVENTS_WINDOW_DAYS);
      if (rangeStart > rangeEnd) {
        return limitedCoverage("unsupported_query");
      }
      const result = await events.upcomingEvents({
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      });
      if (result.status !== "ok") {
        return limitedCoverage("source_unavailable");
      }
      const upcoming = result.occurrences
        .filter(
          (occurrence) =>
            occurrence.date >= today &&
            occurrence.date >= rangeStart &&
            occurrence.date <= rangeEnd,
        )
        .sort((a, b) => a.date.localeCompare(b.date));
      if (title) {
        const named = upcoming.filter((occurrence) =>
          matchesEventTitle(title, occurrence),
        );
        const shownNamed = named.slice(0, MAX_EVENT_ANSWERS);
        if (shownNamed.length === 0) {
          return answered(
            EMPTY_NAMED_EVENTS_ANSWER,
            [eventsListingSource(result.fetchedAtUtc)],
            [
              "The calendar may still list the event outside the checked window or under a different name.",
            ],
            "live_official_source",
          );
        }
        const namedLines = shownNamed.map(formatEventLine);
        return answered(
          `Here's what the city calendar shows for that: ${namedLines.join(" ")}`,
          shownNamed.map((occurrence) =>
            eventSourceCard(occurrence, result.fetchedAtUtc),
          ),
          [
            "Times and cancellations may appear only on the event's official detail page.",
          ],
          "live_official_source",
        );
      }
      const shown = upcoming.slice(0, MAX_EVENT_ANSWERS);
      if (shown.length === 0) {
        return answered(
          EMPTY_EVENTS_ANSWER,
          [eventsListingSource(result.fetchedAtUtc)],
          [
            "An empty listing result is not proof that no events exist; check the official calendar.",
          ],
          "live_official_source",
        );
      }
      const lines = shown.map(formatEventLine);
      return answered(
        `Upcoming events on the city calendar: ${lines.join(" ")}`,
        shown.map((occurrence) =>
          eventSourceCard(occurrence, result.fetchedAtUtc),
        ),
        [
          "Times and cancellations may appear only on each event's official detail page.",
          "This answer covers a bounded window of the official calendar, not every city event.",
        ],
        "live_official_source",
      );
    },
  };
}

/**
 * Builds a supported answer with its source cards.
 * Input: `"answer"`, source card(s), `["limited"]`, and a coverage label.
 * Output: `{status:"answered", coverage, answer, sources, limitations}`.
 */
function answered(
  answer: string,
  sources: readonly AgentSourceCard[],
  limitations: readonly string[],
  coverage: ReviewedAnswer["coverage"] = "reviewed_example",
): AgentToolResult {
  return {
    status: "answered",
    coverage,
    answer,
    sources,
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
 * Rejects a query that embeds an explicit date or a status check the listing
 * cannot verify. Relative phrases ("this week") are allowed because the
 * handler uses its own trusted window, and caller-stated dates travel in
 * startDate/endDate. Input: `"events on 2026-09-24"`. Output: `true`.
 */
function hasUnverifiableEventQualifier(query: string): boolean {
  const text = normalizeQuery(query);
  return (
    /\d/.test(text) ||
    /\b(cancelled|canceled|postponed|rescheduled|status)\b/.test(text) ||
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/.test(
      text,
    )
  );
}

/**
 * Returns today's local date in Boulder using the trusted server clock.
 * Input: a clock at `2026-09-17T01:00:00Z`. Output: `"2026-09-16"`.
 */
function boulderToday(clock: () => Date): string {
  return localDateIn(clock(), BOULDER_TIME_ZONE);
}

/**
 * Formats an occurrence for a spoken/screen answer.
 * Input: `{title:"City Council Meeting", date:"2026-09-17", ...}`.
 * Output: `"Thu, Sep 17: City Council Meeting at Penfield Tate II Municipal Building"`.
 */
function formatEventLine(occurrence: BoulderEventOccurrence): string {
  const when = formatShortLocalDate(
    new Date(`${occurrence.date}T12:00:00Z`),
    BOULDER_TIME_ZONE,
  );
  const location =
    occurrence.locationText?.toLowerCase() === "virtual"
      ? " (virtual)"
      : occurrence.locationText
        ? ` at ${occurrence.locationText}`
        : "";
  return `${when}: ${occurrence.title}${location}`;
}

/**
 * Detects City Council series events by their official calendar title.
 * Input: `"City Council Study Session"`. Output: `true`.
 */
/**
 * Matches a caller-named event against a calendar occurrence. The model
 * supplies the name; the server only checks that every significant word of it
 * appears in the stored title, so no per-city word list is needed.
 * Input: `"city council"` and `"City Council Study Session"`. Output: `true`.
 */
function matchesEventTitle(
  title: string,
  occurrence: BoulderEventOccurrence,
): boolean {
  const words = normalizeQuery(title)
    .split(/\s+/)
    .filter((word) => word.length > 2);
  if (words.length === 0) return false;
  const haystack = normalizeQuery(occurrence.title);
  return words.every((word) => haystack.includes(word));
}

/**
 * Builds the source card for one parsed calendar occurrence.
 * Input: an occurrence and the fetch timestamp.
 * Output: `{kind:"city_event", verifiedOn: fetch date, ...}`.
 */
function eventSourceCard(
  occurrence: BoulderEventOccurrence,
  fetchedAtUtc: string,
): AgentSourceCard {
  const fetchedOn = utcDate(new Date(fetchedAtUtc));
  const note =
    occurrence.status === "unknown"
      ? "Official calendar listing; times and cancellations may appear on the detail page."
      : `Official calendar listing marks this event ${occurrence.status}.`;
  return {
    title: occurrence.title,
    url: occurrence.detailUrl,
    kind: "city_event",
    verifiedOn: fetchedOn,
    note,
  };
}

/**
 * Builds the listing-level source card for calendar answers.
 * Input: the fetch timestamp. Output: a `city_event` source card.
 */
function eventsListingSource(fetchedAtUtc: string): AgentSourceCard {
  return {
    ...EVENTS_LISTING_SOURCE,
    verifiedOn: utcDate(new Date(fetchedAtUtc)),
  };
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
 * Normalizes model-controlled query text for deterministic matching.
 * Input: `"  Glass in PARKS? "`. Output: `"glass in parks?"`.
 */
function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}
