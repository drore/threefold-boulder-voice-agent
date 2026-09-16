---
title: Assignment-first development and delivery plan
version: 1.0-review
last_updated: 2026-09-16
owner: Dror Elovits
---

# Detailed development plan

Status: the local React form saves and confirms a pothole draft; the server reads the DB-backed Boulder policy and displays a simulated route when open or an honest no-ticket result when closed. Three reviewed code/service/event examples answer through the tool boundary and local browser. A narrow Linear create/read adapter passes loopback mock tests but is not wired into the report workflow; no external action occurs. Voice, broader information and events, real Linear tickets, a second mock department, and delivery remain incomplete. [SPEC](SPEC.md) is the source of truth for behavior/scope; component specs own contracts. This plan owns task sequencing, evidence, and commits. Existing commands are documented in README; unimplemented commands below remain future targets.

## 1. Outcome and delivery boundary

P0 delivers one browser voice journey for Boulder, one actual municipal-code answer, one official website answer, one dated city-event answer, a confirmed real Linear demo ticket, two observable mock department routes, deterministic Supabase-backed business hours, and a compact evaluation setup. Submission includes reviewer-accessible Git history, a tryable link, <=1-page writeup, and debugging readiness.

P0 also includes required-field confirmation, session-scoped access, safe one-operation handling, a readable correlation ID across the action path, and small provider boundaries. Each serves the demonstrated path; broader resilience and telemetry work can follow if needed.

This is an interview exercise with a suggested 4–6-hour time box, not a municipal product build. The milestone tasks below are a risk/acceptance checklist, not a request to implement every possible resilience mechanism. Choose the smallest working implementation that proves the six capabilities: one city, two supported staff intents, one voice screen, one real Linear demo destination, a small reviewed information/events corpus, DB-backed hours, and a compact test/evaluation set. Do not spend time on a general configuration framework, provider plugin system, analytics product, staff UI, or production telephony. Where a basic path is still missing, prioritize that path over deeper hardening. If the target cannot be met, ship the strongest working subset and describe the cut accurately.

Engineering quality follows SPEC ADR-013: simple human-readable code, clear naming/control flow, single responsibility at useful boundaries, small cohesive modules, minimal dependencies, and DRY for shared rules/contracts/workflows. Every slice reviews these criteria; abstractions need actual reuse or a useful external boundary. Do not trade clarity for cleverness or compress code merely to reduce line count.

P1: ticket-always execution, tone, representative view, replay/shadow runner/comparison UI. P2: telephony, other cities/providers, broader code/topic coverage, distributed workers, measured scale. Do not start P1 while a P0 gate is missing.

Initial baseline: TypeScript/React/Node, one long-lived service, Supabase/Linear, planned GPT-Live with client delegation selected. Provider feasibility and exact reasoning model remain M1 checks; other concrete material defaults in SPEC Q2–Q9 are reviewed before their corresponding implementation/release gate. No purchase/provisioning/publication inferred from approval of this plan.

Local-first environment requirement (SPEC ADR-014): M0–M5 run the application and Supabase locally before M6 cloud deployment. Core units use provider-free functions and port fakes where needed; Linear-adapter tests use a narrow loopback mock of the consumed GraphQL API; local E2E and the deployed demo use a dedicated real Linear board. GPT-Live/hosted reasoning remain cloud APIs with separate approved development/demo settings. Offline, mock-adapter, and live external evidence remain distinct. Local Application Core work is authorized; external mutations and release gates are separate.

Development discipline follows ADR-015/ADR-016: tests protect SPEC-linked behavior in every slice, defects retain regression cases, and minimal maintained dependencies have reviewed pinned versions, a lockfile, advisory checks, and focused tested updates. M5 consolidates evidence rather than starting testing.

**Immediate working path:** finish one confirmed pothole report through the local UI, DB policy, and honestly labeled simulated open-hours route. Use an injected clock only in tests. The closed-hours branch stays visibly incomplete until a real Linear adapter and approved demo team are connected. Then add the narrow code, website, and dated-event answers and the single reviewer voice path. This order keeps the interview demonstration usable while exposing cuts plainly.

