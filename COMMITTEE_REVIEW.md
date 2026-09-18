# Committee Review — threefold-boulder-agent

Date: 2026-09-18
Revision: `22de73f` (main, CI green)
Orchestrator: audit PM (agent); reviewers are four independent professional lenses, dispatched as parallel read-only reviewers against the working tree.

## Reviewers

| # | Role | Lens |
|---|------|------|
| 1 | Senior Backend & Distributed Systems Engineer | Architecture, state-machine correctness, concurrency/races, transaction boundaries, adapter separation, error classification, restart recovery |
| 2 | Security & Privacy Engineer | Prompt-injection surface, authorization scoping, secrets/key separation, SSRF, PII minimization, dependency posture, public identifiers |
| 3 | Voice/Conversational UX + Frontend Engineer | Spoken quality/honesty, failure handling, reviewer-facing web UI + A11Y, evaluation/writeup materials |
| 4 | **Veteran voice-agent practitioner** (priority review) | Turn-taking, barge-in, latency, ASR errors, critical-field confirmation, paraphrase risk, consequential-domain guardrails, voice evaluation methodology |
| 5 | Senior Software Architect (code quality & architecture) | Readability, cohesion, DRY, naming, error handling, message catalogs, dead code, dependency hygiene, architecture boundaries vs ADR-013 |
| 6 | Assignment-compliance & evidence-honesty reviewer | Does the code actually satisfy V0/R1–R6/D1–D3; are SPEC/EVIDENCE/DEVELOPMENT_PLAN status claims truthful and current |
| 7 | PostgreSQL / data-model & migrations expert | Migration safety, schema/constraints/indexes, query performance, transactions/locks, connection pool, retention |

---

## Priority Review — Voice-Agent Practitioner

This is the highest-weight review. The practitioner has shipped real-time spoken interfaces for years and read the voice stack in depth (`src/web/voice/*`, `src/server/voice/live-session.ts`, `src/server/reasoning/*`, `spec-design-voice.md`, `VOICE_CHECKLIST.md`, `eval/*`). Headline assessment: the split-brain architecture (live model holds the call; a separate server reasoning loop executes tools; playback is paraphrased) is reasonable for an interview, but several findings would bite a real caller or a reviewer, and most are **not** interview-scope simplifications — they are gaps in safety claims, critical-field handling, and evaluation that would be visible in a live demo.

The most consequential voice-specific findings (details in Appendix §4):

1. **Spoken "yes" reaches the effect path** — `confirmReport` runs `runConfirmation` and files a real ticket, while the prompt/spec still claim on-screen confirmation is required. A false safety claim.
2. **No critical-field confirmation for voice** — `isSpokenSpan` guards against model paraphrase, not ASR error; a misheard street name passes through and is re-read as if correct. No phonetic re-read or digit-by-digit spelling of high-stakes fields.
3. **Turn-taking is fragile** — a 500 ms quiet-period finalizer and an offset filter can force callers to repeat themselves; no cancellation of in-flight delegation on a new turn.
4. **Critical facts are paraphrased** — the Linear issue key and demo disclosures flow through `commentary.append` and can be reworded (the exact defect recorded in `eval/voice-failures/001`).
5. **Latency has no progressive feedback or cancellation** — worst case is 4 sequential 20 s model calls with only "One moment" as feedback.
6. **The emergency redirect lives only in the reasoning prompt** — the live model hears the caller first and has no urgency/emergency guidance.
7. **The eval loop is text-only** — it bypasses ASR/TTS/turn-taking/paraphrase, so "11/11 passing" does not exercise the voice channel at all.
8. **A concealment instruction** tells the live model to hide that the transfer is a simulation — the wrong guardrail for a public municipal demo.

---

## Cross-Cutting Themes

Patterns raised by two or more reviewers (systemic issues):

