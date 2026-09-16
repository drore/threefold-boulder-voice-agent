---
title: Boulder municipal voice agent
version: 1.0-review
last_updated: 2026-09-16
owner: Dror Elovits
---

# Boulder municipal voice agent — specification

Status: local text intake and confirmation now cover potholes and park maintenance, with distinct mock destinations selected from the DB-backed Boulder policy. Closed-hours reports use a durable one-attempt Linear operation when the demo project and API key are configured; creation/readback has passed local fixtures, not a live Linear call. Three reviewed information examples work in text. Browser GPT-Live session and client-delegation code is connected to the application tools; two live synthetic reasoning classifications succeeded, while microphone/spoken end-to-end behavior is still unverified. The [dedicated Linear project](https://linear.app/hamaarag/project/96d0aa81-ab4c-48c1-996a-9c1c1bc45780/overview) exists, but its API connection needs reauthentication. Cloud deployment, live ticket proof, empirical voice evaluation, and the reviewer writeup remain open. Dror authorized the project and use of the existing OpenAI development key; submission to Threefold remains Dror's decision.

## 1. Purpose and priorities

Deliver a Boulder, Colorado municipal voice agent covering all six Threefold capabilities and all three deliverables. Dror must understand its design and be able to debug it in the 45-minute follow-up.

The [assignment](https://www.threefold.ai/developer-task) calls this a small version of Threefold's work, suggests approximately 4–6 hours, and explicitly permits partial completion. Dror's target is all six capabilities within 48 hours elapsed, with assignment coverage ahead of additional features. Track actual effort and report any cut honestly. The elapsed delivery target is not a 48-hour coding budget and must not silently reset when implementation starts.

- **P0 — submission:** assignment capabilities/deliverables and the controls needed for safe, observable behavior.
- **P1 — extensions:** additional experiences and policies, after P0 or in a later iteration.
- **P2 — expansion:** broader coverage, additional providers, production telephony, and measured scale.

P0 has small provider-neutral interfaces and extension points. Do not build a general plugin framework or distributed platform to demonstrate replaceability. Keep updating this SPEC and affected component specs as decisions change.

**Interview scope limit:** prove each capability with the smallest credible end-to-end example. P0 has one Boulder configuration, one browser voice screen, two report types/departments, a small reviewed set of code/website/event sources, one Linear demo destination, and a compact evaluation suite. A thin server-owned boundary is enough for provider replacement; no provider marketplace, administration console, full city knowledge base, telephony integration, staff portal, analytics dashboard, replay service, or multi-city setup. Implement only reliability controls that the demonstrated action path needs. If time or access prevents a capability, preserve a working reviewer path and name the omission in the one-page writeup; a stub does not count as coverage.

## 2. Assignment coverage and evidence gates

Evidence criteria are our engineering interpretation, not additional verbatim Threefold requirements.

| ID | Requirement | Evidence required | Status |
| --- | --- | --- | --- |
| V0 | Voice agent for a US city | Fresh reviewer speaks/hears relevant responses through the delivered link; Boulder and demo limitations are clear. | Browser WebRTC and client delegation implemented/tested with fakes; live microphone/spoken proof pending |
| R1 | Answer municipal-code and website questions | Separate spoken examples use actual code and official service guidance, preserving qualifications and exposing relevant sources. Website summaries alone do not establish code coverage. | Reviewed code/service answers work locally in text; live reasoning intent classification passed; spoken answers pending |
| R2 | Answer current city-event questions | Dated official news/events support current answers, including freshness, past/upcoming status, times, and cancellations. | One reviewed event works locally in text until its freshness horizon; voice and source refresh pending |
| R3 | Open a ticket in a selected platform | Confirmed spoken report creates a real Linear issue in the approved demo project; a real API readback verifies ID and fields. | Closed-hours workflow and adapter pass local fixture/mock tests; live Linear proof pending |
| R4 | Route to correct department; mock number allowed | Two supported intents invoke observable routing to distinct allowed mock destinations. Simulation never implies real staff answered. | Both distinct routes pass local DB/API tests; spoken proof pending |
| R5 | Deterministically route or ticket according to city hours | DB-backed schedules and server code determine actions; repeatable boundary/timezone/closure tests and spoken open/closed scenarios prove enforcement. | Local open/closed and two-department paths pass; spoken and live Linear proof pending |
| R6 | Evaluation/testing setup | Runnable commands, versioned cases/results, and meaningful failures cover R1–R5. Application, provider, model, and voice verification are distinguished. | 139 local DB tests pass; empirical model/voice cases and evidence ledger pending |
| D1 | Repository with real commit history | Reviewer access, incremental commits, setup instructions, and exact candidate checks. | Local planning and first intake slice committed; reviewer access pending |
| D2 | Link reviewers can try | Fresh session verifies the deployed revision's voice, sources, real demo tickets, and simulated routing; access steps documented. | No deployment |
| D3 | Writeup at most one page | Rendered writeup includes cuts, decisions, component diagram, limitations, and next steps. | Planned |

Record date, revision, commands/evidence, and pass/fail per gate. Local tests do not establish deployment or live audio. No gate passes because it appears in a diagram. Prepare a deliberate-failure/debugging rehearsal for the follow-up.

## 3. P0 journeys and coverage

| Journey | Supported behavior | Limits |
| --- | --- | --- |
| J1 — nonurgent pothole | Collect address or nearest intersection and description; clarify/confirm current details; route or ticket. Transportation & Mobility owns this demo report. | No photo upload, damage claim, repair booking, geocoding guarantee, or repair-time promise. |
| J2 — nonurgent park maintenance | Collect park/location, issue description, useful landmark if needed; clarify/confirm; route or ticket. Parks & Recreation owns this demo report. | No enforcement, emergency dispatch, booking, or county/open-space maintenance guarantee. |
| J3 — information | Supported park rules/shelter guidance, actual municipal-code questions, current official events/news. | No reservations/payments, city-wide legal coverage, or unsupported precise claims. |

The bounded P0 code topic is [Boulder Revised Code 8-3-9](https://library.municode.com/co/boulder/codes/municipal_code?nodeId=TIT8PAOPSPSTPUWA_CH3PAREPESPMOPA_8-3-9GLBOPR), inspected in the current Municode supplement on September 16, 2026. It prohibits glass bottles and other glass containers in city parks, parkways, recreation areas, and open space, **except a container holding prescription medication**. The city's [short park-rules page](https://bouldercolorado.gov/general-park-rules-and-regulations) omits that exception. The local reviewed code answer retains it; the separate website answer covers pothole service guidance. Municode shows Supplement 167 Update 3, online August 18, 2026, containing ordinances effective through July 30, 2026; later amendments still require a pre-delivery check. Park closure hours come from the city's published rule guidance; BRC 8-3-3 grants rulemaking authority and is not itself a verbatim 11 p.m. closure provision. Spoken answers and broader source coverage remain unimplemented.

News/events are not restricted to the two staff departments. Ingest a bounded dated corpus. Unsupported legitimate municipal requests receive a useful official source/contact and an honest coverage limitation; never arbitrarily route to one of the two departments.

## 4. Accepted decisions

[DECISIONS.md](DECISIONS.md) explains the rationale, alternatives, tradeoffs, and reconsideration conditions for these choices. This SPEC remains the authority for current behavior, status, and review gates; the rationale file does not promote a recommendation to an accepted decision.

### ADR-001 — Boulder

City ID `boulder-co`, timezone `America/Denver`, stored in city configuration. P0 handles one city; contracts carry city ID. Multi-city onboarding is P2.

### ADR-002 — Linear

First external TicketProvider is Linear, targeting a dedicated demo project in Dror's Linear workspace. Dror explicitly authorized creating that project and using synthetic tickets there. The project was created on September 16, 2026; the Linear API connection still needs reauthentication or a scoped key before live ticket proof. The adapter requires both team and project IDs, so issues cannot silently land in the team's general backlog. In approved Linear integration and the deployed demo, applicable confirmed requests create actual Linear issues; verification, reconciliation, and needed authorized ticket detail/status reads query the real Linear API. Linear owns the external ticket and its current provider state; Supabase owns conversation/workflow history, references, receipts, and explicitly timestamped read snapshots. Local records or generated mockup IDs cannot substitute for a current Linear read. Reads are scoped to server-authorized linked tickets; general workspace browsing and cross-conversation ticket discovery are outside P0.

For deterministic local tests, implement a narrow mock of the Linear GraphQL API surface actually consumed by our adapter: the same operation documents/variables, response envelopes, GraphQL errors, relevant HTTP/rate-limit behavior, and create/read/reconciliation scenarios. It is a test harness, not a local ticket product or full Linear clone; no local board/inspector UI is planned. Core unit tests may use the simpler provider-neutral TicketProvider fake, while adapter tests exercise the real Linear adapter against the mock API. Local and deployed end-to-end tests use an approved dedicated Linear demo board and verify actual creation/readback. Mock results cannot satisfy real Linear evidence.

### ADR-003 — DB-backed deterministic policy

Supabase is the runtime source of truth for schedules, timezone, closures, department mappings, mock destinations, and `alwaysOpenTicket`. Migrations/seeds are versioned in Git; runtime configuration is read from DB. Models cannot modify it or override decisions.

P0 uses `alwaysOpenTicket=false`:

| Request | Open | Closed |
| --- | --- | --- |
| Information | Answer; record conversation | Answer; record conversation |
| Supported staff action | Route; no ticket | Ticket; no transfer |

The accepted `alwaysOpenTicket=true` extension creates a ticket before routing when open, and only a ticket when closed. Implement in P1. P0 rejects an unsupported enabled configuration instead of silently ignoring it. Information never creates tickets/routing with either setting.

Backend validates configuration and checks server time at action authorization. Record config revision/time. Each opening-hours entry includes its `opensAt` time and excludes its `closesAt` time; at closing time the office is closed. Missing/invalid required configuration produces an unavailable outcome; do not guess hours. The first pure policy slice separates an hours check (`true`, `false`, or `undefined` when indeterminate) from the action mapping (`route`, `create_ticket`, or `unavailable`). The check receives a validated schedule and trusted server time; an invalid time, timezone, or expired schedule is indeterminate. The workflow invokes the action mapping only for a confirmed, supported staff request; information requests remain no-action. The DB/configuration boundary will validate city identity, source metadata, opening-hours entries, department mappings, and simulated destinations before the workflow calls this policy. The slice does not read the DB or authorize/perform a provider effect. Every conversation is recorded independently of tickets; full transcript/audio retention is separate.

### ADR-004 — Supabase application state

First ConversationStore and CityConfigStore: conversations, current request/confirmation evidence, operations/attempts, ticket references, configuration. Knowledge is behind KnowledgeProvider and can start with a versioned reviewed corpus. Core contracts remain independent of Supabase SDK types.

### ADR-005 — Mock handoff and later representative experience

P0 requires observable mock handoff pending/answered/failed/cancelled outcomes and an explicit simulation label. Proposed DB destinations: Transportation & Mobility `+1 303-555-0101`, Parks & Recreation `+1 303-555-0102`. Never dial fictional numbers.

The previously accepted tone and representative view move to P1 under Dror's assignment-first scope instruction. P0 already stores context needed later. Tone alone is not transfer completion. Actual telephony/contact-center integration is P2.

### ADR-006 — Browser voice

Web link with microphone/spoken output, source cards, actual action status, responsive layout. No inbound phone. Target desktop Chrome/mobile Safari subject to M1 and empirical testing; record verified versions. Handle denied microphone, disconnect, and graceful close.

Voice is the required P0 interaction channel, not an Application Core dependency. A later text-chat adapter must be able to use the same agent tools, conversation state, confirmation rules, business-hours policy, and provider operations. Text messages and voice transcripts enter as different server-observed evidence with channel provenance; neither channel may choose its own authorization or ticket path. A text-chat UI is not required to satisfy the voice assignment and remains a later implementation slice.

P0 uses one simple responsive task screen. It exposes only the conversation, voice state, collected request, deterministic hours decision, supporting source, confirmation controls, and verified action outcome needed to demonstrate the assignment. Optional product surfaces and visual polish remain deferred until mandatory evidence gates pass.

### ADR-007 — GPT-Live with feasibility gate

The local browser voice adapter uses GPT-Live and keeps evidence, reasoning, task state, and actions separate. M1 still needs actual browser audio, interruption/transcript behavior, a complete delegated round trip, and hosting validation. Speech interruption is not automatic task cancellation. Revisit blocking findings with Dror.

Client delegation is selected for ownership of reasoning context, validation, and later model comparison. The application assembles scoped transcript/task context, handles delegation events, runs the reasoning workflow, and returns verified concise results to GPT-Live. The first reasoning proposal model is `gpt-5.6-luna` with strict structured output; local key access and two live synthetic classifications succeeded, but broader accuracy/cost remains an evaluation gate. Browser microphone/media and actual delegation ordering still need empirical verification. The current local voice journey requires an explicit on-screen confirmation of the saved report; action results are then appended to the report's voice delegation. Do not describe it as hands-free spoken confirmation. This mode does not guarantee every spoken word. Mandatory exact speech needs controlled playback, outside P0.

### ADR-008 — Independent testing

Policy, workflow, intake, retrieval, adapters, and voice have explicit contracts and independent checks. Core tests need no network/models. Isolated real provider checks supplement substitutes. Voice runs against controlled backend; reasoning runs without microphone. End-to-end verification remains required.

### ADR-009 — Provider-independent core and explicit workflow control

One modular application; core defines contracts and adapters translate SDK types. Capabilities expose provider differences. No arbitrary shell, SQL, or URL-fetch tool is exposed to AI.

AI interprets requests and handles dialogue. Code enforces fields, confirmed revisions, state transitions, hours, permissions, deadlines, bounded retries, and duplicate protection as each action path is implemented. Department conversation guidance is separate from enforceable rules. Speech updates follow actual workflow events.

The P0 reasoning backend has four agent-facing capabilities: municipal-code lookup, city service/department information lookup, dated city-event search, and preparation of a supported service report. Event search is separate from general city information because date range, timezone, current status, and freshness determine its answers. `isWithinBusinessHours` and action mapping remain internal core policy, never agent tools. The service-report tool prepares a durable local pothole or park draft; the separate local browser confirmation path reads the current draft and DB policy to simulate a route or authorize one durable Linear create/read attempt. Repeat confirmation fetches a linked issue before re-evaluating hours, and a known issue ID can be reconciled by read-only lookup after an uncertain first readback. The other three agent capabilities answer only one reviewed example each and return limited coverage for unsupported questions. One live reasoning-classification call passed, but no full spoken journey, live Linear ticket, or phone transfer has been verified, so R1–R5 are not fully satisfied.

### ADR-010 — Observability and later comparison

P0 records correlated events/traces across boundaries: IDs, config/prompt/model versions, evidence, timings, attempts, guardrail outcomes, real results, available usage. No hidden chain of thought. Persistent records remain authoritative if telemetry export fails. Backend completion differs from actual playback.

OpenTelemetry is the recommended tracing boundary; collector/vendor remains Q9. Operational telemetry is separate from replay payloads and audio.

P1 adds controlled replay and asynchronous sampled reasoning shadows: isolated state/simulated action adapters, no production mutation credentials, no caller audio, no effect on live results. Whole-voice comparison requires separate simulation. Fixed production history cannot establish caller reactions to changed questions.

### ADR-011 — TypeScript, React, Node

Dror selected TypeScript, React, Node. Shared runtime-validated contracts span browser/backend boundaries. Recommend one long-lived Node HTTP service serving the built UI and owning voice control. The lean modern toolkit uses Vite for React development/bundling, the TypeScript compiler for strict checks/backend JavaScript output, Fastify for HTTP, Vitest for unit/contracts, planned Playwright for browser journeys, and Biome for lint/format checks. Use npm scripts/lockfile and a supported Node LTS line. [Runtime specification](spec/spec-infrastructure-runtime.md) owns tool responsibilities. The current local slice pins Node 24.21.0, npm 11.19.0, TypeScript 7.0.2, Vitest 5.0.1, Vite 8.3.0, Biome 2.5.13, Fastify 5.12.5, React/React DOM 19.3.0, and `pg` 8.23.0 with a resolved lockfile. Playwright remains uninstalled until browser regression automation is needed. Hosting vendor/plan are not selected/provisioned.

### ADR-012 — Living specification and delivery priorities

Update root/component specs alongside behavior, prompts, configuration, tests/evals, and meaningful commits. P0 precedes P1/P2. Deferred extensions do not remove mandatory capabilities. Historical discussion is recoverable in Git; this document defines current scope.

### ADR-013 — Simple, human-readable engineering

Dror explicitly requires simple, readable, maintainable code and established engineering principles. Prefer clear domain names, small cohesive functions/modules, explicit control flow and errors, and minimal dependencies. Apply single responsibility where it clarifies a real boundary: separate distinct questions, decisions, and side effects, while avoiding trivial extraction for its own sake. Apply DRY to shared business rules, schemas, and workflows; keep one authoritative definition. Earn abstractions through actual reuse or a meaningful external boundary. Similar-looking code alone does not justify a generic framework. Use separation of concerns and dependency inversion where they make independent testing and provider replacement concrete. Correctness and diagnosable failures take precedence over brevity or cleverness.

Avoid magic values and scattered user-facing text. Give meaningful values one clear owner:

| Value | Owner |
| --- | --- |
| Stable domain/protocol values, non-obvious fixed limits, shared status/error/event codes | Descriptive constants or shared typed schemas, close to the relevant module/domain |
| City hours, timezone, closures, department destinations, business policy | Validated DB configuration under ADR-003/ADR-004; never hardcoded in application constants |
| Environment-specific endpoints, credentials, provider/model identifiers and deployment settings | Validated environment/server configuration; private values stay server-side |
| Reusable UI, spoken status and error messages | Small message/translation catalogs with typed placeholders; English P0, no additional language or translation framework required |
| Substantial model instructions and department procedures | Versioned prompt/procedure files, separate from presentation messages and untrusted caller data |

Keep constants cohesive rather than collecting unrelated values in a global constants file. Obvious local literals such as zero, one, or booleans can stay inline when extracting them adds no meaning. Workflow decisions use stable codes and validated data, never displayed wording. Official municipal passages remain evidence with provenance, rather than message-catalog content. Tests retain independent expected outcomes/boundary values; importing the production constant alone must not define both the behavior and its expected result.

Maintain a logical, lean folder structure with related files grouped by responsibility. The [architecture specification](spec/spec-architecture-system.md) owns the layout. Root instructions apply repository-wide; add a nested `AGENTS.md` only for a non-trivial local responsibility, dependency/safety boundary, format convention, specialized check, or pitfall that the root/SPEC does not already explain. Do not create local notes merely because a directory exists, and remove them when their local guidance becomes trivial. The first core import guard uses Biome's restricted-import and CommonJS rules; it is a source-review aid, not an authorization control or proof of all possible dependency forms.

Code review must be understandable to a human unfamiliar with the conversation: explain non-obvious decisions, avoid unnecessary indirection, and remove dead code/speculative extension machinery. M0–M5 verify these criteria alongside behavior and security.

### ADR-014 — Local development, cloud production

Dror requires the application to work in a local development environment before cloud deployment. The first local React/Node/Supabase text-intake path works; the remaining assignment paths and deployment are pending.

Development runs React, Node, and a local Supabase stack on the developer machine. Production runs the built UI, long-lived backend, and managed Supabase in the cloud. Use the same application contracts and versioned migrations, with environment-specific endpoints, credentials, origins, and validated configuration. Keep development data and credentials separate from production; no automatic production reset or demo mutation.

GPT-Live is accessed as a cloud API from either environment. Unit/contract/adapter checks can use controlled fakes or the narrow local Linear API mock. Local end-to-end and deployed demo runs use Linear's cloud API with an approved dedicated demo board. Any selected hosted reasoning model is likewise an external API. Offline and real-provider results remain distinguished; a mock passing does not establish real provider compatibility. M0–M5 target local application verification; M6 adds cloud deployment and fresh reviewer verification.

### ADR-015 — Tests protect the specification throughout development

Dror requires testing to be part of development and to protect intended functionality against regression. Each behavior slice defines SPEC-linked acceptance and meaningful failure cases, implements the corresponding tests alongside the behavior, and passes relevant checks before integration. M5 consolidates evidence and evaluations; tests begin in M0.

Version a small scenario-to-check manifest referencing root A-scenarios and affected component requirements. Distinguish planned, implemented, automated, empirical, and process evidence. Validate references and missing checks for implemented behavior in CI; every P0 gate needs its specified evidence before release. A traceability entry or coverage percentage alone does not establish that a test detects a defect.

Tests assert observable outcomes and enforceable invariants, with independent expectations and controlled clocks/providers. Cover policy boundaries, confirmation/authorization races, persistence/access failures, uncertain writes, source freshness, and complete local journeys. A reproduced bug gets a failing regression case before its fix where feasible; model/voice failures become versioned empirical cases with clear rubrics. Preserve those cases during future changes. Accepted behavior changes update SPEC, tests, and fixtures together; do not weaken an assertion solely to make a failure pass. Routine deterministic checks run without paid APIs, while real-provider and spoken evidence remain separate.

### ADR-016 — Minimal, maintained, reviewed dependencies

Dror requires minimal dependencies and modern, safe versions with low known vulnerability exposure. Add a package only for a current need and record its purpose, maintenance/support, compatibility, and transitive impact. Prefer native platform capabilities for simple utilities; established schema/security/provider libraries earn their place when they reduce correctness risk. The first policy slice uses native `Date`/`Intl` for time and timezone conversion; strict validation of untrusted DB configuration belongs to the later configuration adapter. Keep development tools separate from runtime dependencies and ship only needed runtime packages.

At M0 and each update, verify current official releases/security advisories; choose supported stable versions and a supported Node LTS patch line. Pin selected direct versions and runtime/tooling versions, commit the resolved lockfile, and use reproducible installs. Updates are reviewed, tested changes rather than automatic forced upgrades. Remove unused dependencies.

Required dependency checks review the full direct/transitive tree, including development tools. Known high/critical findings block the default integration/release gate pending remediation or an explicitly reviewed, accepted exception; lower-severity findings need proportionate triage. Record affected versions, exposure, disposition, and review date. Advisory/registry failure is an unavailable check, not a clean result. Lockfile audit does not cover Node/container vulnerabilities or prove zero unknown CVEs; review runtime/base-image advisories before release and keep future patch work visible.

### ADR-017 — Coherent, tested, authentic commits

Dror requires deliberate commit structure and real development history. Each delivered commit has one clear purpose and contains the implementation, meaningful tests/evals, and affected SPEC/configuration changes needed for that purpose. It builds and passes applicable checks at its milestone without depending on uncommitted files or later commits. A commit may deliver a tested foundation or partial capability; it must describe that boundary honestly.

Use Conventional Commit subjects with a useful optional scope and outcome-focused description. For nontrivial changes, the body explains why, relevant SPEC scenarios, and actual verification/limitations. Keep unrelated refactors, bulk formatting, and dependency updates separate; include schema changes with the code/data that needs them where safely reviewable. Preserve incremental behavior commits in the reviewer-visible history. Do not manufacture commit count, backdate work, rewrite published history, or squash the entire assignment into one final dump. [Development plan](DEVELOPMENT_PLAN.md) owns commit boundaries and the pre-commit/integration checklist.

## 5. Architecture and interface rules

Five logical responsibilities: presentation, conversation, reasoning, application core, adapters. They are not a mandatory five-hop network chain. [Architecture](spec/spec-architecture-system.md) defines dependency direction.

Core interfaces: Clock, CityConfigStore, ConversationStore, KnowledgeProvider, ReasoningBackend, TicketProvider, TransferProvider, operational event/trace boundary. VoiceSession normalizes voice lifecycle. Create interfaces for meaningful external boundaries, not every internal function.

Runtime-validate boundary data. Schema validity is not truth or authorization. Server-created execution context owns conversation/city/run IDs, mode, trace, deadline. Model arguments cannot select identity, permissions, destination, or budget.

Confirmation/execution reference a specific draft revision and actual caller evidence. `confirmed:true` alone is insufficient. Corrected critical fields invalidate confirmation. Persist intent before mutations; reconcile uncertain results rather than duplicate writes.

## 6. Security and operational constraints

- Factual municipal answers use relevant approved evidence with section/version, passage, retrieval time, freshness. Missing/conflicting evidence produces clarification/limitation.
- Speech, typed input, retrieved pages are untrusted data, separate from trusted instructions. Scope/topic checks and guardrails supplement authorization; no hallucination-free guarantee.
- Narrow tools target supported requests, allowed departments, approved team. No credentials in browser/model context.
- Authorize every state read/write against server-established session scope. IDs are not access credentials. No cross-conversation context access.
- Bound session/model/tool work, mutations, retries, concurrency. Repeated model calls cannot bypass limits. Failed/timed-out guardrails are not approval.
- Required persistence failure blocks new mutations. Informational degradation must be labelled and cannot count as successful conversation persistence.
- UI clearly identifies a demo: no reports to Boulder, real staff transfer, emergency dispatch, or repair/booking promises.
- Retention/access method/numeric budgets below remain proposed release decisions.

## 7. Acceptance scenarios

P0 scenarios gate submission. P1 scenarios define later behavior.

| ID | Priority | Maps to | Observable expectation |
| --- | --- | --- | --- |
| A1 | P0 | R1 | Actual code answer preserves qualifications and exposes relevant section evidence. |
| A2 | P0 | R1 | Missing/stale/conflicting evidence causes clarification/limitation. |
| A3 | P0 | R2 | Current news/events use dated details; past/cancelled items are not upcoming. |
| A4 | P0 | R4,R5 | Confirmed open-hours report routes; no ticket. |
| A5 | P0 | R3,R5 | Confirmed closed-hours report creates one verified Linear ticket; actual API readback matches ID/location/description, needed authorized refresh reads Linear, and no transfer occurs. |
| A6 | P0 | R5 | Boundaries/weekends/verified closures/timezone/DST are repeatable. |
| A7 | P0 | R3,R6 | Failure/uncertain timeout produces no false success/blind duplicate. |
| A8 | P0 | R4,R6 | Mock routing is observable and labelled. |
| A9 | P0 | V0,R6 | Spoken checks cover clarification/correction/interruption/tools/results. |
| A10 | P1 | ADR-003 | Ticket-always mode tickets before open-hours routing; distinct outcomes. |
| A11 | P0 | R1 | Official website guidance separately verified from code scenario. |
| A12 | P0 | R4 | Two supported intents route correctly; ambiguity clarified. |
| A13 | P0 | ADR-003,ADR-004 | Informational conversation persists; no action/ticket. |
| A14 | P0 | ADR-004 | Staff report persists confirmed context and outcomes. |
| A15 | P1 | ADR-005 | Tone only during pending transfer; stops on terminal outcome. |
| A16 | P1 | ADR-005 | Representative view shows matching confirmed context without requiring ticket. |
| A17 | P0 | ADR-008,ADR-009 | Core checks run provider-free; contracts/real checks validate adapters. |
| A18 | P0 | ADR-009 | Correction winning before atomic authorization invalidates confirmation and prevents old-revision execution. After authorization, retain the authorized revision and report committed/uncertain outcomes honestly; no silent amendment or rollback claim. |
| A19 | P0 | Security | Injection/off-topic requests cannot bypass tools/session access; legitimate ambiguity clarified. |
| A20 | P0 | Security | Server limits apply to API and repeated model requests. |
| A21 | P0 | ADR-010 | Timeline connects evidence/config/attempts/results without credential leakage. |
| A22 | P1 | ADR-010 | Replay/shadow cannot speak/mutate live; divergence explicit. |
| A23 | P0 | R5 | Missing/invalid DB config blocks policy-dependent actions. |
| A24 | P0 | ADR-004 | Persistence failure blocks unsafe/unrecorded mutations. |
| A25 | P0 | V0,D2 | Permission denial/disconnect/close release resources; browsers verified. |

## 8. Proposed defaults and finite decision register

| ID | Recommendation / prerequisite | Gate |
| --- | --- | --- |
| Q1 | Resolved: Dror selected client delegation. Exact reasoning model and working provider flow still require task/latency checks. | M1 feasibility |
| Q2 | Long-lived Node web service; Render is a candidate supporting WebSockets. Choose vendor/region/plan and cost before deployment. | M0 review; M6 external approval |
| Q3 | Same-origin server reviewer sessions; simple access gate recommended, no privileged direct browser DB access. Choose method/credential delivery. | Security review; M6 |
| Q4 | DB general city office hours Mon–Fri 08:00–17:00 America/Denver; verified closure dates/validity horizon. Park hours are distinct. Override shape supports future department differences. | Core review + M1 |
| Q5 | Reviewed bounded corpus, deterministic source selection first; manifest refresh at ingestion/startup/before submission and explicit freshness limits. No vector infrastructure required. | Knowledge review + M1 |
| Q6 | Proposed 5-minute sessions, 2 service requests/session, bounded model work, 3 total safe-read attempts. Writes need reconciliation; account-wide cost/concurrency still reviewed. | Security/integration review |
| Q7 | No durable raw audio/full transcript by default; minimal request/confirmation evidence. Choose retention/deletion before real caller data. Synthetic/redacted eval fixtures. | Privacy review before external persistence |
| Q8 | Local Supabase for development; separate cloud Supabase project and approved Linear demo destination; least-privilege credentials, Git remote/reviewer access. | M0 local prerequisites; G2/G3 external authorization |
| Q9 | OpenTelemetry plus minimal session timeline; collector/vendor/data region/retention still selected. | M0/M6 |

## 9. Detailed specifications and development plan

- [Architecture/contracts](spec/spec-architecture-system.md)
- [Application Core/use-case contracts](spec/spec-architecture-application-core.md) — review proposal; finalize before implementation.
- [Workflow/intake/configuration](spec/spec-process-workflow.md)
- [Knowledge/freshness](spec/spec-data-knowledge.md)
- [Voice/reasoning](spec/spec-design-voice.md)
- [Persistence/tickets/transfers](spec/spec-tool-integrations.md)
- [Security/observability](spec/spec-process-security-observability.md)
- [Evaluation/submission](spec/spec-process-evaluation.md)
- [Runtime/delivery infrastructure](spec/spec-infrastructure-runtime.md)
- [Detailed development plan](DEVELOPMENT_PLAN.md)
- [Decision rationale and alternatives](DECISIONS.md)
- [Simple responsive interface concept](design/README.md) — selected P0 direction; synthetic example, no implemented UI/provider evidence.

The first local commands are documented in README and have run for the provider-free policy slice. Other commands in component specs/plan remain future targets until created. Resolve material choices with Dror before their implementation/release gate.

## 10. Source ledger

Assignment rechecked September 15, 2026 via direct HTML: [Threefold](https://www.threefold.ai/developer-task).

- [Transportation maintenance](https://bouldercolorado.gov/services/transportation-maintenance): department and address/intersection/description for potholes. Other page workflows may have different owners.
- [Parks](https://bouldercolorado.gov/park-regulations-and-information), [park guidance](https://bouldercolorado.gov/general-park-rules-and-regulations), [shelters](https://bouldercolorado.gov/services/park-shelter-reservations): website sources; code references are not code acquisition.
- [Code section 8-3-9](https://library.municode.com/co/boulder/codes/municipal_code?nodeId=TIT8PAOPSPSTPUWA_CH3PAREPESPMOPA_8-3-9GLBOPR): section text and prescription-medication exception inspected in the current browser code on September 16. Supplement 167 Update 3 was online August 18 and contains ordinances effective through July 30; posted later amendments need a pre-delivery check. Automated acquisition is unnecessary for this bounded topic.
- [City contact](https://bouldercolorado.gov/contact-us): general weekday 08:00–17:00 hours checked September 15. [Holiday calendar](https://bouldercolorado.gov/events?event_series=1865): inspect individual closure details, not only titles.
- [Events](https://bouldercolorado.gov/events), [news](https://bouldercolorado.gov/news): dated listings checked September 15; details/refresh still to implement.
- [NANPA](https://nanpa.com/numbering/555-line-numbers): fictional 555-0100–0199 range, not dialled.
- [GPT-Live delegation](https://developers.openai.com/api/docs/guides/live-delegation), [controls](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live): conversation/task separation.
- [Supabase security](https://supabase.com/docs/guides/api/securing-your-api), [Linear GraphQL](https://linear.app/developers/graphql), [Linear limits](https://linear.app/developers/rate-limiting): verify live schema/permissions at adapter gates.
- [Supabase local development](https://supabase.com/docs/guides/local-development): local stack via CLI and Docker-compatible container runtime; checked September 15. Tool installation/setup remains implementation work.
- [Node releases](https://nodejs.org/en/about/previous-releases), [npm audit reference](https://docs.npmjs.com/cli/v11/commands/npm-audit), [npm ci reference](https://docs.npmjs.com/cli/v11/commands/npm-ci): supported-runtime and lockfile/audit guidance. The initial Node/npm versions are pinned for local checks; repeat advisory review before delivery.
- [Vite](https://vite.dev/guide/), [Vitest](https://vitest.dev/guide/), [Playwright](https://playwright.dev/docs/intro), [Biome](https://biomejs.dev/guides/getting-started/): modern tool responsibilities. The first offline slice pins TypeScript/Vitest/Vite/Biome; Playwright and server/UI tools enter later.
- [Ports/adapters](https://alistair.cockburn.us/hexagonal-architecture), [LiveKit workflows](https://docs.livekit.io/agents/logic/workflows/), [OTel voice traces](https://docs.livekit.io/deploy/observability/tracing/), [Render WebSockets](https://render.com/docs/websocket): patterns/candidate feasibility, not added runtime dependencies or purchased services.

## 11. Planning completion

Root/component specs define priorities, dependencies, contracts, invariants, failures, and evidence gates for review. Accepted versus proposed decisions are explicit and assigned to finite gates. The independent review identified duplicate contracts, evaluation-schema drift, and post-authorization correction wording; resolution and documentation checks are recorded in the development plan. Review with Dror before implementation. Planning completion is not submission completion.