Delivery loop for each small slice: choose one user-observable scenario and its failure case; record the expected behavior in the affected SPEC; implement only the needed path with automated checks; have an evaluator other than the implementer attempt the scenario against the runnable local system or a clearly labeled test harness; feed observed failures back into the same slice and repeat until the scenario passes. Record which parts were exercised with fakes, real local dependencies, or external providers. Do not count stubs, green unit tests, or a diagram as a working path, and do not begin optional expansion while a basic P0 path still fails.

Modern toolkit baseline: Vite, TypeScript, Fastify/Node LTS, Vitest, Playwright, Biome, npm scripts/lockfile, and local Supabase tooling. [Runtime spec](spec/spec-infrastructure-runtime.md) defines responsibilities. Node 24, TypeScript, Vitest, Vite, and Biome are pinned for the first slice; add other packages only when required. Keep build/test orchestration simple and avoid overlapping tools.

## 2. Decisions and review gates

Before coding, review the root SPEC, [decision rationale](DECISIONS.md), dependency diagram, and affected component contracts. Use the selected client delegation mode and verify runtime composition at M1; record selected defaults and budget/privacy/access choices. Credentials/resources must be verified before using them. Do not wait for optional P1 design to freeze P0.

| Gate | Decision / evidence | Owner |
| --- | --- | --- |
| G0 — planning | P0 scope, architecture/contracts, delegation, initial stack, security defaults; implementation authorization | Dror with lead recommendation |
| G1 — feasibility | Actual voice access/browser/backend/hosting path and actual code acquisition; exact model selected from recorded tests | Lead; material changes reviewed with Dror |
| G2 — mutations | Approved demo project/team, least-privilege access, confirmation/operation contracts, bounded provider calls | Lead prepares; Dror authorizes external use |
| G3 — release | Candidate checks, source/config validity, reviewer access, provider/cost/retention settings, hosting/repository approval | Lead prepares concrete release; Dror approves external action |
| G4 — submission | V0/R1–R6/D1–D3 evidence plus writeup/debug rehearsal | Dror + lead |

Provider identity/access and costs are finite prerequisites, not open architecture research. If blocked, continue local core/fixture work; do not claim integration complete.

## 3. Implementation sequence

Estimates are provisional focused engineering effort, excluding this planning conversation, guided review, account access delays, and provider surprises. The earlier 12–20-hour P0 estimate exposed an overbroad implementation plan relative to Threefold's 4–6-hour exercise. Treat the times below as warnings about scope, not a budget to consume. Prefer a working, explainable demonstration and honest cuts over completing every listed subtask. Report actual effort. The desired 48-hour elapsed window is not reset by this plan.

Active sequence is the smallest local report path first (M2/M3), then three narrow sourced answers (M4), then one browser voice path (M1), integrated checks (M5), and delivery (M6/M7). Milestone numbers preserve the original planning references; they are not execution priority. The detailed failure lists below are review prompts. Implement only cases that protect the demonstrated behavior, and record any deferred cases in the final writeup rather than expanding the take-home into a platform.

### M0 — foundation and operational shape (0.5–1.5 hours)

Dependencies: G0.

- T00: Create isolated implementation worktree from clean current `main`; read root and affected ancestor/local `AGENTS.md` instructions and keep planning docs available.
- T01: Initialize selected runtime, pinned dependencies/lockfile, core/adapters/server/web/test layout; shared runtime schemas. Establish the [Application Core](spec/spec-architecture-application-core.md) dependency boundary and conceptual contract shapes without implementing speculative ports or empty layer trees. Document local React/Node and Supabase/container prerequisites and a reproducible dev startup path, with dev/prod config isolation. Establish ADR-013 value ownership: cohesive named constants/shared codes, validated configuration boundaries, small English message catalogs with typed placeholders, and versioned prompt/procedure files as needed. Avoid a global miscellaneous constants file or speculative translation framework.
- T02: Wire composition root, named core use-case boundaries, provider-neutral fakes/fixed Clock, normalized event/trace context, config validation, and safe health endpoints. Keep UI/session reads behind bounded application views and keep the Linear API mock behind test-only composition; local/deployed E2E and production require verified real endpoint/board configuration with no fallback.
- T03: Add package scripts and CI definition for typecheck/lint/format/build/core/contracts/architecture, SPEC traceability, and dependency checks using the recommended modern toolkit. Architecture checks enforce core dependency boundaries. Documentation checks validate root instructions and any purposefully added nested `AGENTS.md` links/structure without requiring a note in every directory. Follow the architecture layout without empty scaffolding. Define the scenario-to-check manifest with honest planned/implemented states. Verify supported compatible stable dependencies/Node LTS, direct-package rationale, pinning/lockfile and reproducible installs. CI must not require paid models.
- T04: Implement initial session admission/ownership and bounded local-development settings; no unsafe public endpoint used in M1.
- T05: Record model/hosting/provider prerequisites and secrets checklist without secret values. Resolve Q2/Q3/Q6/Q7/Q9 sufficiently for local design; external values needed by G2/G3.