1. **In-memory session state vs durable DB state.** The active-draft pointer, per-session quota, and write-serialization live in a process-local `Map` (`visitor-sessions.ts`), and confirmation reads the in-memory `session.currentDraft` rather than the request/DB. Backend (#2, #3) and Voice/UX (#2) both trace visible defects to this: restart loses confirmability, serverless multi-instance breaks sessions/quotas/locking, and voice-confirmed outcomes never reach the visible panel.

2. **The confirmation gate contradicts itself.** Voice `confirmReport` calls `runConfirmation` and performs the real effect (`build-app.ts:295-298`), but `reasoning-turn.ts:51` says "the server handles effects only after on-screen confirmation" and `spec-design-voice.md:67` says "On-screen confirmation remains required." Backend (#2), Voice/UX (#1), and the practitioner (#1) independently flagged the false safety claim.

3. **Honesty / demo-limits discipline has a gap.** The simulated-transfer instruction tells the model "Do not mention being an AI, a demo, or a simulation" (`VoicePanel.tsx:66`) — contradicting the project's own "no fabricated claim" rule. Security (#2) and the practitioner (#6) note the same surface: the browser can append arbitrary instructions to the live model, and this concealment instruction is a direct instance.

4. **Untrusted-fetch hardening is incomplete.** Security (#1): nested sitemap URLs are fetched without host allowlisting, and website/events fetches have no timeout or body-size cap.

5. **`build-app.ts` and the `TicketProvider` port are the code-quality hotspots.** Backend (#5, #6) and the Architect (#1, #2) both flag the 694-line composition root and the inverted `Pick<LinearTicketProvider,…>` port; the Architect adds the scattered spoken copy (no typed message catalog), a duplicated report-type union, and 6 lint warnings of dead code.

6. **Voice evidence is not actually voice evidence.** Voice/UX and the practitioner both note `eval:conversations` is text-only (bypasses ASR/TTS/turn-taking/paraphrase), so its "11/11" result cannot substantiate V0.

7. **The evidence/docs layer has drifted from reality.** The compliance reviewer found stale test counts (166/164 vs. 190), a buried eval result, an overwritten `conversations-latest.md`, and a direct contradiction between DEVELOPMENT_PLAN ("no live ticket verified") and SPEC/EVIDENCE ("DRO-5 passed") — and the Architect/VoiceUX found `design/README.md`, `prompts/`/`knowledge/` layout, and scenario counts out of date. A systemic doc-maintenance gap, not a one-off.

---

## Naming & Folder Structure — focused pass

A dedicated scan of file naming, symbol naming, and layout conformance (against `spec/spec-architecture-system.md`):

**What is good.** File naming is uniform and conventional: kebab-case for modules (`ticket-operation-store.ts`, `reasoning-turn.ts`, `business-hours.ts`), PascalCase for React components (`VoicePanel.tsx`, `DemoApp.tsx`), and a `.test.ts` suffix on tests. Exported type names are clear noun phrases (`OfficeSchedule`, `TicketOperationOutcome`, `LocalDateTimeParts`), and function names are consistent verb-first (`runConfirmation`, `findByDraft`, `describeExistingTicket`, `withReportLock`). The `src/{core,adapters,server,web}` layout matches the spec's responsibility boundaries and there is no `utils/` dumping ground.

**Findings.**

1. **Three "confirm" modules with near-identical result-type names across two layers.** `confirm-service-report.ts` (core: hours→route/ticket decision), `confirm-outcome.ts` (server: exports `LocalConfirmResult`), and `confirmed-ticket.ts` (server: exports `ConfirmedTicketResult` and `submitConfirmedTicket`). `LocalConfirmResult` vs `ConfirmedTicketResult` are two different types whose names are one word apart — easy to import the wrong one.
2. **One concept carries three names across layers.** Linear's human identifier is `identifier` in the adapter (`linear-ticket-provider.ts`), `providerIssueKey` in the operation/outcome (`ticket-operation.ts`, store), and `issueKey` in the confirmed result and UI. One canonical name (e.g. `providerIssueKey` everywhere, or `referenceId`) would remove the translation cost.
3. **Layout drift between the spec tree and reality.** The spec's maintained tree lists `prompts/` (versioned model instructions) and `knowledge/` (reviewed corpus + provenance manifests) — neither exists; prompts are inline in `reasoning-turn.ts`/`live-session.ts` and the knowledge corpus lives in Postgres. The same tree duplicates the `service-report/` line (`spec-architecture-system.md:115-116`), and `adapters/city-website/` is labeled "calendar adapter" though it now also holds `website.ts` + `page-selector.ts`.
4. **Minor:** `currentDetails: "fresh" | "changed" | "unavailable"` is an opaque field name for "did the readback match the created issue"; and `demoLabel`/`simulated_route` vs the actual runtime string "Boulder demo: …" drift is a small magic-value/name inconsistency.

These are polish-grade (no behavior risk), but items 1–2 are worth fixing before submission because a reviewer reading the code — the explicit audience — would otherwise trip on the similar names.

---

## Member Report Summaries

**Backend (top finding / top recommendation).** The layering and DB-enforced concurrency are genuinely sound — "one operation per draft" is a unique constraint plus `FOR UPDATE`, and network calls stay outside transactions. Top finding: a crash between `start` and `finish` leaves an operation stuck in `attempting` with no lease, timestamp, or reconciliation branch — permanent limbo and a duplicate-ticket risk. Top recommendation: make `attempting` reconcilable (add `started_at`, reconcile stale `attempting` via bounded `readTicket`), and load the confirmed draft from the request rather than the in-memory pointer.

**Security (top finding / top recommendation).** Authorization scoping is consistent and correct (every query scoped by conversation/city/admission); secrets are server-only; `npm audit` is clean; no RLS is a documented single-tenant trust boundary, not a defect. Top finding: nested-sitemap fetch (`website.ts:231-240`) bypasses the host allowlist and lacks timeout/size caps — low probability but the stated invariant isn't honored. Top recommendation: allowlist nested sitemap hosts, add `AbortSignal.timeout()` + size caps, and route the department-persona instruction server-side.

**Voice/UX (top finding / top recommendation).** Spoken copy and failure states are unusually honest and complete. Top finding: a spoken "yes" can file a ticket while the prompt/spec claim on-screen confirmation is required, and voice-confirmed route/ticket outcomes never update the visible panel (`handleVoiceResult` has no such branch). Top recommendation: resolve the gate discrepancy and add the missing panel branch; separately remove the concealment instruction from the simulated transfer.

**Voice-agent practitioner (top finding / top recommendation — priority).** The split-brain architecture is defensible, but the voice path has gaps that would show in a live demo. Top finding: the confirmation gate is a false safety claim (spoken "yes" reaches the effect path), and `isSpokenSpan` protects against model paraphrase but not ASR error — a misheard street name is filed and re-read as if correct, with no phonetic confirmation of high-stakes fields. Top recommendation: resolve the gate, add explicit critical-field confirmation (re-read the exact location, spell reference IDs digit-by-digit), and move the emergency redirect into the live-model instructions. The practitioner independently corroborated the Voice/UX reviewer's concealment and paraphrase findings, and added that the text-only eval loop cannot catch any voice-layer defect.

**Architect (code quality & architecture).** The core boundary genuinely holds — `src/core` is provider-free and `check:architecture` passes; `logDatabaseError`/`runInTransaction` stayed deduplicated; type discipline (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, discriminated unions) is strong; tests use independent hardcoded expectations. Top finding: the `TicketProvider` port is inverted — defined as `Pick<LinearTicketProvider,…>` in the workflow layer instead of an independent core-owned port, leaking the adapter type into workflow, composition, and tests. Top recommendation: own the port in core, then split `build-app.ts` (694 lines) into composition + a standalone delegation-turn module; consolidate spoken copy into a typed message catalog and delete the dead code that currently produces 6 lint warnings (incl. the never-rendered city name).

**Assignment-compliance & evidence honesty.** R1–R5 and D1–D3 are genuinely implemented, and the code is real. But the evidence ledger overstates delivery in two grading-critical places: V0 is marked "Passed informally" (`EVIDENCE.md:7`) with **zero recorded audio** and a same-day documented failure showing capability invention; R3's "DRO-5 readback" is prose-only with no reproducible receipt. The status docs also contradict each other (DEVELOPMENT_PLAN still says "no live ticket verified" and "readback pending") and carry stale test counts (166/164 vs. actual 190) and a stale eval status (a real 18/22 result is buried in an eval README, not surfaced). Positive: D1 is verifiable (CI green through `22de73f`, ~50 incremental commits), D2 honestly says "No deployment," D3 is within a page and honest.

**PostgreSQL / data-model.** Seven forward-only migrations are coherent and the concurrency primitives are correct (network stays out of transactions; `FOR UPDATE` locks do their job). Two real risks: (1) the newest migration's recreated CHECK does **not** enforce the non-null `provider_issue_key` it promises for `created` rows — the DB permits a `created` row with a null key, weaker than the `ticket-operation.ts:34` contract; (2) unbounded PII retention (`observed_text` caller speech) with no TTL/purge. Lower-severity: no RLS, missing conversation-scoped indexes, no `statement_timeout`/`lock_timeout` on a 5-connection pool, no `conversations.city_id → city_policies` FK, and a few `select *`/`returning *`.

---

## Conflicts and Resolutions

No reviewer materially disagreed with another; the lenses were complementary.

- **Public Linear identifiers:** Security explicitly assessed these as "low impact, not a leak" (no credential exposed), while still recommending redaction. Resolution: redact as cheap hygiene, but do not treat it as a security incident.
- **Session persistence:** Backend flagged in-process session state as a defect that "silently" breaks serverless; this is in fact a known, open M6 item (deployment not yet finished). Resolution: accept the finding as a **blocking precondition for any D2 claim** — deployment must not ship while sessions/quotas are instance-local.

---

## Top Recommendations (Ranked by Impact)

| # | Recommendation | Raised By | Estimated Impact |
|---|---|---|---|
| 1 | **Resolve the confirmation-gate contradiction.** Make voice confirmation an explicit first-class path (spoken "yes" via `confirmReport` is sufficient) and correct `reasoning-turn.ts:51`, `spec-design-voice.md:67`, and `SPEC.md:108`; OR require an on-screen tap for voice too. Either way, add a `handleVoiceResult` branch so route/ticket outcomes render in the panel (`DemoApp.tsx:24-38`). | Practitioner + Voice/UX + Backend | High — a currently false safety claim |
| 2 | **Add explicit critical-field confirmation for voice.** Before filing, re-read the exact saved location/description and require a distinct "is that correct?"; spell reference IDs digit-by-digit. Move the emergency/urgency redirect into the live instructions (`live-session.ts:18-28`), not only the reasoning prompt. | Practitioner | High — ASR errors on street names/IDs are the highest-stakes failure |
| 3 | **Remove the concealment instruction** "Do not mention being an AI, a demo, or a simulation" (`VoicePanel.tsx:66`); keep the ring tone, have the persona acknowledge the demo. | Practitioner + Voice/UX | High — trust/honesty |
| 4 | **Make `attempting` operations reconcilable**: add `started_at`/lease; on stale `attempting`, do a bounded `readTicket` to converge to `created`/`uncertain` before creating again; handle `attempting` in `describeExistingTicket`. | Backend | High — crash-window duplicate-ticket/limbo gap |
| 5 | **Fix turn-taking robustness + latency**: parameterize/lengthen the quiet period; fall back to the last fragment by `end_ms` (not `startMs`) so callers aren't force-repeated; abort in-flight delegation on a new turn; show a "checking…" state; watch `connectionState === "disconnected"` for transient blips. | Practitioner | Medium-High — caller experience |
| 6 | **Protect verbatim facts from paraphrase**: display the issue key on screen (done) and add a live-prompt rule to read IDs/numbers character-by-character; re-run the `001` probe. | Practitioner + Voice/UX | Medium-High — a mis-spoken reference is a real honesty risk |
| 7 | **Persist active-draft pointer + quotas in Postgres**, or explicitly scope the serverless path to single-instance and document it. Blocking for D2. Also load the confirmed draft from `request.body.draftId` (scoped) in `runConfirmation`. | Backend | High — deployment correctness + restart recovery |
| 8 | **Harden fetchers**: allowlist nested sitemap hosts (`website.ts:231-240`); add timeout + size caps to `fetchDocument`/events fetch. Route the department-persona instruction server-side. | Security | Medium-High — SSRF/DoS + instruction-injection surface |
| 9 | **Extend the evaluation loop to exercise the voice channel**: recorded-audio artifacts, a latency budget, ASR-error injection (misheard streets/digits), and barge-in/correction probes. Stop citing `eval:conversations` "11/11" as voice evidence. | Practitioner | Medium-High — the current evidence doesn't cover V0 |
| 10 | **Decompose `build-app.ts` (694 lines)** and define an independent `TicketProvider` port (not `Pick<LinearTicketProvider,…>`). | Backend | Medium — readability (ADR-013) |

**Additional polish (low-medium):** enable RLS as defense-in-depth; sync docs (`design/README.md:3`, 11-vs-12 scenario count, `WRITEUP.md` "(draft)"); fix focus-outline contrast + humanize status announcements; render the city name (`fetchCityName` is dead code); redact published Linear identifiers; persist `runId` for the OBS-003 trace contract; consolidate the three "confirm" module names and unify `identifier`/`providerIssueKey`/`issueKey`; fix the `spec-architecture-system.md` layout tree (`prompts/`/`knowledge/` don't exist, duplicated `service-report/` line).

### Post-scan additions (compliance + data model)

| # | Recommendation | Raised By | Estimated Impact |
|---|---|---|---|
| A | **Fix the evidence ledger so it cannot mislead a grader.** Change `EVIDENCE.md:7` from "Passed informally" to "Not met — no recorded audio" for V0; either commit a redacted DRO-5 receipt or relabel R3 as "owner-reported, not repo-verifiable"; resolve the DEVELOPMENT_PLAN vs SPEC contradiction; refresh stale counts (190), surface the 18/22 eval result, and regenerate `conversations-latest.md`. | Compliance | High — grading integrity |
| B | **Tighten the ticket-operation CHECK + bound retention.** Add `provider_issue_key is not null` to the `created` branch (with a backfill so legacy rows pass), add a caller-data retention horizon/purge, and add conversation-scoped indexes. | Data-model | Medium-High — correctness + PII |

---

## Next Steps

1. **Decide the confirmation model and fix the voice path** (rec #1–#3): correct the prompt/spec to match reality, make voice-confirmed outcomes visible on screen, remove the concealment instruction, and add critical-field re-read + digit-by-digit reference spelling. This is the priority cluster — it removes a false safety claim and the two most caller-visible honesty defects.
2. **Close the `attempting` gap** (rec #4) with a migration + reconcile branch, before any deployed ticket path is claimed.
3. **Harden turn-taking/latency and the fetchers** (rec #5, #8) — quiet-period/offset fallback, cancellation + progress, host allowlist + timeouts.
4. **Resolve session persistence** (rec #7) before any deployment claim; do not ship serverless while sessions/quotas are instance-local.
5. **Extend the evaluation loop to the voice channel** (rec #9) so V0 is evidenced by real audio, not text-only runs.
6. **Batch the cheap polish** (rec #10 + additional polish) as a focused commit set.

---

## Appendix — Full Reviewer Reports

### Reviewer 1 — Senior Backend & Distributed Systems Engineer

**Observations**

The application is layered cleanly. Intake (`prepare-service-report.ts`) writes revisioned drafts and never routes or submits; `confirm-service-report.ts` decides `simulated_route` vs `ticket_required` from a validated DB policy and the server clock; `ticket-operation.ts` defines a provider-neutral `authorize → start → finish` contract; `confirmed-ticket.ts` performs one create/readback per authorized operation and classifies `created/uncertain/rejected` without blind retry. The Linear adapter (`linear-ticket-provider.ts:208-210`) maps timeout/abort to `ambiguous → uncertain` and verifies readback (title/description/id/identifier/team/project) before claiming success.

Concurrency is genuinely DB-enforced, not app-only. "One operation per draft" is backed by `draft_id uuid not null unique` (`20260916133000_create_ticket_operations.sql:9`) plus `FOR UPDATE` on the draft row in both `authorize` (`ticket-operation-store.ts:105-111`) and `save` (`draft-store.ts:201-215`), so correction and authorization serialize on the same row lock and the correction-vs-authorization race resolves to a clean `revision_conflict` on whichever side loses. `runInTransaction` is used only where it belongs (`draft-store.save`, `ticket-operation-store.authorize`); `start`/`finish` are single atomic `UPDATE … RETURNING` statements, and all Linear/events/website network calls sit outside any transaction. Core (`src/core`) leaks no `pg`/Linear/OpenAI types. The reasoning boundary validates names/arguments (`agent-tools.ts:102-167`) and derives scope, draft identity, revision, and observations from server state, never from model args.

**Pushbacks**

1. **A crash between `start` and `finish` is unrecoverable.** `start` flips `ready→attempting` with no lease or timestamp (`ticket-operation-store.ts:192-207`). If the process dies after Linear has actually created the issue but before `finish` persists, the row is stuck in `attempting` forever: `start` only ever transitions from `ready`, and `describeExistingTicket` has no branch for `attempting` (`confirmed-ticket.ts:200-207`), so it falls to `describeRecordedTicket` and returns `ticket_uncertain` with `linear_outcome_not_verified` — and no code path ever calls `finish` again. This is the inverse of fabricated success: permanent limbo with no reconciliation, and a real risk of a duplicate if the caller starts a fresh draft. It contradicts the stated "reconcile uncertain writes" intent (`ticket-operation.ts:1-5`).

2. **Confirmation depends on the in-memory pointer, not the durable draft.** `runConfirmation` loads via `session.currentDraft?.draftId ?? null` (`build-app.ts:618`), not `request.body.draftId`. After a restart (or once the pointer is cleared), a valid `{draftId, revision}` confirms as `missing_draft` — the drafts are durable but the confirm path is not. The request's `draftId` is only used for comparison.

3. **In-memory session state conflicts with the Vercel deployment.** `visitor-sessions.ts` keeps sessions, `currentDraft`, `delegationCount`, `failedAttempts`, and the `reportWork` serialization chain in a process-local `Map` (`visitor-sessions.ts:80-86`, `build-app.ts:155-165`). Serverless multi-instance deployment breaks session continuity, the per-session write lock, and the quota limits — all silently.

4. **Double-submit of confirm yields a confusing result.** Two concurrent confirms: the loser's `start` returns `found` on an `attempting` op and reports `ticket_uncertain` even though the winner succeeds (no duplicate is created — the guard holds — but the caller hears "uncertain" for a success).

5. **`build-app.ts` is an over-large composition root** (694 lines): route registration, tool dispatch, frozen-draft logic (`:300-316`), spoken-span validation (`isSpokenSpan`, `:688`), reasoning orchestration, and confirmation all live in one function. The `executeDelegatedTool` closure in particular mixes reasoning and workflow concerns.

6. **Minor layering inversion:** `TicketProvider` is defined as `Pick<LinearTicketProvider, …>` (`confirmed-ticket.ts:17-20`), deriving the workflow port from the concrete adapter type rather than an independent interface.

**Recommendations**

1. **Make `attempting` reconcilable (highest impact).** Add a `started_at` column (and lease/timeout) to `app.ticket_operations`; on `start` returning a stale `attempting` op, perform a bounded `readTicket` to reconcile into `created`/`uncertain` before ever creating again. At minimum, handle `attempting` explicitly in `describeExistingTicket` and in `finish`'s WHERE guard. This closes the crash-window duplicate/limbo gap.

2. **Load the confirmed draft from `request.body.draftId`** in `runConfirmation` (scoped via `context`), keeping the in-memory pointer only as a voice-turn convenience. This restores restart-recoverable confirmation and removes the hidden dependency on `session.currentDraft`.

3. **Resolve the session/deployment mismatch explicitly.** Either persist the active-draft pointer and quotas in Postgres (so sessions survive restart and share across instances), or scope the serverless path to single-instance/dev and document the limitation. Do not silently rely on the in-process `Map`.

4. **Decompose `build-app.ts`:** extract the delegated-tool executor and frozen-draft handling into `reasoning/delegated-tools.ts` (or `workflow/`), and move route registration into smaller files. Define an independent `TicketProvider` port (e.g., in `core/service-report/ticket-operation.ts`) instead of `Pick<LinearTicketProvider,…>`.

5. **Serialize/dedupe concurrent confirms** so a double-submit returns the eventual `created` receipt rather than a transient `uncertain`.

---

### Reviewer 2 — Security & Privacy Engineer

**Observations**

**Prompt/tool injection surface.** Caller speech is wrapped as a JSON `user` message while system rules sit in a `developer` message (`reasoning-turn.ts:117-131`; voice instructions at `live-session.ts:18-28`). Retrieved website text is the largest untrusted-to-model channel: `lookupCityWebsite` returns `pageText` (bounded 6,000 chars, `website.ts:32`) straight into the tool result the model reads (`knowledge-tools.ts:126-136`). Linear readback (identifier/title/description) is stored and spoken but is *not* fed back into any reasoning turn (`confirmed-ticket.ts:101-139,163-236`). Report fields from the model must be exact spans of the caller's utterance (`build-app.ts:326-337`, `isSpokenSpan` 688-694), tool args are validated against a closed catalog (`agent-tools.ts:177-217`), and `confirmReport` takes no model args — it uses the server's `currentDraft` (`build-app.ts:295-299`). One overlooked channel: the browser holds the OpenAI WebRTC data channel and can append arbitrary `session.instructions.append` / `session.commentary.append` (`live-voice.ts:223-264`).

**Authorization scoping.** Consistent and correct. Every store query is scoped by `conversation_id` + `city_id` + `admission_id` (`draft-store.ts:84-98,149-175`; `ticket-operation-store.ts:61-68,93-103,192-206,246-256,286-299`). `cityId` is fixed from `CITY_ID` env, never caller-selected (`main.ts:41-54`). No cross-conversation `WHERE` omission found; the un-scoped `select * from app.ticket_operations where draft_id=$1` (`ticket-operation-store.ts:134`) is safe because `draft_id` is unique and already proven to belong to the conversation.

**Secrets.** Server-only. No `VITE_`/`import.meta.env` usage, no keys in `src/web/*`; keys reach providers only in `page-selector.ts:55`, `reasoning-turn.ts:192`, `live-session.ts:55`, `linear-ticket-provider.ts:186`. `.env.local`/`.env.dev` are untracked and gitignored; `.env.example` holds only a labeled loopback placeholder. Git history grep found no real secrets. Error logging emits only an error `code` (`log-database-error.ts:18-20`).

**SSRF.** `baseUrl`/`eventsListingUrl` are validated HTTPS from the DB row (`city-policy-store.ts:109-110,306-310,322-328`); page URLs are host-matched from the sitemap (`website.ts:137-163`) and the model selector can only return a pre-approved candidate (`page-selector.ts:281-284`). Gaps: nested sitemap page URLs are fetched **without** host validation (`website.ts:231-240`), and city-website/events fetches have no timeout or body-size cap (`website.ts:212-222`; `events.ts:123-138`), unlike the OpenAI/Linear calls.

**PII.** `observed_text` (caller words, ≤4000 chars) is persisted; raw audio never reaches the server (WebRTC is browser↔OpenAI; server only exchanges SDP). OpenAI calls use `store:false`. Correlation IDs are random UUIDs; `runId` isn't persisted (trace boundary deferred, `AUDIT.md:41`).

**Dependencies.** Minimal and pinned; `npm audit` reports 0 vulnerabilities.

**Public identifiers.** `README.md:9` and `EVIDENCE.md:22` expose the Linear workspace slug `hamaarag`, project UUID `96d0aa81-ab4c-48c1-996a-9c1c1bc45780`, issue keys HAM-10/11/12, team "Drore", and demo ticket DRO-5.

**Pushbacks**

- **Nested-sitemap SSRF is a real, if low-probability, gap.** `website.ts:231-240` fetches `<loc>` entries matching `sitemap.xml?page=\d+` without confirming they share the base host. An attacker would need to control `bouldercolorado.gov`'s sitemap index (site compromise), so this is not caller-exploitable today, but the allowlist invariant is stated in the module header (`website.ts:7-8`) and not fully honored. No timeout/size limit on these fetches compounds it — a hung or huge response can tie up the server and read unbounded memory.
- **Client-held instruction channel is unmentioned in the threat model.** The browser can steer the live model via `session.instructions.append` (`live-voice.ts:250-264`). Because all effects still flow through the validated server tool path, impact is limited to a caller steering their own conversation — but any XSS in the served bundle (`@fastify/static`, `static-web.ts`) would inherit this steering surface, and the docs describe instruction injection as server-owned (`live-session.ts:18`).
- **No RLS; table grants are the only boundary.** Migrations revoke `public/anon/authenticated/service_role` and grant `app_runtime`, but never `enable row level security`. That is adequate for a single-tenant backend and matches the stated design, yet a leaked `app_runtime` credential yields full read of every conversation and draft. Not flagged as a defect — a documented trust boundary, not an accidental omission.
- **The published Linear identifiers are low impact, not a leak.** No API key or credential is exposed; project UUIDs and issue keys are reconnaissance/social-engineering material at most, and the workspace slug is visible in the linked URLs themselves.

**Recommendations**

1. **Allowlist nested sitemap hosts and bound the fetcher.** In `website.ts:231-240`, parse each nested `<loc>` through the same host check `parseSitemap` applies (reject non-matching hosts), and add `AbortSignal.timeout()` plus a `Content-Length`/stream size cap to `fetchDocument` and the events fetch (`website.ts:212-222`, `events.ts:123-138`).
2. **Route the department-persona instruction through the server.** Replace the browser's direct `sendInstruction` (used for simulated transfer) with a server-mediated instruction that is validated server-side, so the browser bundle is not a general instruction-injection surface and any XSS cannot steer the live model (`live-voice.ts:250-264`).
3. **Enable RLS as defense-in-depth.** Add `alter table ... enable row level security` with an `app_runtime` policy scoped to its own rows, preserving current behavior while bounding the blast radius of a leaked DB credential (all `supabase/migrations/*.sql`).
4. **Redact published Linear identifiers.** Replace `hamaarag`, the project UUID, and issue keys in `README.md:9` / `EVIDENCE.md` with generic labels; rotate the referenced ticket if re-verified.
5. **Persist `runId`/trace correlation** so the documented `OBS-003` contract is met and prompt/retrieval provenance is auditable (`AUDIT.md:41`).

---

### Reviewer 3 — Voice/Conversational UX + Frontend Engineer

**Observations**

**Spoken honesty and clarity.** The fixed spoken action copy is thorough and self-qualifying: `speechForAction` in `VoicePanel.tsx:30-51` covers every outcome and says "This is a demo, so no call is actually made", "nothing was filed", and "I won't file a second one" for uncertainty. The Live prompt (`live-session.ts:18-28`) and the reasoning prompt (`reasoning-turn.ts:27-54`) both insist on no capability invention and no premature success claims. Knowledge tools fail closed and attach limitations (`knowledge-tools.ts:102,160-161,192-218`); events are capped at three with an honest "times and cancellations on the detail page" caveat.

**Failure handling.** Mic denial, disconnect, unconfirmed close, and uncertain ticket states are all surfaced honestly (`VoicePanel.tsx:322-331,341-343`; `live-voice.ts:121-125,379-403`). The audio-play rejection yields a useful "Select Play" message (`live-voice.ts:115-118`).

**Web UI.** One screen with clearly headed sections, `role=status/alert/log`, labeled fields, 44px buttons, and visible focus (`styles.css:23-29,174-181`). Inline sources appear with each answer (`KnowledgePanel.tsx:41-50`). State is visible via the draft badge (`ReportPanel.tsx:20-28`).

**Confirmation path.** The `confirmReport` tool is wired to `runConfirmation` (`build-app.ts:295-298,586-636`), which executes routing or ticketing, and `handleDelegation` announces the result by voice (`VoicePanel.tsx:249-271`). Separately, `design/README.md:3` still says "no interface is implemented" despite a full implementation.

**Pushbacks**

1. **Spoken "yes" can file a ticket, contradicting the stated on-screen-confirmation gate.** `confirmReport` is reachable by the model in a voice turn and calls `runConfirmation`, which performs the real effect (`build-app.ts:295-298`). Yet the prompt says effects happen "only after on-screen confirmation" (`reasoning-turn.ts:51`) and the spec says "on-screen confirmation remains required" (`spec/spec-design-voice.md:67`). Either the tool should return `needs_confirmation` (forcing screen review) or the instructions/spec must admit spoken confirmation is sufficient — as written, the safety claim is false for voice.

2. **Voice-confirmed actions never reach the visible panel.** `handleVoiceResult` in `DemoApp.tsx:24-38` has branches only for `needs_input/needs_confirmation`, `answered/limited_coverage`, and `blocked`. A route/ticket outcome produced by a spoken "confirm" updates no React state, so the screen keeps showing "Ready for review" while the voice announces "I filed a ticket" — a direct state-visibility defect.

3. **The simulated transfer instructs the model to conceal that it is a simulation.** `announceSimulatedTransfer` tells the live model to "act as the ${department} desk … Do not mention being an AI, a demo, or a simulation" (`VoicePanel.tsx:65-67`). A caller can plausibly believe they reached a real staff member; this contradicts the project's own honesty rule that the failure mode to avoid is a "wrong or fabricated claim" (`VOICE_CHECKLIST.md:33`).

4. **Critical strings are paraphrased, not verbatim.** Commentary appends are "paraphrased by the live model" (`spec-design-voice.md:51`). The fixed honest copy in `speechForAction` — including the Linear issue key — can be reworded or misread, the exact defect recorded in `eval/voice-failures/001-gpt-live-paraphrase.md`. A mis-spoken reference ID is a real honesty risk with no enforcement beyond prompt text.

5. **A11y/visibility gaps.** The focus outline `#e8a63a` on white is ~1.9:1, below the WCAG 3:1 non-text requirement (`styles.css:23-29`); `role="status"` announces the raw enum "Voice: connecting/disconnected" rather than human phrasing (`VoicePanel.tsx:373`).

6. **Stale and dead documentation/code.** `design/README.md:3` says the interface is not implemented; `fetchCityName` is imported but never called and `cityName` is never rendered (`DemoApp.tsx:8,18`), so the reviewer never sees "Boulder" — the header is generic "City service demo". `eval/README.md:50` reports "11/11 scenarios pass" while `conversation-scenarios.json` now contains 12, and the checked-in `conversations-latest.md` shows only the single `website-follow-up` scenario.

**Recommendations**

1. **Resolve the confirmation-gate discrepancy (highest impact).** Make voice `confirmReport` return `needs_confirmation` so an on-screen click is required for effects, or rewrite `reasoning-turn.ts:51` and `spec-design-voice.md:67` to state spoken confirmation is sufficient — and in the latter case, add a `handleVoiceResult` branch so route/ticket outcomes render in `ReportPanel`. Do not ship with the two statements contradicting each other.

2. **Remove the concealment instruction.** Keep the department-persona ringtone flourish but drop "Do not mention being an AI, a demo, or a simulation" (`VoicePanel.tsx:66`) and have the persona line acknowledge the demo.

3. **Protect critical spoken facts from paraphrase.** Display reference IDs on screen (already done in `ReportPanel.tsx:103-109`) and add a live-prompt rule to read IDs/numbers character-by-character; re-run `VOICE_CHECKLIST` plus the `001` probe before submission.

4. **Fix A11y and surface the city.** Raise focus-outline contrast, humanize the status announcement, and either call `fetchCityName` and render it or delete the dead code so the demo identifies Boulder.

5. **Sync docs.** Update `design/README.md:3` to reflect the implemented UI, reconcile the 11-vs-12 scenario count, and remove "(draft)" from `WRITEUP.md:1` once finalized. The writeup itself is honest and appropriately scoped.

---

### Reviewer 4 — Veteran Voice-Agent Practitioner (priority)

**Observations**

The voice stack is genuinely split-brain: `gpt-live-1` holds the conversation (WebRTC, `src/server/voice/live-session.ts:9,18-28`), while the browser assembles caller text and the server runs a separate `gpt-5.6-luna` tool-calling turn (`src/server/reasoning/reasoning-turn.ts:88`). Transcript assembly is offset-based: `collectCallerText` keeps only fragments whose `startMs` precedes the delegation offset (`src/web/voice/voice-helpers.ts:19`), and `waitForCallerText` finalizes on a 500 ms quiet period within a 2 s window (`voice-helpers.ts:5-7,27-50`). Delegations are serialized through a promise chain (`src/web/components/VoicePanel.tsx:315`). Spoken results go back via `session.commentary.append`, which the spec explicitly acknowledges is paraphrased, not verbatim (`spec/spec-design-voice.md:51`); behavior changes (the simulated-transfer persona) use `session.instructions.append` (`VoicePanel.tsx:65-67`).

The reasoning turn is bounded: 4 tool calls max, 20 s per request, 600 output tokens (`reasoning-turn.ts:13-18`). A model-proposed report field is accepted only if it is an exact substring span of the (already-transcribed) utterance (`src/server/build-app.ts:326-337,688-694`). The action copy for route/ticket outcomes is fixed and self-qualifying (`VoicePanel.tsx:30-51`). The one recorded voice failure documents live-model paraphrase, truncation, capability invention, and noise-as-turn (`eval/voice-failures/001-gpt-live-paraphrase.md`).

**Pushbacks**

1. **Spoken "yes" reaches the effect path, contradicting the stated on-screen gate.** `confirmReport` is a callable tool that runs `runConfirmation` directly (`build-app.ts:295-299`), which files a real Linear ticket or routes. Yet `reasoning-turn.ts:51`, `spec-design-voice.md:67`, and `SPEC.md:108` all assert on-screen confirmation is required. A caller who says "yes" to a spoken summary can create a ticket with no screen tap. This is a false safety claim, not an interview-scope simplification.

2. **Voice-confirmed outcomes never reach the visible panel.** `handleVoiceResult` (`src/web/components/DemoApp.tsx:24-38`) handles `needs_input/needs_confirmation`, `answered/limited_coverage`, and `blocked` — but not `simulated_route` or `linear_ticket_created`. So the screen stays "Ready for review" while the voice announces "I filed a ticket". The `speechForAction` path is only driven by the on-screen `confirm` button, so a voice-confirmed ticket is spoken by the *model*, paraphrased, never by the fixed copy.

3. **`isSpokenSpan` guards against model paraphrase, not ASR error.** It checks the model's field is a substring of the transcribed utterance (`build-app.ts:688-694`). If ASR mishears "15th and Pine" as "50th and Pine", the span check passes — the draft is grounded to the wrong street, and the confirmation summary re-reads the wrong street. For a municipal agent, street names/reference IDs are the highest-stakes fields and there is no phonetic re-read, digit-by-digit spelling, or explicit confirm of the exact location string. Conversely, a benign mismatch ("fifteen" vs "15", hyphenation) silently drops the field rather than triggering clarification (`build-app.ts:327-333`).

4. **Critical facts are paraphrased with no verbatim protection.** The Linear key (e.g. "DRO-5") and demo disclosures flow through `session.commentary.append`, which the live model may reword (`spec-design-voice.md:51`). Failure 001 shows exactly this behavior. No live-prompt rule mandates reading IDs character-by-character.

5. **The quiet-period finalization will misfire.** 500 ms is short for natural speech; a mid-sentence pause triggers premature delegation. Worse, the offset filter (`voice-helpers.ts:19`) can exclude final-transcript deltas that start after the delegation offset, yielding an empty utterance → "I did not catch the request" (a forced repeat). The spec itself flags this as unverified (`spec-design-voice.md:67`).

6. **A concealment instruction undermines the honesty posture.** The simulated-transfer persona is told "Do not mention being an AI, a demo, or a simulation" (`VoicePanel.tsx:66`), immediately before `speechForAction` says "This is a demo, so no call is actually made." For a public-facing municipal demo, instructing the live model to conceal its simulation is the wrong guardrail direction.

7. **Latency has no progressive feedback and no cancellation.** Worst case is 4 sequential 20 s model calls (`reasoning-turn.ts:13,133`), during which the only feedback is the live model's "One moment" (`live-session.ts:24`). The browser's delegation `fetch` has no timeout/abort (`VoicePanel.tsx:232`), and the serialized queue means a mid-turn correction waits behind the whole chain.

8. **The emergency redirect lives only in the reasoning prompt.** `reasoning-turn.ts:50` handles urgency, but the live model hears the caller first and its instructions (`live-session.ts:18-28`) contain no emergency/urgency redirection — so an urgent call can be answered (or placated) before any delegation happens.

9. **The eval loop is text-only and cannot catch these.** `eval:conversations` drives `/api/local/delegation` directly with an LLM caller (`eval/README.md:31-45`); it bypasses ASR, TTS, turn-taking, barge-in, and the paraphrase layer where failure 001 occurred. The rubric (`eval/conversation-rubric.md`) has no latency, audio, or turn-taking dimension.

**Recommendations**

1. **Resolve the confirmation-gate contradiction (highest impact).** Either make voice `confirmReport` return `needs_confirmation` and require an on-screen tap, or admit spoken confirmation is sufficient and correct `reasoning-turn.ts:51`, `spec-design-voice.md:67`, and `SPEC.md:108`. In both cases add a `handleVoiceResult` branch so route/ticket outcomes render in `ReportPanel` (`DemoApp.tsx:24-38`).

2. **Add explicit critical-field confirmation for voice.** Before `confirmReport`, mandate a spoken re-read of the exact saved location/description with a distinct "is that correct?" turn; spell IDs digit-by-digit. Add an emergency-redirect line to the live instructions (`live-session.ts:18-28`), not just the reasoning prompt.

3. **Protect verbatim facts.** Display the issue key on screen (already partly done) and add a live-prompt rule to read IDs/numbers character-by-character; re-test the `001` probe against the current prompt.

4. **Remove the concealment instruction** in `VoicePanel.tsx:66`, or reword to "speak as the department desk while still being clear this is a simulated routing."

5. **Fix turn-taking robustness.** Lengthen/parameterize the quiet period, and add a fallback when the final transcript is excluded by the offset (e.g., use the *last* fragment by `end_ms` rather than `startMs`), so callers aren't force-repeated.

6. **Add cancellation and progress.** Abort in-flight delegations on a new caller turn (don't just serialize), and show a "checking…" state during the server round-trip.

7. **Harden the transport.** Watch `connectionState === "disconnected"` (transient blips), not only `"failed"` (`live-voice.ts:121-125`), with a reconnecting status.

8. **Extend evaluation.** Add recorded-audio artifacts, a latency budget check, ASR-error injection (misheard street names/digits), and barge-in/correction probes; note that `eval:conversations` 11/11 passing does not exercise the voice channel.

---

### Reviewer 6 — Assignment-Compliance & Evidence-Honesty

**Observations**

**V0 (voice agent).** The requirement (SPEC.md:32) is a *fresh reviewer speaking/hearing through the delivered link*. Code is real and substantial: GPT-Live/WebRTC browser voice (`src/server/voice/live-session.ts`, `src/web/voice/live-voice.ts`, `VoicePanel.tsx`), delegation wiring, and fake-based tests. But there is **zero recorded audio** anywhere in the repo (no `.wav/.mp3/.webm/…`, confirmed by search). The only artifacts are prose: an owner's report "worked really well" (EVIDENCE.md:7) and — tellingly — a *failure* case on the same day showing paraphrasing and capability invention (`eval/voice-failures/001-gpt-live-paraphrase.md:1–17`). SPEC.md:32 honestly says "formal recorded/deployed voice proof pending," but EVIDENCE.md:7 labels V0 "Passed informally." Code exists; evidence of a working spoken run does not.

**R1–R5.** All five are implemented and deterministically tested: code/website answers (`src/server/reasoning/knowledge-tools.ts`, `src/adapters/city-website/`), live cached events (`events.ts`), two mock routes, DB-backed hours (`src/core/business-hours.ts`), and a real Linear create/readback path with team/project verification (`confirmed-ticket.ts:95–139`, `linear-ticket-provider.ts:257–314`). Statuses consistently append "spoken proof pending" — honest. R3's DRO-5 "created and independently read back" is asserted in SPEC.md:35,67, README.md:5, and EVIDENCE.md:10, but it is **prose only**: no recorded receipt/JSON/transcript exists in-repo (grep for `DRO-5` returns documentation and code comments, no evidence artifact).

**R6.** The eval machinery is genuinely runnable and meaningful. `eval/reasoning-cases.json` holds 11 cases; `scripts/eval-conversations.mjs` runs a real caller/critic loop against a live server. The 11/11 conversation run is real — 25/25 assertions pass in `eval/results/conversations-2026-09-17T17-20-50-437Z.json`. The reasoning eval recorded 18/22 (82%) on 09-17 (eval/README.md:19). I ran `npm run test:db`: **190 tests pass** (21 files), not the claimed 164/166.

**D1–D3.** D1 is verifiable and true: `git log` shows ~50 incremental Conventional Commits; `gh run list` shows CI **success** on the public repo through the latest commit (`22de73f`). D2 correctly states "No deployment." D3 (WRITEUP.md, 22 lines) is within a page and honestly lists cuts/limitations.

**Pushbacks**

1. **V0 "Passed informally" (EVIDENCE.md:7) — the most misleading gate.** The single hardest assignment gate is marked passed on an owner's verbal self-report with no recorded audio, and a same-day documented failure (voice-failures/001) shows the voice was inventing capabilities. A grader reading "Passed" will not notice the absence of proof unless they cross-check SPEC.md:32. This overstates delivery.

2. **R3 "DRO-5 readback" is unverifiable in-repo.** SPEC.md:35,67, README.md:5 and EVIDENCE.md:10 state the live create/readback as fact, yet ADR-002 itself warns "Local records or generated mockup IDs cannot substitute for a current Linear read" — and no current read is stored. The claim is plausible and the code supports it, but there is no reproducible artifact; it is an owner assertion, not repo-verifiable evidence.

3. **Internal contradiction on the Linear ticket.** DEVELOPMENT_PLAN.md:10 ("no live ticket has been verified") and §9 line 285 ("actual issue readback still pending") directly contradict the DRO-5 pass claimed in SPEC/README/EVIDENCE. Both cannot be true; this document was never updated past 09-16.

4. **Stale test counts.** EVIDENCE.md:13 says 166/166, SPEC.md:38 and WRITEUP.md:18 say 164/164; the actual `npm run test:db` is **190**. The evidence ledger was not refreshed, and three documents disagree.

5. **Stale "eval:reasoning awaits a fresh paid run."** SPEC.md:38 and WRITEUP.md:18 both say this, but eval/README.md:19 records an 18/22 (82%) run on 09-17. The honest result (82%, three real tool-selection failures) is *not* surfaced in the status docs — it is buried in an eval README.

6. **`conversations-latest.md` no longer reflects 11/11.** A later focused re-run overwrote it, so the checked-in "latest" report shows only one scenario (`website-follow-up`, conversations-latest.md:7). A reviewer opening the named artifact sees 1 scenario, not 11.

7. **Minor overstatement — README.md:50.** "including the … closed-hours ticket path" for the conversation loop is misleading: the runner never confirms while closed (`eval-conversations.mjs:9–11`), so it exercises speech only, never creates a ticket.

**Recommendations**

1. **Fix V0 honesty (highest grading impact).** Change EVIDENCE.md:7 from "Passed informally" to "Not met — text/fake tests only; no recorded audio," and move V0 to an explicit "unmet/P0-open" status. Optionally record a ~2-minute audio/transcript against VOICE_CHECKLIST.md, which would legitimately close the gate.

2. **Make R3 reproducible or explicitly downgrade it.** Either commit a redacted JSON receipt of the DRO-5 readback under `eval/results/`, or relabel the claim "owner-reported live result, not repo-verifiable" across SPEC.md:35,67, README.md:5, and EVIDENCE.md:10.

3. **Resolve the DEVELOPMENT_PLAN contradiction.** Update DEVELOPMENT_PLAN.md:10 and §9:285 to match the DRO-5 outcome (or revert the claim if it can't be reproduced), and bump its `last_updated`.

4. **Refresh counts and eval status.** Set all three docs to "190 tests" and replace "awaits a fresh paid run" with the recorded 18/22 result and its three failures (SPEC.md:38, WRITEUP.md:18, EVIDENCE.md:13).

5. **Regenerate `conversations-latest.md`** (or make the runner tag focused runs so they don't overwrite "latest") so the 11/11 claim matches the artifact.

6. **Credit the underclaim and reflect the 09-18 commits** — the dynamic live-website lookup (`d9f6ec6`) and the Linear-identifier/frozen-draft fixes (`81b2dfe`, `22de73f`) are implemented/tested but absent from every status doc's `last_updated` (all ≤ 09-17).

---

### Reviewer 7 — PostgreSQL / Data-Model & Migrations

**Observations**

Seven migrations, ordered by `YYYYMMDDHHMMSS` timestamp prefix, all `CREATE`/`ALTER` forward-only and namespaced under schema `app`. The first (`20260916091131_create_pothole_draft_store.sql`) creates the schema and revokes it from `public`, then creates `conversations`, `observations`, `request_drafts`, and the `nologin` role `app_runtime` with table/column grants; it also `revoke`s `public, anon, authenticated, service_role`. The seed migration (`20260916094444_seed_boulder_city_policy.sql`) creates `city_policies` (PK `city_id`, `jsonb policy` with six key-existence CHECKs) and inserts one Boulder row. `20260916133000_create_ticket_operations.sql` adds `unique (id, conversation_id)` to `request_drafts`, creates `ticket_operations` with `draft_id uuid not null unique` plus a composite FK `(draft_id, conversation_id) → request_drafts (id, conversation_id)`, and a table-level state/reason CHECK. `20260916143000` widens the request-type CHECK and adds `request_type` to `ticket_operations`. `20260917120000` adds `display_name`/`events_listing_url` to `city_policies` and creates `city_knowledge` (`on delete cascade` to `city_policies`). `20260917160000` adds `website_base_url`. The newest (`20260917180000_ticket_operation_provider_key.sql`) adds nullable `provider_issue_key`, drops the auto-named CHECK `ticket_operations_check`, and re-adds it including the new column, then grants column UPDATE.

RLS is never enabled (`enable row level security` appears nowhere); access is enforced purely by `app_runtime` table/column grants. No `create index` statements exist anywhere — indexing relies entirely on PK/UNIQUE/FK-constraint indexes. `main.ts:32-38` creates the pool with only `max: 5` (plus `ssl: { rejectUnauthorized: true }` in reviewer mode); no `statement_timeout`, `lock_timeout`, `connectionTimeoutMillis`, `idleTimeoutMillis`, or `application_name`. Transactions use `runInTransaction` (`run-in-transaction.ts`) with manual `begin`/`commit`/`rollback`; `authorize` and `save` take `FOR UPDATE` locks on `request_drafts`, while `start`/`finish` are single atomic `UPDATE … FROM conversations` statements outside any transaction (no network I/O inside a transaction — correct).

**Pushbacks**

1. **The recreated CHECK does not enforce its own stated invariant.** `ticket-operation.ts:34` requires `providerIssueKey` for a `created` outcome and the migration comment ("new creations always record one") promises a non-null key, yet the `created` branch of the CHECK in `20260917180000_ticket_operation_provider_key.sql:17-19` only requires `provider_issue_id/title/description/fetched_at` and `reason is null` — `provider_issue_key` is unconstrained there. The DB allows a `created` row with `provider_issue_key IS NULL`, so the constraint is weaker than the contract. (The migration is otherwise safe on existing data: the column is nullable and the recreated CHECK is a superset that still passes legacy `created` rows.)

2. **No RLS as defense-in-depth.** `spec/spec-tool-integrations.md:51` states "RLS must be enabled on exposed tables"; migrations only revoke roles and grant `app_runtime`. Since `app_runtime` connects directly (not via PostgREST), RLS would still apply to it, bounding a leaked credential. Already flagged as a documented trust boundary, not a defect — but it remains the top security hardening gap.

3. **Missing secondary indexes.** `observations.conversation_id` (FK, no index) is filtered by `draft-store.ts:167-171` (`where conversation_id = $1 and id = any($2)`); the `unique (id, conversation_id)` index leads with `id`, so it cannot serve a conversation-scoped lookup. `request_drafts.conversation_id` and `ticket_operations.conversation_id` are likewise unindexed (used by cleanup/scoped reads). Low severity for single-tenant volume, but every conversation-scoped read is a seq scan.

4. **Unbounded PII retention.** `observations.observed_text` (caller speech), plus `conversations`/`request_drafts`/`ticket_operations`, have no TTL, retention window, or scheduled purge. `DECISIONS.md:62` acknowledges retention needs design, but no bound exists in code or migrations.

5. **No timeout/lock guards.** A runaway query or a deadlocked `FOR UPDATE` in `save`/`authorize` can hold one of only 5 pool connections indefinitely, exhausting the pool with no `statement_timeout`/`lock_timeout`.

6. **No `conversations.city_id → city_policies(city_id)` FK.** `openConversation` (`draft-store.ts:53-57`) inserts an arbitrary `city_id` without existence validation; only `main.ts:46-49` validates the single configured city at startup.

7. **Minor:** `select *`/`returning *` on `ticket_operations` (`ticket-operation-store.ts:134,163`) return `created_at`/`updated_at` absent from `OperationRow`; the `drop constraint ticket_operations_check` (`…provider_key.sql:9`) relies on the default table-CHECK name. `findByDraft` compares revision in JS (`:72`) after fetching the row — harmless.

**Recommendations**

1. **Tighten the CHECK to match the contract** (highest correctness risk): add `and provider_issue_key is not null` to the `created` branch of `ticket_operations_check`, with a follow-up `update … set provider_issue_key = coalesce(provider_issue_key, provider_issue_id) where state='created' and provider_issue_key is null` (or an explicit accepted-null decision) so existing rows satisfy it before the constraint is re-validated.

2. **Add caller-data retention.** Introduce a bounded retention window (e.g. `observed_at < now() - interval` purge) or a `updated_at`/`created_at` index plus a scheduled cleanup; at minimum document the retention horizon and a manual purge path, since `app_runtime` cannot DELETE today.

3. **Enable RLS** (`alter table … enable row level security`) with an `app_runtime` policy scoped per-row, preserving current grants while bounding blast radius (per `spec-tool-integrations.md:51`).

4. **Add indexes:** `create index on app.observations (conversation_id); create index on app.request_drafts (conversation_id); create index on app.ticket_operations (conversation_id);` (or at minimum `observations(conversation_id)`).

5. **Harden the pool** (`main.ts:32-38`): set `statement_timeout`, `lock_timeout`, `connectionTimeoutMillis`, `idleTimeoutMillis`, and an `application_name` for diagnostics.

6. **Add the missing FK** `conversations.city_id → city_policies(city_id)` or validate the city in `openConversation`.

7. **Replace `select *`/`returning *`** with explicit column lists in `ticket-operation-store.ts` to keep `OperationRow` authoritative.

Items 3–7 are "acceptable for an interview-scope take-home"; items 1 and 2 are real risks worth fixing before any live deployment.
