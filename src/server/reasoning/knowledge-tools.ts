/**
 * Knowledge tool handlers.
 * Answers reviewed code/service questions from the database corpus and event
 * questions from the live cached calendar. No city-specific content lives here:
 * settings, answers, sources, and matching terms all come from the configured
 * city data.
 */
import type {
  CityEventOccurrence,
  CityEventsProvider,
} from "../../adapters/city-website/events.js";
import type { CityKnowledgeReader, KnowledgeEntry } from "../../core/city.js";
import { matchesKnowledgeEntry } from "../../core/city.js";
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
} from "./tool-definitions.js";

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
  "the reviewed city-code example",
  "the reviewed city-service guidance",
  "official city-calendar events",
] as const;

const EVENTS_WINDOW_DAYS = 14;
const MAX_EVENT_ANSWERS = 3;

const EMPTY_EVENTS_ANSWER =
  "No events appear on the official city calendar in the checked date range.";

const EMPTY_NAMED_EVENTS_ANSWER =
  "No event by that name appears on the official city calendar in the checked window.";

export type KnowledgeToolOptions = Readonly<{
  clock: () => Date;
  events: CityEventsProvider;
  knowledge: CityKnowledgeReader;
  cityId: string;
  timeZone: string;
  eventsListingUrl: string;
}>;

/**
 * Creates the knowledge handlers for the configured city.
 * Input: server clock, live-events provider, and the city's database corpus.
 * Output: handlers for reviewed answers and bounded live event answers.
 */
export function createKnowledgeToolHandlers(
  options: KnowledgeToolOptions,
): Pick<
  AgentToolHandlers,
  "lookupMunicipalCode" | "lookupCityInformation" | "findCityEvents"
> {
  const { clock, events, knowledge, cityId, timeZone, eventsListingUrl } =
    options;

  /** Input: a tool and query. Output: a reviewed answer or an explicit coverage limit. */
  async function answerReviewed(
    tool: KnowledgeEntry["tool"],
    query: string,
  ): Promise<AgentToolResult> {
    const loaded = await knowledge.list(cityId);
    if (loaded.status !== "available") {
      return limitedCoverage("source_unavailable");
    }
    const entry = loaded.entries.find(
      (candidate) =>
        candidate.tool === tool && matchesKnowledgeEntry(candidate, query),
    );
    return entry
      ? answered(entry.answer, [sourceCard(entry)], entry.limitations)
      : limitedCoverage("unsupported_query");
  }

  return {
    lookupMunicipalCode: async ({ query }) =>
      answerReviewed("lookupMunicipalCode", query),
    lookupCityInformation: async ({ query }) =>
      answerReviewed("lookupCityInformation", query),
    findCityEvents: async ({ query, title, startDate, endDate }) => {
      // A caller-named title disambiguates the request, so date/status wording
      // in the free-text query must not reject it.
      if (!title && hasUnverifiableEventQualifier(query)) {
        return limitedCoverage("unsupported_query");
      }
      if (startDate && !isValidLocalDate(startDate)) {
        return limitedCoverage("unsupported_query");
      }
      if (endDate && !isValidLocalDate(endDate)) {
        return limitedCoverage("unsupported_query");
      }
      const today = localDateIn(clock(), timeZone);
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
        const shownNamed = upcoming
          .filter((occurrence) => matchesEventTitle(title, occurrence))
          .slice(0, MAX_EVENT_ANSWERS);
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
        return answered(
          `Here's what the city calendar shows for that: ${shownNamed
            .map((occurrence) => formatEventLine(occurrence, timeZone))
            .join(" ")}`,
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
      return answered(
        `Upcoming events on the city calendar: ${shown
          .map((occurrence) => formatEventLine(occurrence, timeZone))
          .join(" ")}`,
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

  /**
   * Builds a supported answer with its source cards.
   * Input: `"answer"`, source card(s), `["limited"]`.
   * Output: `{status:"answered", coverage:"reviewed_example", ...}`.
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
   * Builds the honest response for questions outside the reviewed corpus.
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

  /** Input: a reviewed entry. Output: its source card for the UI and speech. */
  function sourceCard(entry: KnowledgeEntry): AgentSourceCard {
    return {
      title: entry.source.title,
      url: entry.source.url,
      kind: entry.source.kind,
      verifiedOn: entry.source.verifiedOn,
      note: entry.source.note,
      ...(entry.source.excerpt ? { excerpt: entry.source.excerpt } : {}),
    };
  }

  /** Input: an occurrence and its fetch time. Output: a `city_event` source card. */
  function eventSourceCard(
    occurrence: CityEventOccurrence,
    fetchedAtUtc: string,
  ): AgentSourceCard {
    return {
      title: occurrence.title,
      url: occurrence.detailUrl,
      kind: "city_event",
      verifiedOn: utcDate(new Date(fetchedAtUtc)),
      note:
        occurrence.status === "unknown"
          ? "Official calendar listing; times and cancellations may appear on the detail page."
          : `Official calendar listing marks this event ${occurrence.status}.`,
    };
  }

  /** Input: the fetch time. Output: the listing source card for calendar answers. */
  function eventsListingSource(fetchedAtUtc: string): AgentSourceCard {
    return {
      title: "Official city events calendar",
      url: eventsListingUrl,
      kind: "city_event",
      verifiedOn: utcDate(new Date(fetchedAtUtc)),
      note: "Official city calendar listing fetched and parsed at answer time.",
    };
  }
}

/**
 * Matches a caller-named event against a calendar occurrence. The model
 * supplies the name; the server only checks that every significant word of it
 * appears in the stored title, so no per-city word list is needed.
 * Input: `"city council"` and `"City Council Study Session"`. Output: `true`.
 */
function matchesEventTitle(
  title: string,
  occurrence: CityEventOccurrence,
): boolean {
  const words = title
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 2 &&
        !/\d/.test(word) &&
        !/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/.test(word),
    );
  if (words.length === 0) return false;
  const haystack = occurrence.title.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/**
 * Rejects a query that embeds an explicit date or a status check the listing
 * cannot verify. Relative phrases ("this week") are allowed because the
 * handler uses its own trusted window, and caller-stated dates travel in
 * startDate/endDate. Input: `"events on 2026-09-24"`. Output: `true`.
 */
function hasUnverifiableEventQualifier(query: string): boolean {
  const text = query.trim().toLowerCase();
  return (
    /\d/.test(text) ||
    /\b(cancelled|canceled|postponed|rescheduled|status)\b/.test(text) ||
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/.test(
      text,
    )
  );
}

/**
 * Formats an occurrence for a spoken/screen answer.
 * Input: `{title:"City Council Meeting", date:"2026-09-17", ...}` and a zone.
 * Output: `"Thu, Sep 17: City Council Meeting at Penfield Tate II Municipal Building"`.
 */
function formatEventLine(
  occurrence: CityEventOccurrence,
  timeZone: string,
): string {
  const when = formatShortLocalDate(
    new Date(`${occurrence.date}T12:00:00Z`),
    timeZone,
  );
  const location =
    occurrence.locationText?.toLowerCase() === "virtual"
      ? " (virtual)"
      : occurrence.locationText
        ? ` at ${occurrence.locationText}`
        : "";
  return `${when}: ${occurrence.title}${location}`;
}
