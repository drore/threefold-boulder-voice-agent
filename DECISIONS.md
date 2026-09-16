---
title: Decision rationale for the Boulder municipal voice agent
version: 1.0-review
last_updated: 2026-09-16
owner: Dror Elovits
---

# Why we chose this design

This file explains our choices for the Threefold assignment so Dror, a reviewer, or a future engineer can understand the reasoning without reading the planning conversation. It records alternatives, costs, failure modes, and conditions for reconsidering each choice.

[SPEC.md](SPEC.md) owns current scope, decisions, proposed defaults, and acceptance criteria. [Component specs](spec/) own contracts; [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) owns sequencing, checks, and commits. This file owns rationale and refers to those documents rather than redefining their behavior.

This is repository engineering documentation. The separate D3 submission writeup remains at most one page and will summarize actual delivered choices and limitations.

**Selected** means agreed direction, not a completed integration. **Planned — feasibility pending** requires prototype evidence. **Recommended** means a proposal awaiting its SPEC review gate. Official-source capabilities and the city's relevant pages have been researched; account access, compatibility, latency, costs, answer quality, and live operation have not been measured in this project. Local Application Core implementation has begun; external actions retain separate gates.

## 1. Why Boulder?

**Status:** Selected. **SPEC:** ADR-001; J1–J3.