Exit evidence: offline foundation checks pass; core cannot import provider SDKs; no secret in frontend/fixtures/logs; readiness failure is diagnosable.

Coherent commits: `build: establish TypeScript application and offline checks`; `feat: define validated contracts and session composition`. Commit tests/docs with the behavior they verify.

### M1 — highest-risk feasibility (1.5–3 hours)

Dependencies: M0; approved bounded voice API use for real checks.

- T10: Validate chosen GPT-Live delegation and actual model access. Implement thin VoiceSession/ReasoningBackend adapters plus one harmless controlled backend round trip.
- T11: Exercise microphone input, spoken reply, partial transcript/context, clarification, interruption/correction, and graceful close on target desktop/mobile browsers.
- T12: Verify proposed long-lived hosting connection approach. Local proof and deployed proof recorded separately; no deployment without G3 authorization.
- T13: Acquire actual code target text and necessary cross-references/exceptions; preserve current supplement/effective/amendment metadata. Read-only manual acquisition is acceptable with refresh instructions.
- T14: Validate one actual-code answer and one separate website answer with supporting source data; record missing/conflicting-evidence behavior.
- T15: Confirm office-hour source, timezone/closure interpretation, and an explicit validity horizon for DB configuration seeds.

Exit evidence G1: recorded actual voice/backend round trip and real code corpus sample with provenance. Hard checkpoint: if voice/delegation or code acquisition is blocked after bounded investigation, bring a concrete alternative to Dror; never replace R1 with website FAQs or label text-only checks as voice.

Commits: `feat: connect browser voice to a controlled backend`; `data: add reviewed code and website evidence with provenance`. Include recorded limitations and refresh instructions.

### M2 — core workflow and durable state (2–3 hours)

Dependencies: M0/G1; local Supabase prerequisites for real DB checks. Cloud project provisioning belongs to release preparation.

Implement the provider-free domain/use-case slice before its Supabase adapter. The core tests establish behavioral meaning; database tests then prove the atomic persistence contract. M1 is an early provider feasibility spike, not the foundation of core authority.

- T20: Implement separate pure hours check and action mapping with server Clock, then connect validated configuration, department resolution, and unsupported ticket-always rejection in workflow composition. **Partial:** both pure functions have offline tests; `Clock`/`CityConfigStore`, raw snapshot validation, actual DB seed/source verification, and action authorization remain pending.
- T21: Implement draft intake schemas, current-revision confirmation request/evidence, correction invalidation, and explicit transition/result types.
- T22: Implement ConversationStore/CityConfigStore, atomic prepare-operation/revision transitions, unique operation keys, durable quota/attempt accounting and ownership restrictions.
- T23: Create migrations using installed CLI-discovered commands; version synthetic seeds for Boulder hours/departments/mock destinations and validate a fresh local Supabase setup. The configuration adapter validates every raw date, opening and closing time, timezone, city/source field, department mapping, and mock destination before constructing `OfficeSchedule`; invalid rows never reach action authorization. Runtime reads the selected environment's DB, not code constants.
- T24: Implement no-mutation behavior for missing configuration/persistence, block/expiry/cancel handling, reconnect/restart operation recovery.
- T25: Emit correlated workflow events/spans at every decision/attempt boundary; no hidden reasoning or unnecessary personal data.
- T26: Add core and real local DB regression checks for all implemented policy/state branches, both authorization/correction race winners, unique operation preparation, session scope, persistence failure, and restart/uncertain recovery. Include malformed raw `validThrough` and opening hours that could otherwise appear open; prove they return unavailable without a ticket or route effect. Wire local DB checks into required CI and link actual check IDs to affected SPEC requirements.

