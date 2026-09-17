/**
 * Live city website lookup tests.
 * Fixture-based checks for keyword extraction, sitemap parsing, URL scoring,
 * page extraction, and the provider's cache and fail-closed behavior. No
 * network access: the fetch function is injected.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createCityWebsiteProvider,
  extractKeywords,
  extractPageText,
  parseSitemap,
  scoreUrlMatch,
} from "../../src/adapters/city-website/website.js";

const BASE = "https://example.gov";

const SITEMAP_INDEX = `<?xml version="1.0"?>
<sitemapindex>
  <sitemap><loc>${BASE}/sitemap.xml?page=1</loc></sitemap>
</sitemapindex>`;

const SITEMAP_PAGE = `<?xml version="1.0"?>
<urlset>
  <loc>${BASE}/services/parking</loc>
  <loc>${BASE}/services/neighborhood-parking-permits</loc>
  <loc>${BASE}/locations/boulder-reservoir</loc>
  <loc>${BASE}/boulder-reservoir-cafe</loc>
  <loc>${BASE}/boulder-reservoir-general-rules-and-faqs</loc>
  <loc>${BASE}/events/digital-permitting-town-hall</loc>
  <loc>${BASE}/services/parking-guide.pdf</loc>
  <loc>https://other.example.net/services/parking</loc>
</urlset>`;

const PARKING_PAGE = `<!doctype html><html><head><title>Parking | Example</title></head>
<body><nav>Menu</nav><main>
<h1>Parking &amp; Access Management</h1>
<h2>On-Street Rates &amp; Hours</h2>
<p>On-street parking is free for the first 15 minutes.</p>
<p>Pay stations accept the ParkMobile app.</p>
<script>tracker()</script>
</main><footer>Footer text</footer></body></html>`;

describe("city website matching", () => {
  it("extracts meaningful keywords without stopwords", () => {
    expect(extractKeywords("Where can I park downtown?")).toEqual([
      "park",
      "downtown",
    ]);
    expect(extractKeywords("the a of")).toEqual([]);
  });

  it("scores service pages above unrelated or excluded paths", () => {
    expect(scoreUrlMatch(`${BASE}/services/parking`, ["park"])).toBeGreaterThan(
      scoreUrlMatch(`${BASE}/government/board/meeting`, ["park"]),
    );
    expect(scoreUrlMatch(`${BASE}/events/parking-day`, ["park"])).toBe(0);
    expect(scoreUrlMatch(`${BASE}/services/parking-guide.pdf`, ["park"])).toBe(
      0,
    );
  });

  it("prefers the page whose slug is the whole phrase", () => {
    const keywords = ["boulder", "reservoir"];
    expect(
      scoreUrlMatch(
        "https://example.gov/locations/boulder-reservoir",
        keywords,
      ),
    ).toBeGreaterThan(
      scoreUrlMatch("https://example.gov/boulder-reservoir-cafe", keywords),
    );
    expect(
      scoreUrlMatch(
        "https://example.gov/boulder-reservoir-general-rules-and-faqs",
        keywords,
      ),
    ).toBeLessThan(
      scoreUrlMatch(
        "https://example.gov/locations/boulder-reservoir",
        keywords,
      ),
    );
  });

  it("keeps only same-host page URLs from a sitemap document", () => {
    const urls = parseSitemap(SITEMAP_PAGE, BASE);
    expect(urls).toEqual([
      `${BASE}/services/parking`,
      `${BASE}/services/neighborhood-parking-permits`,
      `${BASE}/locations/boulder-reservoir`,
      `${BASE}/boulder-reservoir-cafe`,
      `${BASE}/boulder-reservoir-general-rules-and-faqs`,
    ]);
  });

  it("extracts title and main text without navigation or scripts", () => {
    const { title, text } = extractPageText(
      PARKING_PAGE,
      `${BASE}/services/parking`,
    );
    expect(title).toBe("Parking & Access Management");
    expect(text).toContain("15 minutes");
    expect(text).not.toContain("Menu");
    expect(text).not.toContain("tracker");
    expect(text).not.toContain("Footer text");
  });
});

const RESERVOIR_PAGE = `<!doctype html><html><head><title>Boulder Reservoir | City of Boulder</title></head>
<body><main><h1>Boulder Reservoir</h1><p>Swimming, boating, and fishing information for the reservoir.</p></main></body></html>`;

describe("city website provider", () => {
  /** Input: optional failure mode. Output: an injected fetch and its calls. */
  function fetchFixture() {
    const fetchText = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/sitemap.xml"))
        return new Response(SITEMAP_INDEX, { status: 200 });
      if (url.includes("page=1"))
        return new Response(SITEMAP_PAGE, { status: 200 });
      if (url.endsWith("/boulder-reservoir-cafe"))
        return new Response(
          RESERVOIR_PAGE.replace("Boulder Reservoir", "Cafe"),
          { status: 200 },
        );
      if (url.endsWith("/locations/boulder-reservoir"))
        return new Response(RESERVOIR_PAGE, { status: 200 });
      if (url.endsWith("/services/parking"))
        return new Response(PARKING_PAGE, { status: 200 });
      return new Response("missing", { status: 404 });
    });
    return fetchText;
  }

  it("finds and fetches the best matching page, then serves it from cache", async () => {
    const fetchText = fetchFixture();
    const provider = createCityWebsiteProvider({
      baseUrl: BASE,
      fetchText,
      clock: () => new Date("2026-09-17T12:00:00Z"),
    });

    const first = await provider.lookup("where can I park downtown");
    expect(first).toMatchObject({
      status: "found",
      page: {
        url: `${BASE}/services/parking`,
        title: "Parking & Access Management",
        fetchedAtUtc: "2026-09-17T12:00:00.000Z",
      },
    });
    const callsAfterFirst = fetchText.mock.calls.length;

    const second = await provider.lookup("parking downtown");
    expect(second).toMatchObject({ status: "found" });
    expect(fetchText).toHaveBeenCalledTimes(callsAfterFirst);
  });

  it("resolves a location phrase to its canonical page", async () => {
    const provider = createCityWebsiteProvider({
      baseUrl: BASE,
      fetchText: fetchFixture(),
      clock: () => new Date("2026-09-17T12:00:00Z"),
    });
    const result = await provider.lookup(
      "Can you tell me about the Boulder Reservoir?",
    );
    expect(result).toMatchObject({
      status: "found",
      page: { url: `${BASE}/locations/boulder-reservoir` },
    });
  });

  it("lets the selector choose among official candidates", async () => {
    const fetchText = fetchFixture();
    const selectPage = vi.fn(async () => `${BASE}/boulder-reservoir-cafe`);
    const provider = createCityWebsiteProvider({
      baseUrl: BASE,
      fetchText,
      clock: () => new Date("2026-09-17T12:00:00Z"),
      selectPage,
    });
    const result = await provider.lookup("Boulder Reservoir");
    expect(selectPage).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: "found",
      page: { url: `${BASE}/boulder-reservoir-cafe` },
    });
  });

  it("ignores a selector choice that is not an official candidate", async () => {
    const provider = createCityWebsiteProvider({
      baseUrl: BASE,
      fetchText: fetchFixture(),
      clock: () => new Date("2026-09-17T12:00:00Z"),
      selectPage: async () => "https://evil.example/phishing",
    });
    const result = await provider.lookup("Boulder Reservoir");
    expect(result).toMatchObject({
      status: "found",
      page: { url: `${BASE}/locations/boulder-reservoir` },
    });
  });

  it("returns no_match for a topic with no official page", async () => {
    const provider = createCityWebsiteProvider({
      baseUrl: BASE,
      fetchText: fetchFixture(),
      clock: () => new Date("2026-09-17T12:00:00Z"),
    });
    expect(await provider.lookup("chocolate cake recipe")).toEqual({
      status: "no_match",
    });
  });

  it("fails closed when the sitemap is unavailable", async () => {
    const provider = createCityWebsiteProvider({
      baseUrl: BASE,
      fetchText: async () => new Response("nope", { status: 503 }),
      clock: () => new Date("2026-09-17T12:00:00Z"),
    });
    expect(await provider.lookup("parking")).toEqual({
      status: "source_unavailable",
    });
  });

  it("fails closed when the matched page cannot be fetched", async () => {
    const fetchText = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/sitemap.xml"))
        return new Response(SITEMAP_INDEX, { status: 200 });
      if (url.includes("page=1"))
        return new Response(SITEMAP_PAGE, { status: 200 });
      return new Response("missing", { status: 500 });
    });
    const provider = createCityWebsiteProvider({
      baseUrl: BASE,
      fetchText,
      clock: () => new Date("2026-09-17T12:00:00Z"),
    });
    expect(await provider.lookup("parking")).toEqual({
      status: "source_unavailable",
    });
  });
});