**Why:** Boulder provides useful official sources for a small set of realistic resident journeys. Its [transportation page](https://bouldercolorado.gov/services/transportation-maintenance) identifies the department and explains pothole location/description capture. [Park guidance](https://bouldercolorado.gov/general-park-rules-and-regulations) connects everyday questions to municipal-code references. [City contact information](https://bouldercolorado.gov/contact-us), [news](https://bouldercolorado.gov/news), and [events](https://bouldercolorado.gov/events) give us sources for hours and current information. This supports a focused demonstration of all assignment capabilities.

**Alternatives:** Evanston and Palo Alto were considered in the September 14 planning discussion. Boulder was chosen for the balance of understandable source material and manageable workflows. This is a fit judgment for our assignment, not a measured ranking of city data quality.

**Tradeoff:** The current Municode BRC 8-3-9 text is now accessible in a browser, but the application still needs a reviewed passage, amendment refresh, and an answer path. The city's short glass-container guidance omits the code's prescription-medication exception, so website text cannot substitute for actual-code evidence. Two departments also leave legitimate city requests outside our supported scope.

**Reconsider when:** M1 cannot acquire usable actual code or the selected workflows cannot be verified. First investigate another accessible code topic within Boulder; a city/scope change goes to Dror and must retain all mandatory capabilities.

## 2. Why OpenAI?

**Status:** Planned — voice feasibility pending. **SPEC:** ADR-007, ADR-009; Q1.

**Why:** OpenAI is Dror's preferred voice-provider direction. Its documented voice architectures offer a concrete path to keeping spoken interaction separate from application reasoning and tools. GPT-Live supports simultaneous listening/speaking and delegated backend work, which fits a caller adding a pothole detail while a lookup or ticket operation is pending. This architectural fit is the main reason to prototype it. [Official voice architecture guide](https://developers.openai.com/api/docs/guides/voice-agents).

**Alternatives:** Another voice provider integrated with our application-owned ports remains possible. A composed speech-recognition/text-agent/speech-generation stack is also viable. We have not run a comparative vendor benchmark or established that OpenAI is cheapest, fastest, or best across all voices/devices.

**Tradeoff:** Cloud connectivity, access limits, usage costs, provider changes, and speech errors affect the experience. Spoken output is not automatically guaranteed to reproduce backend facts exactly. Choosing OpenAI also leaves implementation work for session context, corrections, and lifecycle handling.

**Reconsider when:** M1 finds blocking access/browser/delegation issues, or measured task quality, latency, reliability, or approved cost is unacceptable. Propose a concrete alternative and run the same contract/task/voice cases. The voice choice does not select the final reasoning model or require all future providers to be OpenAI.

## 3. Why GPT-Live and client delegation?

**Status:** GPT-Live planned; client delegation selected by Dror. Provider feasibility and reasoning model pending M1. **SPEC:** ADR-007; Q1.

**Why:** Our application already needs independently testable reasoning, retrieval, state, and tools. GPT-Live's separate backend architecture fits those responsibilities while conversation continues. Client delegation lets our server choose the reasoning backend/provider, own its context, validate results before returning them, and compare candidate backends later. [Official delegation guide](https://developers.openai.com/api/docs/guides/live-delegation).

**Alternatives:** Responses delegation manages more reasoning/context orchestration with an OpenAI-hosted backend. OpenAI Realtime combines speech, reasoning, and tools in one model session. A chained pipeline exposes intermediate speech/text stages for inspection. All are documented options; application authorization remains necessary with each. [Architecture comparison](https://developers.openai.com/api/docs/guides/voice-agents#choose-the-right-architecture).

**Tradeoff:** Client delegation adds context reconstruction, stale-result handling, cancellation, and integration work. Managed delegation reduces some application orchestration but changes context/provider ownership. A chained pipeline adds speech-stage coordination. None is automatically superior for every task.

**Reconsider when:** M1 demonstrates blocking access, latency, reliability, or a materially better fit for another mode. Exact wording requirements would need a more controlled playback design. Recency alone is insufficient reason to select or migrate a model.

## 4. Why Supabase?

**Status:** Selected application persistence direction. **SPEC:** ADR-004, ADR-014; Q8.

**Why:** Persistence spans conversations, configuration, confirmed drafts, operations/attempts, and external receipts. Relational constraints and transactions match those relationships and race conditions. Supabase provides PostgreSQL with a [local development stack](https://supabase.com/docs/guides/local-development) and a managed-cloud path, fitting local development followed by cloud deployment. Future managed features can be adopted for a concrete need; selecting Supabase does not require using them all.

**Alternatives:** Neon or another managed PostgreSQL service would be valid behind the same ports. An earlier Neon recommendation focused too narrowly on conversations; the current choice considers the complete application. SQLite or files simplify an initial local prototype but change the path to the selected managed relational deployment.

**Tradeoff:** Local containers require setup/resources. Hosted roles, grants, migrations, configuration, and retention still need deliberate design. A service-role key bypassing RLS cannot replace application authorization. [Supabase security guidance](https://supabase.com/docs/guides/api/securing-your-api).

**Current access choice:** The Node backend uses the small `pg` driver against a private Postgres schema. Draft revision checks need one explicit database transaction; the browser never receives database credentials or a Data API route to intake tables. [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres) and [node-postgres transaction guidance](https://node-postgres.com/features/transactions) support this persistent-service path. A Supabase Data API client would be useful for other access patterns but would move this atomic transition into database RPC. The local test connection currently uses the development database's admin user; a restricted runtime login and hosted TLS/connection settings are a deployment gate, not a proven property of the local harness.

**Reconsider when:** Actual operational needs, compatible tooling, approved cost, or deployment constraints favor another PostgreSQL host. Keep stores independent of Supabase SDK types. A versioned knowledge corpus can remain outside the database initially.

## 5. Why Linear?

**Status:** Selected first TicketProvider. **SPEC:** ADR-002; R3.

**Why:** A real issue with an inspectable identifier, description, and location makes ticket creation demonstrable and debuggable. Linear offers a documented [GraphQL API](https://linear.app/developers/graphql). A dedicated approved demo destination makes it possible to show the assignment's external mutation without submitting reports to Boulder. Development backlog tickets and resident-report demo tickets are different uses.

Dror explicitly confirmed real creation and retrieval. Linear owns current ticket details/provider state; Supabase retains conversation/workflow history, linked references, receipts, and timestamped snapshots. Real readback and authorized on-demand reads establish that we integrated the ticket system rather than reproducing it locally. General ticket browsing and automatic synchronization are outside P0.

Dror refined local testing: core units use a simple port fake; Linear-adapter tests use a narrow GraphQL-over-HTTP mock of only the operations we consume, reusing production documents/schemas. End-to-end tests, including local runs, use the dedicated real Linear demo board. This tests deterministic failures cheaply while making E2E genuine. A local board/inspector or full Linear replica would add scope without improving the adapter boundary.

**Current adapter choice:** Use Node's built-in `fetch` and two explicit GraphQL operations for issue creation and issue-by-ID readback. This avoids an SDK dependency for the small interview scope and keeps HTTP, GraphQL errors, and uncertain writes visible in tests. The local mock proves our request/response handling, not the live Linear schema or permissions. Revisit the official SDK or generated types if the integration grows beyond this narrow surface. [Linear API guide](https://linear.app/developers/graphql).

**Alternatives:** Jira, another ticket platform, or a municipal work-order system can fit TicketProvider later. A purely local ticket substitute is useful for tests but cannot satisfy real platform compatibility/submission evidence.

**Tradeoff:** Permissions, limits, GraphQL failures, and uncertain writes require handling. We cannot assume native idempotency or authoritative search consistency; M3 must verify the chosen reconciliation strategy. Local operation uniqueness alone does not prove exactly-once external effects.

**Reconsider when:** Demo permissions/access are unavailable or an actual customer requires a different system. Preserve receipt and uncertain-outcome meaning in any replacement adapter.

## 6. Why two departments and these resident journeys?

**Status:** Selected focused scope. **SPEC:** J1–J3; ADR-005; A12.

**Why:** Potholes and park maintenance exercise different required-location contexts and two distinct department destinations while sharing report/confirmation/policy logic. Park/code/service guidance plus current news/events demonstrate information handling without staff action. Two distinct routes make R4 observable; the scope leaves time for evaluation, deployment, and debugging preparation.

**Alternatives:** One department would provide weaker routing evidence. Broad city-wide intake or more departments increases source/procedure coverage and ambiguity handling before the core journeys are proven.

**Tradeoff:** Supported scope is deliberately bounded. Unknown requests need useful limitation/contact guidance rather than arbitrary assignment to one of our departments. Park-maintenance reports do not imply support for reservations, enforcement, or emergencies.

**Reconsider when:** P0 gates pass and another department adds demonstrable value within available effort. Each addition needs verified ownership, required fields, evidence, configuration, and tests.

## 7. Why DB configuration with deterministic application policy?

**Status:** Accepted. **SPEC:** ADR-003, ADR-009; R5.

**Why:** The assignment explicitly requires deterministic hours-based routing/ticket decisions. Schedules, closures, timezone, department maps, and policy belong in DB configuration; server code interprets that validated data. A pure hours check answers open/closed/indeterminate, and a separate pure mapping chooses route/ticket/unavailable. Each can be tested and later changed without mixing timezone arithmetic with workflow actions. This gives repeatable decisions and a recorded explanation independent of phrasing or model choice.

**Alternatives:** Prompt-only enforcement leaves action selection dependent on model behavior. Code constants simplify a prototype but conflict with Dror's requirement that configuration come from the DB. A general rules engine adds another system before these small policies need it.

**Tradeoff:** We must validate configuration, model closing boundaries/timezones, and refuse policy-dependent actions when data is unavailable. Configurability also requires capability validation; an enabled unimplemented flag cannot be silently ignored.

**Reconsider when:** Procedures become complex enough to justify a reviewed rules representation or department-specific schedules. Data changes still cannot bypass code-enforced permissions, confirmation, or limits.

## 8. Why record every conversation separately from tickets?

**Status:** Accepted; ticket-always execution deferred to P1. **SPEC:** ADR-003, ADR-004; A13–A14.

**Why:** Information-only calls matter for analytics, failure investigation, and coverage learning. A conversation record documents them without implying that staff work is required. The default staff-action policy follows the assignment; the accepted ticket-always option remains a later configurable extension.

**Alternatives:** Making every interaction a service ticket mixes information demand with actionable work. Recording only successful tickets omits routed/informational/failed conversations and gives incomplete observability.

**Tradeoff:** Persistence needs failure handling, access controls, and retention decisions. Recording every conversation does not authorize permanent full transcripts or raw audio. The minimal durable record and confirmation evidence are different from a replay dataset.

**Reconsider when:** A real operational ticket policy or approved analytics/retention requirement changes. Update policy, privacy choices, tests, and SPEC together.

## 9. Why browser voice and simulated handoff?

**Status:** Accepted; tone/representative view P1, telephony P2. **SPEC:** ADR-005, ADR-006.

**Why:** A browser link lets a reviewer speak, inspect sources, and see verified ticket/route state in one place. The assignment permits mock numbers, so a labelled simulated route result demonstrates the chosen department without telephone infrastructure. The saved issue and location also give a later representative view usable context.

P0 deliberately uses one simple responsive task screen. It keeps conversation, voice state, collected context, the hours-based decision, source, confirmation, and verified outcome visible without presenting a broader municipal product. This gives a reviewer direct evidence of the required workflow and keeps implementation effort on correctness, testing, and deployment. The earlier desktop/mobile explorations are retained as design history rather than implementation targets.

**Alternatives:** PSTN calling and a contact-center integration would add numbers, routing permissions, media/control systems, and cost. Showing a number alone provides weaker evidence than an actual observable simulated route.

**Tradeoff:** The first interface is intentionally utilitarian and does not explore every product surface. Browser microphone permissions, mobile behavior, audio failures, and connection lifecycle still need real evaluation. Simulation does not establish telephone transfer or staff response. Tone and a separate representative view are useful additions but do not close a missing mandatory gate.

**Reconsider when:** P0 is complete or a real phone/contact-center requirement exists. Verify telephony and representative access/context delivery separately.

## 10. Why application-owned layers, narrow ports, and workflow control?

**Status:** Accepted. **SPEC:** ADR-009, ADR-013; architecture/workflow specs.

Voice fulfills the assignment, but conversation state, agent tools, confirmation, and authorized actions belong to the shared application workflow. A text channel can later provide its own observed messages and render the same outcomes without duplicating city policy or ticket logic. Channel provenance still matters for confirmation; a text response cannot confirm a voice prompt in another admission scope.

**Why:** Models interpret speech and propose work; application code owns authorization, current confirmation, state, deadlines, attempts, and effects. Small ports isolate actual external boundaries and give each part meaningful independent tests. Provider replacement should preserve outcome semantics and expose capability differences.

**Alternatives:** Direct SDK/model calls spread throughout the app make independent testing and replacement harder. Giving AI a general HTTP/SQL/tool runner expands its authority. A universal plugin framework or one interface for every function adds indirection without demonstrated reuse.

**Tradeoff:** Explicit contracts and state transitions take design effort. Ports cannot erase provider-specific behavior, and schema validity cannot prove factual truth. Voice confirmation extraction is fallible even when revision enforcement is deterministic.

**Reconsider when:** Actual reuse, provider requirements, or measured scale calls for another boundary. Use explicit capabilities and preserve human readability; add services/workers only for demonstrated needs.

## 11. Why a reviewed bounded knowledge corpus first?

**Status:** Recommended; acquisition/freshness validation pending. **SPEC:** Q5; knowledge spec; R1–R2.

**Why:** Our selected topics can start with transparent deterministic source selection and exact source passages/provenance. Actual code, official website guidance, and dated news/event details remain distinguishable. Missing/stale/conflicting evidence can be tested without a model or live crawl.

Event search has its own agent tool and provider contract because an occurrence is identified by a local date/time and current status, not just by a relevant passage. The city listing discovers events, while detail pages provide the available time and location; the separate special-events calendar includes events that are not necessarily city-sponsored. This boundary keeps an article's publication date from being mistaken for an event date.

**Alternatives:** Embeddings/vector retrieval or live search can help broader coverage but add ingestion/retrieval complexity and require separate relevance/freshness checks. Model memory cannot establish precise current municipal facts.

**Tradeoff:** Coverage is limited and refresh work is required. A valid citation is not proof that every spoken claim preserves code exceptions or applicability. Retrieval time is different from legal currency.

**Reconsider when:** Verified topic coverage needs broader retrieval. Keep KnowledgeProvider stable and compare relevance/grounding outcomes before adopting new infrastructure.

## 12. Why TypeScript, React, Node, and this toolkit?

**Status:** TypeScript/React/Node selected; local toolkit and a tested built-file serving module installed, production registration pending. **SPEC:** ADR-011, ADR-016; runtime spec.

**Why:** Shared TypeScript contracts reduce browser/server translation work while runtime schemas validate external data. React supplies the selected reviewer UI. One long-lived Node service can serve built assets and own conversation control/state composition. The lean toolkit assigns distinct responsibilities: Vite browser development/bundling, TypeScript type checks/backend output, Fastify HTTP, Vitest unit/contracts, Playwright browser journeys, and Biome lint/format. npm scripts/lockfile keep project orchestration simple.

**Alternatives:** Other UI/runtime stacks are viable but change our selected language/tooling direction. A Next.js application can be appropriate when its full-stack/SSR features are needed; this plan already has an explicit persistent backend. Jest or Node's test runner can also work. ESLint plus Prettier configures linting and formatting separately rather than using our proposed single tool.

**Tradeoff:** TypeScript still needs runtime validation. Vite transpilation/Biome do not replace type checks. Playwright does not replace actual speech/device evaluation. Biome may lack a future required rule; modern tools also need compatibility/support/advisory review. Long-lived hosting must be verified; the vendor is unselected.

**Reconsider when:** M0 compatibility or required rules/features favor an alternative. The first slice pins Node 24.21.0, npm 11.19.0, TypeScript 7.0.2, Vitest 5.0.1, Vite 8.3.0 as Vitest's required peer, Biome 2.5.13, and Node type definitions 24.13.5. `npm audit --audit-level=high` reported zero known advisories at introduction; this does not guarantee future safety. Keep dependencies justified and adopt extra build/task infrastructure only for actual needs.

The hosted UI needs safe static-file serving. `@fastify/static` 10.1.3 is used for that narrow job rather than writing path handling ourselves; it supports Fastify 5 and is newer than the [10.1.2 fix for non-canonical path authorization](https://github.com/fastify/fastify-static/security/advisories/GHSA-8pvw-jcv7-9cmj). The tested module serves only an explicit build directory. It is not yet registered in the local-only entry point, so it does not make the app deployable by itself.

Tool references: [Vite](https://vite.dev/guide/), [Vitest](https://vitest.dev/guide/), [Playwright](https://playwright.dev/docs/intro), [Biome](https://biomejs.dev/guides/getting-started/).

## 13. Why lightweight SDD and explicit simplicity principles?

**Status:** Accepted. **SPEC:** ADR-012, ADR-013.

**Why:** Dror wants to understand and defend the design. Root requirements, small component contracts, acceptance cases, and coherent changes give engineers/agents a shared target. Clear names, cohesive modules, explicit flow, and DRY for actual shared rules make the result understandable and safely changeable.

Meaningful constants explain fixed values; small message catalogs prevent reusable copy from scattering through code. DB policy, deployment configuration, versioned prompts, and source evidence retain their respective owners. Stable workflow codes let presentation wording change without changing business behavior.

**Alternatives:** Coding from an unversioned chat loses decisions and makes drift harder to spot. A large ceremonial specification or abstract framework can consume delivery time without strengthening behavior. Removing all abstractions would also obscure meaningful provider/test boundaries.

**Tradeoff:** Specs need maintenance and cannot prove implementation correctness. Similar syntax is insufficient justification for combining unrelated code. Extracting every obvious literal or adding a translation framework before a real need creates indirection; keep constants cohesive and English catalogs small. Tests still need independent expectations, so a wrongly changed production constant cannot silently change the expected result too. Planning must lead to tested slices rather than endless document expansion.

**Reconsider when:** Actual implementation evidence changes a contract or reveals unnecessary detail/indirection. Keep normative behavior in SPEC/component specs and rationale here; update both with accepted changes.

## 14. Why tests during development and retained regressions?

**Status:** Accepted. **SPEC:** ADR-008, ADR-015; evaluation spec.

**Why:** Tests should protect SPEC behavior when implementation, dependencies, prompts, or providers change. Each slice gets meaningful acceptance/failure checks; bugs retain regression cases. Real local DB tests exercise transactions/constraints, while controlled cloud boundaries keep routine tests repeatable. Model/voice quality needs separate empirical cases and human-readable rubrics.

**Alternatives:** End-only testing discovers integration defects late. Happy-path-only or overmocked tests can miss authorization/race/uncertain-write regressions. Exact generated-text snapshots punish harmless paraphrases without establishing factual/task correctness.

**Tradeoff:** A scenario manifest or high coverage percentage does not prove test strength. Tests need independent expectations, realistic negative cases, and maintenance. Real-provider/audio checks cost effort/budget and cannot be silently replaced by a green offline suite.

**Reconsider when:** Tests become flaky, redundant, or coupled to implementation details. Fix the cause while preserving the protected behavior. An accepted behavior change updates SPEC and checks together; a failed assertion is not a reason to weaken the requirement.

## 15. Why minimal maintained dependencies and advisory gates?

**Status:** Accepted policy; first offline slice reviewed, later packages pending. **SPEC:** ADR-013, ADR-016.

**Why:** Every dependency adds maintenance and transitive exposure. Justified packages, supported stable versions/Node LTS, pinned resolution, reproducible installs, and reviewed updates keep the project simpler and reduce known vulnerability risk. Useful schema/security/provider libraries can reduce correctness risk rather than invite homemade replacements.

The first core slice uses native `Date` and `Intl` for trusted instants and Boulder timezone conversion and has no runtime package dependencies. It accepts a validated schedule, leaving raw DB-row validation to the configuration adapter. The initial prototype put whole-city validation in the hours function, including departments and simulated destinations; that made a simple decision hard to read. This was removed. A schema library may be justified when the actual DB boundary is built: native `Date.parse` alone accepts and rolls over some impossible calendar dates. The advisory check reported zero known vulnerabilities for the current lockfile at review time.

**Alternatives:** Convenience packages for every utility increase the tree. Blindly choosing newest releases or forcing bulk audit fixes can change behavior unexpectedly. Avoiding all libraries can shift complex security/protocol work into our own code.

**Tradeoff:** Audits need current registry/advisory information and do not cover every vulnerability, Node, or container image. Unavailable scans are gaps. Severity needs exposure-aware triage under the SPEC's blocking/exception policy.

**Reconsider when:** A package is unused, unsupported, vulnerable, incompatible, or imposes disproportionate transitive cost. Remove, update, or replace it in a focused change with appropriate regressions and recorded disposition.

## 16. Why observability now and replay/shadow runners later?

**Status:** Minimal observability accepted; OpenTelemetry recommended, exporter Q9 unresolved; replay/shadow P1. **SPEC:** ADR-010.

**Why:** The debugging walkthrough needs evidence connecting a request to source/config versions, confirmation, attempts, and outcomes. Durable records plus correlated events make failures explainable even if trace export fails. Provider-neutral reasoning and version metadata leave room for later candidate comparison.

**Alternatives:** Logs without correlation can lose the relationship between concurrent work. Full prompt/audio capture raises privacy/cost concerns. Building a live shadow/comparison product before mandatory flows work expands scope.

**Tradeoff:** Sampling/export failures and asynchronous events need honest handling. Backend completion differs from actual playback. Future replay needs explicitly approved inputs/retention; fixed history cannot establish how a caller would answer a changed question. Candidate runs require isolated state, simulated tools, and separate budgets.

**Reconsider when:** P0 evidence is complete and approved comparison inputs/budgets exist. Select an exporter based on actual visibility, region, cost, and retention needs rather than a new dependency for its own sake.

## 17. Why local development before cloud deployment?

**Status:** Accepted environment direction. **SPEC:** ADR-014; runtime spec.

**Why:** Local UI/backend/Supabase lets us inspect state, inject controlled failures, and iterate on real application/DB behavior before hosting concerns. The same contracts and versioned migrations support a separate cloud UI/backend/managed-DB environment. Development data/credentials remain isolated.

**Alternatives:** Cloud-only development adds access/deployment dependencies to routine iteration. A substantially different local database/backend can hide parity issues until release.

**Tradeoff:** Local setup needs container/tool compatibility and documentation. GPT-Live, hosted reasoning, and Linear remain external APIs; local development is not equivalent to offline real-provider operation. Hosted control/media, origins, permissions, and restart behavior still need M6 verification.

**Reconsider when:** A tool/platform constraint prevents the documented local setup or deployment verification reveals parity problems. Update setup/configuration contracts with evidence; preserve separate local/cloud proof.

## 18. Why deliberate commits and P0 before extensions?

**Status:** Accepted. **SPEC:** ADR-012, ADR-017; P0/P1/P2.

**Why:** Authentic coherent commits show how the system grew and make review/regression diagnosis practical. A behavior, its tests, and its SPEC changes travel together in a usable milestone snapshot. Threefold describes a small task with a 4–6-hour time box and permits partial completion, so evidence of a working reviewer path has higher value than platform breadth. Completing assignment evidence before optional tone, representative view, ticket-always execution, or shadow runners protects the delivery target.

**Alternatives:** A single final dump loses useful progression. Mechanical tiny commits can leave broken intermediate states. Mixing feature/refactor/dependency changes makes diagnosis and rollback harder. Building every discussed extension threatens mandatory deployment/evaluation/writeup work.

**Tradeoff:** Commit boundaries need judgment and snapshot validation, especially with partial staging. Git revert does not undo a Linear ticket or database effects. A provisional effort estimate is not a guarantee that the elapsed delivery window is still available.

**Reconsider when:** Two changes cannot safely stand alone, or implementation evidence changes sequencing. Keep meaningful history and report actual effort/limitations. Use the development plan's commit/recovery rules.

## Decisions still open

The SPEC Q1–Q9 register owns the complete prerequisites. Client delegation and the reviewer code gate are selected; hosting vendor/region/plan, secure code delivery, numerical budgets, retention, external demo resources, and telemetry exporter require their defined review/validation gates. Render is a candidate, not a selected or provisioned host. This rationale file does not authorize external mutations or publication.

## 19. Why propose one hosted Node service for the reviewer demo?

**Status:** Runtime candidate implemented locally, not deployed. **SPEC:** ADR-011, ADR-014, Q2–Q3.

**Why:** One HTTPS service can serve the Vite build and the same-origin Fastify API. The browser connects to OpenAI over WebRTC while the server holds provider credentials and applies ticket and hours policy. This keeps the local and hosted application shape close. A separate Supabase project supplies the hosted database; the dedicated Linear project remains the external ticket destination. A public link first needs per-visitor conversation isolation, admission, and bounded paid-call quotas. HTTP Origin checks do not identify a visitor.

**Alternatives:** Render Free avoids service charges but [sleeps after idle time and can take about a minute to wake](https://render.com/docs/free), which weakens a short reviewer session. Render Starter is listed at [$0.05 per hour](https://render.com/pricing) and avoids that cold start, but requires spending approval. Other persistent Node hosts may be viable; a serverless-only redesign adds risk to this application without helping the assignment.

**Tradeoff:** Hosting and a reviewer code gate add setup and verification work. [Supabase Free can pause after low activity](https://supabase.com/docs/guides/platform/free-project-pausing), so a longer-lived demo needs an availability decision. Reviewer runtime settings now fail startup without complete credentials and use verified database TLS; no host choice, cost, or static-serving code proves the spoken and Linear journeys. Those still require fresh deployed checks.

**Reconsider when:** Dror chooses a spending/access envelope or a candidate host cannot support the documented same-origin, database, microphone, and environment requirements. Keep hosting-specific configuration at the runtime edge rather than in the application core.

## 20. Why a small reviewer code gate?

**Status:** Implemented locally; hosted verification and code delivery pending. **SPEC:** Q3; SEC-013.

**Why:** A shared page URL alone would let anyone trigger paid model calls and read a process-global draft. A separately delivered access code admits a browser into its own server-created conversation. An opaque HttpOnly/Secure/SameSite cookie carries only the admission token; the server owns draft state, scope, and quotas. Exact Origin checks protect write routes. Local development remains code-free while still isolating separate browsers.

**Alternatives:** Full accounts/OAuth add account and callback setup beyond the interview task. Origin checks alone do not authenticate a visitor. Stateless signed cookies cannot hold mutable per-visitor quota safely without another shared state store.

**Tradeoff:** The current map and limits apply to one Node process and reset on restart. A disclosed code can be reused until rotated; the small process-wide visitor cap bounds abuse but does not replace durable multi-instance budgeting. Code delivery and deployed browser behavior must be verified before sharing the link.

## 21. Why live-fetch and cache the official event calendar?

**Status:** Accepted and implemented; live verification recorded 2026-09-16. **SPEC:** R2; ADR-009; knowledge spec.

**Why:** Dror noted that events change constantly, so checked-in event records go stale between manual refreshes. The event provider now fetches the official Boulder calendar listing on demand, parses the dated event cards into bounded occurrences, and serves a 24-hour cache. Within the TTL the demo answers without refetching; on expiry it refetches and fails closed to limited coverage when the source is unreachable or unparsable. No event is invented, and stale cached events are never served after expiry.

**Alternatives:** A checked-in event record is simpler but expires and needs manual re-verification before every demo. Detail-page enrichment would add times and verified statuses at the cost of one fetch per event; the current answer honestly defers those details to the linked official pages. A crawler/vector pipeline is unnecessary for one city's official listing.

**Tradeoff:** The official listing is HTML without a published feed; parsing it depends on the city's current markup and needs the bounded-parser tests retained here. Listing cards do not state times or cancellation status, so answers say less than a reviewed detail page would. The provider adds one small maintained dependency (`cheerio`) for correct HTML parsing.

**Reconsider when:** The city publishes a machine-readable calendar feed, detail-page enrichment is needed for reviewer questions, or the listing markup changes in a way the parser tests flag.

## 22. Why a fixed capabilities overview for "what can you do" questions?

**Status:** Accepted and implemented; live model verification of the two new intent cases pending. **SPEC:** ADR-009; voice spec AC-008.

**Why:** Dror observed that callers do not know what the demo supports, so "what can you do for me" or "what questions can I ask" must answer with the available options. The intent classifier recognizes a `capabilities` intent, and the server replies with one fixed, honest options message listing the reviewed code question, pothole guidance, live upcoming events, and nonurgent pothole/park reports. The wording is server-owned presentation copy, not model-generated facts.

**Alternatives:** Letting GPT-Live improvise an options answer risks overstating coverage; routing the question through the city-information tool would return only the pothole example. A growing capability list could later come from a message catalog, but one fixed English message matches the current four-capability demo.

**Tradeoff:** The fixed message must be updated when capabilities change; the eight-case intent evaluation includes two capability utterances so drift is caught by the opt-in paid eval.

## Keeping the rationale current

When an accepted decision changes, update its SPEC entry/contracts/tests as appropriate and this rationale in the same coherent change. Record the new status, reason, evidence/date, and affected alternatives. Git preserves the historical rationale. After a prototype or benchmark, distinguish observed results from the earlier hypothesis and update reconsideration conditions. Use concise explanations that a human can defend during the walkthrough.