Exit evidence: offline policy/state tests plus isolated DB concurrency/access checks; no unconfirmed authorization or execution of a revision superseded before authorization, no cross-conversation access. Test both correction/authorization race winners and honest post-authorization outcomes. A13/A14/A18/A23/A24 verified at appropriate level.

Commits: `feat: enforce DB-backed business-hours decisions`; `feat: persist revision-bound intake and operation state`; `test: verify concurrent authorization and persistence failure behavior` (tests may accompany behavior instead of a separate commit).

### M3 — complete pothole report and action adapters (2–3 hours)

Dependencies: M1/M2/G2, approved Linear demo team.

Linear API mock work T36 can proceed without external mutation authorization. T30/T33 and every E2E run create/read real synthetic issues in the dedicated board and require G2. Task identifiers are stable references, rather than an execution order.

- T30: Implement TicketProvider with actual schema/permissions check, safe receipt validation, attempt classification, operation marker/native capability verification, reconciliation and uncertain outcome. Implement actual Linear readback and authorized linked-ticket detail/status fetch with identity/team checks, bounded fields, fetch timestamps, read budgets, and honest not-found/unavailable outcomes; no local-placeholder current status or read-triggered recreate.
- T31: Implement TransferProvider simulation with two DB destinations and observable pending/terminal states; honest public labels, no dialing.
- T32: Wire J1 voice intake -> confirmation -> policy -> action -> verified spoken/UI result; no model-directed retries/destination selection. Implement the selected [simple responsive UI concept](design/README.md): one task screen with conversation, voice state, current-location confirmation, deterministic hours decision, inline sources, demo qualification, reachable voice controls, and honest action outcome. Render the request panel only when the session has an actionable draft. Reuse the same components and state model at narrow and wide widths; do not add P1 surfaces or decorative UI before P0 gates pass. Validate permission, clarification, progress, result, failure/uncertainty, disconnect, responsiveness, and accessibility in the actual browser; the mockup is a design proposal, not check evidence.
- T33: Test open-hours routing/no ticket and closed-hours one real ticket/no transfer using fixed isolated test clocks and approved bounded synthetic integrations. Fetch the created issue through the actual Linear API and compare provider identity/location/description; exercise authorized refresh and blocked/unavailable reads with no duplicate create. Production Clock cannot be set by caller/model.
- T34: Inject known failure, timeout-after-commit, duplicate/reconnect, stale revision and cancellation scenarios. Confirm no fabricated success or blind repeated create.
- T35: Persist and inspect exact location/description/confirmation/config/receipt and trace IDs. Do not require contact fields beyond agreed P0 contract.
- T36: Build a narrow loopback mock of the Linear GraphQL operations consumed by the real adapter. Reuse production operation documents/runtime schemas; validate variables and cover success, GraphQL/partial error, HTTP/auth/rate-limit, not-found, read failure, and timeout-after-commit/reconciliation fixtures. Keep mock provider state independent from app receipts and preserve the cross-system boundary during app-restart tests. Use existing Node/server tooling; no GraphQL engine, local board UI, or full API clone.

Exit evidence: one complete spoken J1 with real demo receipt and one open-hours mock route; isolated uncertain-result/reconciliation evidence. Demonstrate trace-driven diagnosis.

Commits: `feat: create and reconcile Linear demo tickets`; `feat: simulate department routing with explicit outcomes`; `feat: complete confirmed pothole voice workflow`.

### M4 — remaining assignment coverage (2–3 hours)

Dependencies: M2/M3; M1 code sample.

- T40: Add J2 park maintenance through shared workflow; required park/location context and separate allowed department. Do not create a second copy of workflow logic.
- T41: Complete reviewed supported code/service/shelter corpus and deterministic KnowledgeProvider selection/limitation contract.
- T42: Build `CityEventProvider` from the official city events listing and individual detail records. Normalize local occurrence date, available time/location/status, canonical source, and verification time; test upcoming/past, missing time, cancellation, stale coverage, and date-range handling. Keep dated news articles as source documents with publication metadata, separate from event occurrences. Provide a bounded refresh command.
- T43: Wire informational dialogue/source cards; save every informational conversation while keeping tickets/routing absent.
- T44: Enforce evidence references and limited factual answers; preserve critical exceptions and source date limitations. Test injection in user/retrieved data and unsupported city requests.

