import * as cheerio from "cheerio";

/**
 * Live Boulder event source: fetches the official city calendar listing and
 * parses its dated event cards into bounded occurrences, refreshed at most
 * once per cache window. The city website is an external source; its HTML is
 * untrusted data and every parsed value is bounded before it reaches answers.
 */

export type BoulderEventOccurrence = Readonly<{
  title: string;
  detailUrl: string;
  /** Local YYYY-MM-DD from the official calendar card. */
  date: string;
  locationText: string | null;
  status: "cancelled" | "postponed" | "unknown";
}>;

export type CityEventsQueryOptions = Readonly<{
  startDate?: string;
  endDate?: string;
}>;

export type CityEventsQueryResult =
  | {
      status: "ok";
      occurrences: readonly BoulderEventOccurrence[];
      fetchedAtUtc: string;
      expiresAtUtc: string;
    }
  | { status: "source_unavailable" };

export type CityEventsProvider = {
  upcomingEvents(
    options: CityEventsQueryOptions,
  ): Promise<CityEventsQueryResult>;
};

export const BOULDER_EVENTS_LISTING_URL = "https://bouldercolorado.gov/events";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_PAGES = 2;
const MAX_TITLE_LENGTH = 160;
const MAX_LOCATION_LENGTH = 200;

type EventsCache = {
  occurrences: BoulderEventOccurrence[];
  fetchedAtUtc: string;
  expiresAtUtc: string;
};

/**
 * Parses one official calendar listing page into bounded occurrences.
 * Input: listing HTML and the page URL.
 * Output: dated cards with title, detail URL, optional location, and an
 * honest status; malformed cards are skipped, never guessed.
 */
export function parseBoulderEventsListing(
  html: string,
  listingUrl: string,
): BoulderEventOccurrence[] {
  const $ = cheerio.load(html);
  const occurrences: BoulderEventOccurrence[] = [];
  for (const element of $("article.event-card").toArray()) {
    const card = $(element);
    const href = card.attr("data-href");
    const date = card.find("time").attr("datetime");
    const title = card.find("h3").text().replace(/\s+/g, " ").trim();
    const locationParts = card
      .find(".event-card__subtitle span")
      .map((_, span) => $(span).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean);
    if (!href || !title || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      continue;
    }
    const locationText =
      locationParts.length > 0
        ? locationParts.join(", ").slice(0, MAX_LOCATION_LENGTH)
        : null;
    const combined = `${title} ${locationText ?? ""}`.toLowerCase();
    const status = /\bpostponed\b/.test(combined)
      ? "postponed"
      : /\bcancell?ed\b/.test(combined)
        ? "cancelled"
        : "unknown";
    occurrences.push({
      title: title.slice(0, MAX_TITLE_LENGTH),
      detailUrl: new URL(href, listingUrl).toString(),
      date,
      locationText,
      status,
    });
  }
  return occurrences;
}

/**
 * Creates the cached live-events provider.
 * Input: optional injected fetch/clock/bounds for tests.
 * Output: `upcomingEvents` serves a fresh cache inside its TTL; on expiry it
 * refetches the listing and fails closed (`source_unavailable`) on any fetch
 * or parse problem. No stale results are fabricated after the cache expires.
 */
export function createBoulderEventsProvider(
  options: {
    fetchHtml?: typeof fetch;
    clock?: () => Date;
    ttlMs?: number;
    listingUrl?: string;
    maxPages?: number;
  } = {},
): CityEventsProvider {
  const fetchHtml = options.fetchHtml ?? fetch;
  const clock = options.clock ?? (() => new Date());
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const listingUrl = options.listingUrl ?? BOULDER_EVENTS_LISTING_URL;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;

  let cache: EventsCache | null = null;

  async function refresh(): Promise<CityEventsQueryResult> {
    const now = new Date(clock());
    const seen = new Set<string>();
    const occurrences: BoulderEventOccurrence[] = [];
    for (let page = 0; page < maxPages; page += 1) {
      let response: Response;
      try {
        response = await fetchHtml(`${listingUrl}?page=${page}`, {
          headers: { "user-agent": "boulder-municipal-demo/0.1" },
        });
      } catch {
        return { status: "source_unavailable" };
      }
      if (!response.ok) return { status: "source_unavailable" };
      let html: string;
      try {
        html = await response.text();
      } catch {
        return { status: "source_unavailable" };
      }
      const pageOccurrences = parseBoulderEventsListing(html, listingUrl);
      if (pageOccurrences.length === 0) break;
      for (const occurrence of pageOccurrences) {
        if (!seen.has(occurrence.detailUrl)) {
          seen.add(occurrence.detailUrl);
          occurrences.push(occurrence);
        }
      }
    }
    const result: EventsCache = {
      occurrences,
      fetchedAtUtc: now.toISOString(),
      expiresAtUtc: new Date(now.getTime() + ttlMs).toISOString(),
    };
    cache = result;
    return {
      status: "ok",
      occurrences: result.occurrences,
      fetchedAtUtc: result.fetchedAtUtc,
      expiresAtUtc: result.expiresAtUtc,
    };
  }

  return {
    async upcomingEvents() {
      const now = new Date(clock());
      if (cache && now.getTime() < Date.parse(cache.expiresAtUtc)) {
        return {
          status: "ok",
          occurrences: cache.occurrences,
          fetchedAtUtc: cache.fetchedAtUtc,
          expiresAtUtc: cache.expiresAtUtc,
        };
      }
      return refresh();
    },
  };
}
