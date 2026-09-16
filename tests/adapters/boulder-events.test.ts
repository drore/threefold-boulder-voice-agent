import { describe, expect, it, vi } from "vitest";
import {
  createBoulderEventsProvider,
  parseBoulderEventsListing,
} from "../../src/adapters/boulder/events.js";

const LISTING_URL = "https://bouldercolorado.gov/events";

const CARD = (
  href: string,
  title: string,
  date: string,
  ...locations: string[]
) => `
<article class="click-region event-card" data-href="${href}">
  <div class="event-card__content">
    <h3 class="event-card__title">
      <a href="${href}" class="click-region__target"><span>${title}</span></a>
    </h3>
    <div class="event-card__subtitle">
      <p>${locations.map((location) => `<span>${location}</span>`).join("")}</p>
    </div>
  </div>
  <time class="event-card__date" datetime="${date}">
    <span class="day">Thu</span><span class="month">Sep 17</span><span class="year">2026</span>
  </time>
</article>`;

describe("parseBoulderEventsListing", () => {
  it("parses titled dated cards with locations and detail URLs", () => {
    const html = [
      CARD(
        "/events/city-council-meeting-110",
        "City Council Meeting",
        "2026-09-17",
        "Penfield Tate II Municipal Building",
      ),
      CARD(
        "/events/water-board-meeting-48",
        "Water Resources Advisory Board (WRAB) Meeting",
        "2026-09-21",
        "Virtual",
      ),
      CARD("/events/no-date-card", "Event Without Date", ""),
    ].join("");

    const occurrences = parseBoulderEventsListing(html, LISTING_URL);

    expect(occurrences).toHaveLength(2);
    expect(occurrences[0]).toEqual({
      title: "City Council Meeting",
      detailUrl: "https://bouldercolorado.gov/events/city-council-meeting-110",
      date: "2026-09-17",
      locationText: "Penfield Tate II Municipal Building",
      status: "unknown",
    });
    expect(occurrences[1]).toMatchObject({
      title: "Water Resources Advisory Board (WRAB) Meeting",
      date: "2026-09-21",
      locationText: "Virtual",
      status: "unknown",
    });
  });

  it("decodes entities and records cancellation wording from the card", () => {
    const html = [
      CARD(
        "/events/facilities-fleet-open-house",
        "Facilities &amp; Fleet Open House",
        "2026-09-30",
        "Fleet Services Building",
      ),
      CARD(
        "/events/downtown-commission-meeting-31",
        "Downtown Management Commission Meeting - CANCELLED",
        "2026-09-22",
        "Virtual",
      ),
      CARD("/events/art-event-9", "Artist Meetup (postponed)", "2026-10-01"),
    ].join("");

    const occurrences = parseBoulderEventsListing(html, LISTING_URL);

    expect(occurrences[0]?.title).toBe("Facilities & Fleet Open House");
    expect(occurrences[1]?.status).toBe("cancelled");
    expect(occurrences[2]?.status).toBe("postponed");
  });
});

describe("createBoulderEventsProvider", () => {
  it("fetches on first use and serves the cache inside its TTL", async () => {
    let now = new Date("2026-09-16T12:00:00Z");
    const fetchHtml = vi.fn(
      async () =>
        new Response(
          CARD(
            "/events/city-council-meeting-110",
            "City Council Meeting",
            "2026-09-17",
            "Penfield Tate II Municipal Building",
          ),
          { status: 200 },
        ),
    );
    const provider = createBoulderEventsProvider({
      fetchHtml,
      clock: () => now,
      ttlMs: 24 * 60 * 60 * 1000,
      maxPages: 1,
    });

    const first = await provider.upcomingEvents({});
    expect(first).toMatchObject({
      status: "ok",
      occurrences: [{ title: "City Council Meeting" }],
      fetchedAtUtc: "2026-09-16T12:00:00.000Z",
      expiresAtUtc: "2026-09-17T12:00:00.000Z",
    });
    expect(fetchHtml).toHaveBeenCalledTimes(1);

    now = new Date("2026-09-17T11:59:00Z");
    const cached = await provider.upcomingEvents({});
    expect(cached).toMatchObject({
      status: "ok",
      occurrences: [{ title: "City Council Meeting" }],
    });
    expect(fetchHtml).toHaveBeenCalledTimes(1);
  });

  it("refetches after the cache expires and fails closed when the source breaks", async () => {
    let now = new Date("2026-09-16T12:00:00Z");
    let reachable = true;
    const fetchHtml = vi.fn(async () =>
      reachable
        ? new Response(
            CARD(
              "/events/city-council-meeting-110",
              "City Council Meeting",
              "2026-09-17",
            ),
            { status: 200 },
          )
        : new Response("upstream unavailable", { status: 502 }),
    );
    const provider = createBoulderEventsProvider({
      fetchHtml,
      clock: () => now,
      ttlMs: 1_000,
      maxPages: 1,
    });

    await provider.upcomingEvents({});
    now = new Date("2026-09-16T12:00:02Z");
    reachable = false;
    const stale = await provider.upcomingEvents({});
    expect(stale).toEqual({ status: "source_unavailable" });
    expect(fetchHtml).toHaveBeenCalledTimes(2);
  });

  it("stops paginating when a page has no event cards", async () => {
    const fetchHtml = vi.fn(
      async (input: URL | RequestInfo) =>
        new Response(
          String(input).includes("page=0")
            ? CARD("/events/one-event", "Only Event", "2026-09-17")
            : "<html><body>no cards</body></html>",
          { status: 200 },
        ),
    );
    const provider = createBoulderEventsProvider({
      fetchHtml,
      clock: () => new Date("2026-09-16T12:00:00Z"),
      maxPages: 3,
    });

    await provider.upcomingEvents({});
    expect(fetchHtml).toHaveBeenCalledTimes(2);
  });
});