Exit evidence: R1 website/code separation, R2 current dated sources, R4 two correct departments, A13 information persistence/no staff actions.

Commits: `feat: reuse intake workflow for park maintenance`; `feat: answer supported municipal questions with evidence`; `feat: serve fresh official city news and events`.

### M5 — integrated evaluation and demo polish (1.5–3 hours)

Dependencies: M1–M4.

- T50: Consolidate and run the deterministic core/contracts/DB/browser regression suites developed in M0–M4, SPEC traceability/dependency checks, approved provider checks, and checked-in model cases covering all mandatory capabilities/failures.
- T51: Run bounded empirical text evaluations and representative actual voice conversations; record model/prompt/config/corpus versions, repeats, costs where known, outcomes and failures.
- T52: Verify direct API/session scope/limits, prompt injection, misleading caller confirmation, stale source/config, correction/cancel during work, and late operation results.
- T53: Verify responsive source/action/status UI, accessibility/text equivalent, microphone errors/close, safe telemetry export and a readable session timeline.
- T54: Review final behavior, security, human readability, DRY/shared-rule ownership, literal/message/configuration ownership under ADR-013, cohesion, dependencies, unnecessary indirection, and requirement coverage independently; resolve material findings before candidate commit. A reviewer unfamiliar with our discussion must be able to trace each journey. Do not add P1 while P0 fails.

Exit evidence: no observed unauthorized/unconfirmed/duplicate mutation or false success in recorded acceptance runs; mandatory scenarios have inspectable results. Model checks are empirical, not proof of deterministic correctness or zero hallucination.

Commit: `test: add reproducible model and voice acceptance evaluations`; focused fixes committed with their regression cases. Avoid tests that simply repeat implementation structure.

### M6 — reviewer deployment and final verification (1–2 hours plus external setup)

Dependencies: M5, G3 external approvals/resources.

- T60: Refresh knowledge/closure/config validity and run candidate checks on exact revision; fetch/verify Git base before push according to worktree guide.
- T61: Prepare repository access, hosting manifest/container, separate cloud Supabase project/migration deployment, selected secrets/access/retention/cost configuration, and safe health/readiness/restart procedure. Preserve the verified local environment and keep its data/credentials isolated.
- T62: Publish only approved repository/service/resources, then verify exact deployed revision and schema/config. Retain rollback to previous revision/config; no destructive cleanup.
- T63: Fresh reviewer session verifies actual microphone/playback, actual code/website/event answers, real demo ticket creation/API readback and authorized details/status retrieval, and observable mock routing through documented controlled scenarios. Use isolated verified test-clock fixtures for open/closed comparisons, not caller-controlled production time.
- T64: Verify unauthorized access/over-budget rejection and disconnect/resource finalization on deployed service. Account for cold starts and platform shutdowns.

Exit evidence: D1/D2 plus deployed V0/R1–R5 evidence, distinct from local/CI proof. No public link is claimed before fresh live verification.

Commit: `ops: document and verify reviewer deployment` including safe configuration references/build version, no credentials or raw caller data.

### M7 — submission and debugging rehearsal (0.5–1.5 hours)

Dependencies: M6/G4.

- T70: Complete <=1-page writeup with actual cuts, final decisions, diagram, known limitations, next work. Check rendered page length; no unimplemented feature claims.
- T71: README includes exact setup/run/check/eval commands, required env names, reviewer access steps, sources/config refresh, and demo limits.
- T72: Record V0/R1–R6/D1–D3 evidence ledger with revision/date/result and evaluation configuration.
- T73: Rehearse deliberate Linear failure or expired DB schedule: Dror locates trace/operation state, explains expected behavior, identifies code/adapter boundary, and describes fix/retest.
- T74: Dror reviews final repo/link/writeup and decides submission/outreach. No message to Threefold is sent without explicit authorization.

Exit evidence: all mandatory gates passed or material failure explicitly surfaced to Dror; authentic history and accurate submission. Failed mandatory gates cannot silently become optional.

Commit: `docs: finalize submission evidence and debugging guide`.

## 4. Independent work and integration accountability

Core/policy checks, reviewed source corpus, and UI fixtures can proceed independently after contracts are agreed. Provider adapters/eval authoring can be delegated as bounded tasks; one lead integrates and reviews. Avoid concurrent edits to shared contracts and migration ordering. Introduce a provider dependency only when its contract is needed.

Every milestone includes its own meaningful checks and trace hooks. Independent component success does not replace J1/J2/J3 and deployed verification. Never claim local/CI/provider/live proof interchangeably.

## 5. Git and SDD discipline

- Work from explicit `main` integration base in isolated task worktrees. Local `main` has no remote until approved setup.
- Read root/affected specs before a slice; amend the SPEC when accepted behavior changes. Keep proposed decisions visible until reviewed.
- Coherent commits include behavior, meaningful tests/evals, and relevant docs. Do not manufacture history or split mechanically to inflate commit count.
- Branch names without a real external issue ID may be descriptive, e.g. `feat/voice-foundation`; use actual issue IDs once available, never invented ticket IDs.
- Prefer local reviewed integration/fast-forward where appropriate. PR/push/provider/publishing boundaries depend on explicit authorization and verified current state.
- Run required checks on exact final candidate; repeat after relevant changes/failures. Keep secrets/generated recordings outside Git.

### Commit boundaries and messages

Use one clear purpose per delivered commit. Include code, meaningful tests/evals, and affected SPEC/configuration together when they describe the same behavior. A feature commit containing its tests remains a feature commit; a separate test commit is appropriate for new protection of existing behavior. Pure refactors preserve behavior and its checks. Keep unrelated formatting and dependency changes separate. A reviewed dependency update includes the lockfile, any required compatibility adjustments, and relevant regression evidence.

Apply [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): `type(scope): resulting behavior`, with scope optional. Preferred types: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`. Mark an actual breaking contract/config change explicitly and explain its migration. Extra commit tooling is unnecessary for this assignment; review message quality with the staged diff.

For a nontrivial change, include a short body covering the problem/reason, relevant root/component SPEC references, actual checks/results, and material limitations. Use a real issue reference when available. Never invent IDs, verification, or provider results. Subjects and examples below describe planned future work, not completed capabilities.

| Example commit | Changes that belong together |
| --- | --- |
| `build: establish local development and verification tooling` | Runtime/tool versions, lockfile, local setup, scripts/config, initial checks and setup docs |
| `feat(policy): enforce DB-backed business-hour decisions` | Policy/config contract, independent boundary/closure/timezone cases, SPEC A4–A6/A23 updates |
| `feat(workflow): bind report confirmation to its revision` | Intake/transitions, confirmation evidence, atomic persistence/migration, correction/race tests and A18 updates; split pure workflow and DB adapter if each is coherent/tested |
| `feat(ticketing): reconcile uncertain Linear creation` | Adapter/classification/reconciliation, receipt persistence, timeout-after-commit and duplicate cases, truthful limitations |
| `feat(routing): simulate the two department handoffs` | Allowed destinations/lifecycle/UI labels, observable route tests, current config seeds and relevant docs |
| `feat(intake): reuse report workflow for park maintenance` | Park requirements/mapping/UI guidance, shared workflow integration and department regression cases |
| `feat(knowledge): answer supported city questions with evidence` | Reviewed corpus/provenance, retrieval/answer constraints, source/qualification/freshness cases and supported-scope docs; news/events may form a later coherent slice |
| `fix(workflow): reject superseded confirmation before authorization` | Reproduced defect, retained failing-then-passing regression case, narrow fix and relevant SPEC clarification |

Milestone commit suggestions are flexible boundaries, not a fixed count. Split when two changes can be reviewed, validated, and reverted independently. Keep tightly coupled changes together when splitting would leave a broken or misleading intermediate state. A large journey can grow through tested foundation, adapter, and integration commits; preserve those meaningful steps in the final repository. M1 source acquisition uses `feat(knowledge)` or `docs(knowledge)` according to the actual content; M6 operations use `build`, `ci`, or `docs` according to the actual change.

### Before committing and integrating

1. Review the staged diff for one purpose, clear human-readable code, matching tests/SPEC, and safe configuration. Exclude secrets, generated recordings, unrelated edits, and unverified claims.
2. Verify the snapshot being committed. Prefer a clean task worktree with one completed slice. If partially staging changes, test a clean staged/candidate snapshot; tests using extra unstaged code do not prove the commit works.
3. Run applicable milestone checks, inspect results, then commit with an honest subject/body. Red/green development happens before the delivered behavior commit; that commit contains passing behavior and its regression cases. Record unavailable external/empirical checks as gaps.
4. Independently review consequential changes and resolve material findings. Keep every delivered integration commit buildable/checkable at its milestone; a passing final branch alone cannot repair broken intermediate commits.
5. Verify the integration base is current and integrate the tested meaningful commits. Recheck required suites on the exact integrated candidate after relevant integration changes. Local fast-forward preserves the existing tested commits; use the approved remote/PR workflow once configured. No published-history rewrite or destructive worktree cleanup is inferred.

This structure makes review, locating the first bad commit, and reverting a specific change practical. Git revert does not automatically undo external tickets or database effects; migrations/provider operations retain their separate recovery rules. Commit locally when a coherent slice is verified, rather than waiting until the whole assignment is finished.

### Testing in every development slice

1. Select the affected root/component SPEC branches and define observable acceptance/failure expectations and independent fixtures.
2. Author relevant tests alongside the behavior; core is provider-free, real adapter code has fixture contracts, local DB tests exercise transactions/constraints, and browser journeys retain the real app/core/DB with cloud boundaries controlled.
3. For a reproduced bug, add a regression case that fails against faulty behavior before its fix where feasible. For voice/model issues, retain the conversation and factual/task rubric as an empirical case.
4. Run affected checks during development and the required regression baseline on the candidate before integration. Review which realistic defects critical assertions catch and update traceability to actual checks/results.
5. Commit behavior, tests/evals, and accepted SPEC changes coherently. Do not weaken assertions to hide defects; planned/skipped/flaky gaps remain visible. Required integration failures and mandatory release evidence remain blocking.

The [evaluation spec](spec/spec-process-evaluation.md) assigns layer/milestone coverage and failure cases. Coverage numbers and traceability supplement human review; they do not prove tests protect behavior. Keep dependencies minimal and test their relevant effect after updates. Exact versions/advisories are verified at implementation and refreshed before release.

## 6. Validation command targets

| Planned command | Purpose | External cost/action |
| --- | --- | --- |
| npm run typecheck / lint / format:check / build | Static correctness, readability and builds | None |
| npm run check:architecture | Current core SDK-import/CommonJS boundary; extend for later layer direction | None |
| npm run check:spec | SPEC/scenario/check references and implemented-behavior gaps | None |
| npm run check:dependencies | Full direct/transitive advisory report, including dev tools; default high/critical blocking gate | Registry read-only advisory access; no paid model calls |
| npm run test:core | Policy/state/confirmation/limits with fixed fake ports | None |
| npm run test:contracts | Provider-neutral shapes, adapter fixtures/errors | None |
| npm run test:integration | Local DB plus Linear-adapter checks against the narrow mock API | None; no real Linear credentials/network |
| npm run knowledge:validate / refresh | Reviewed source metadata/freshness and acquisition | Official read-only access; source restrictions reviewed |
| npm run test:browser | Browser UI/API checks with controlled provider boundaries | None by default |
| npm run test:e2e | Local/deployed end-to-end journey with controlled voice and dedicated real Linear board | Opt-in external demo mutations; approved credentials/board and bounded synthetic data required |
| npm run eval:text / eval:voice | Empirical model/audio task outcomes | Approved provider budget; synthetic/redacted data |

The first package scripts and exact Node version are in README/package.json; M0 still needs local service, DB, CI, traceability manifest, and further contract checks. Use installed Supabase CLI help to define migration/reset/advisor commands; do not copy guessed commands from planning docs. CI secrets/mutations remain opt-in.

## 7. Time and risk controls

- End M1 before investing heavily in app integrations. Voice access and actual code acquisition are highest-risk assumptions.
- At M3, reassess remaining elapsed window with a complete resident report, not just separate components.
- Reserve final effort for deployment, fresh reviewer access, evidence, writeup, and rehearsal. These are mandatory delivery work.
- If effort exceeds assumptions, keep P1 deferred and narrow topic depth within accepted P0 before cutting a capability. If a capability still cannot be completed, bring Dror the working evidence and proposed honest cut; do not claim a stub or bypass safety.
- Do not expand retrieval frameworks, full authentication products, vector infrastructure, background orchestration, or shadow UI without a concrete requirement.
- At each slice boundary, ask whether the next task gives a reviewer new evidence for one of V0/R1–R6/D1–D3. If it only prepares for hypothetical scale or a later feature, defer it. Keep the narrow safeguards needed for the ticket/transfer path and a usable deployed link.

## 8. Later feature seams

| Extension | P0 seam | Later verification |
| --- | --- | --- |
| Ticket-always policy | DB flag/capability and action-outcome contracts | Separate ticket/transfer failure semantics and dual-action tests |
| Hold tone | Transfer lifecycle events | Audio stops on terminal states/cancel |
| Representative view | Persisted confirmed context + scoped read port | Independent role/access, no cross-session data |
| Replay/candidate comparison | ReasoningBackend, versioned run snapshots, isolated context mode | Controlled tool fixtures, divergence and privacy retention |
| Live reasoning shadow | Same contracts plus operational IDs | Async bounded sampling, no live mutation creds/audio, budget isolation |
| New tools/models/cities | App-owned ports and explicit capabilities | Contract suite plus real provider/voice and city-config validation |
| Workers/more instances | Durable operations/revisions and quotas | Shared admission, lease/reconciliation, session routing and measured load |

P0 need not implement these runners/providers/features. Retain enough structure to add them without rewriting business-hour and confirmation policy.

## 9. Planning review record

September 15, 2026: independent read-only review identified duplicate contract definitions, evaluation-schema/command drift, and an overbroad post-authorization correction guarantee. These were corrected; follow-up review found no remaining material cross-document issue. Readability/DRY criteria and local-versus-hosted feasibility boundaries were also verified.

The planning-baseline documentation checks previously passed for 12 documents. The first local policy slice was developed RED then GREEN. Review found the initial whole-city validator disproportionate to business-hours checking, so the current slice separates one pure hours check over a validated schedule from a pure mapping of its result to an action. The 16-case suite checks open/closed decisions, opening and closing times, weekends, date overrides, DST, expiry, invalid clock/timezone inputs, and all three action mappings. On September 16, 2026, Node 24.21.0 `npm run check` (16 tests), `npm run build`, and `git diff --check` passed after this split. The core import boundary is a Biome configuration checked by `npm run lint` and `npm run check:architecture`; manual probes confirmed rejection of static/dynamic provider imports and CommonJS `require`. The configuration adapter will own raw DB-row validation, city/source identity, department mappings, and simulated destinations, with separate tests. This remains pure-policy evidence for part of A4/A5/A6/A23 and COR-001, not DB integration, atomic authorization, real Linear, browser voice, model, or deployment proof. Client delegation is selected; M1 feasibility and gated release prerequisites remain open.

At the initial boundary checkpoint, four P0 capabilities had runtime name/argument validation and unavailable handlers. On September 16, 2026, the local format/lint/type/test check passed with 30 total tests after the channel-neutral boundary review, and the TypeScript build passed. That checkpoint verified the stub boundary only. The later report-intake slice below implements one handler; municipal-code, city-information, and event handlers, plus client delegation, remain pending.

September 16, 2026 local intake checkpoint: a pothole description and later location now flow from a tiny React text form through Fastify's validated local API, the `prepareServiceReport` agent tool, provider-neutral core, and a private-schema Supabase Postgres draft store. The local DB migration, scoped observations/admissions, atomic revision compare, refresh read, and draft-only UI are implemented. An independent black-box evaluator found that the fresh page hid the process-global prior draft and Fastify coerced numeric/boolean fields into text; initial GET hydration and strict no-coercion validation were added with regression checks. Local DB/API tests and a second browser evaluation are the acceptance gate for this slice. The current loopback harness has one in-memory developer session and does not recover that session after a Node restart; the DB draft itself persists. It is not browser voice, caller confirmation, a ticket, or a transfer, and it is not a deployable multi-user admission model.

Additional planning review on September 15 covered local-development/cloud-production separation, testing throughout each slice with SPEC/regression protection, minimal maintained dependencies/advisory gates, and the modern Vite/TypeScript/Vitest/Playwright/Biome toolchain. That record described the planning baseline at the time; the local core-policy implementation above followed later authorization.
