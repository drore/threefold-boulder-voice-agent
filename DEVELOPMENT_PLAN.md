---
title: Assignment-first development and delivery plan
version: 1.0-review
last_updated: 2026-09-15
owner: Dror Elovits
---

# Detailed development plan

Status: planning completed for review, implementation not started. [SPEC](SPEC.md) is the source of truth for behavior/scope; component specs own contracts. This plan owns task sequencing, evidence, and commits. All commands below are future targets until M0 creates them.

## 1. Outcome and delivery boundary

P0 delivers browser voice for Boulder, actual code AND website answers, current official news/events, real Linear demo tickets, correct observable mock routing, deterministic Supabase-backed business hours, and evaluation setup. Submission includes reviewer-accessible Git history, deployed link, <=1-page writeup, and debugging readiness.

P0 also includes required-field confirmation, session-scoped access, safe operation/retry handling, minimal correlated tracing, and provider-neutral boundaries. These are foundations for correct delivery, not an invitation to build a general platform.

Engineering quality follows SPEC ADR-013: simple human-readable code, clear naming/control flow, small cohesive modules, minimal dependencies, and DRY for shared rules/contracts/workflows. Every slice reviews these criteria; abstractions need actual reuse or a useful external boundary. Do not trade clarity for cleverness or compress code merely to reduce line count.

P1: ticket-always execution, tone, representative view, replay/shadow runner/comparison UI. P2: telephony, other cities/providers, broader code/topic coverage, distributed workers, measured scale. Do not start P1 while a P0 gate is missing.

Initial baseline: TypeScript/React/Node, one long-lived service, Supabase/Linear, planned GPT-Live. Delegation Q1 awaits Dror's answer; other concrete material defaults in SPEC Q2–Q9 are reviewed before their corresponding implementation/release gate. No purchase/provisioning/publication inferred from approval of this plan.

Local-first environment requirement (SPEC ADR-014): M0–M5 run the application and Supabase locally before M6 cloud deployment. Core units use a port fake; Linear-adapter tests use a narrow loopback mock of the consumed GraphQL API; local E2E and the deployed demo use a dedicated real Linear board. GPT-Live/hosted reasoning remain cloud APIs with separate approved development/demo settings. Offline, mock-adapter, and live external evidence remain distinct. Dror explicitly asked to wait with actual code writing; current authorization remains documentation only.

Development discipline follows ADR-015/ADR-016: tests protect SPEC-linked behavior in every slice, defects retain regression cases, and minimal maintained dependencies have reviewed pinned versions, a lockfile, advisory checks, and focused tested updates. M5 consolidates evidence rather than starting testing.

Modern toolkit baseline: Vite, TypeScript, Fastify/Node LTS, Vitest, Playwright, Biome, npm scripts/lockfile, and local Supabase tooling. [Runtime spec](spec/spec-infrastructure-runtime.md) defines responsibilities; M0 verifies compatible stable versions/advisories and establishes exact commands. Keep build/test orchestration simple and avoid overlapping tools.

## 2. Decisions and review gates

Before coding, review the root SPEC, [decision rationale](DECISIONS.md), dependency diagram, and affected component contracts. Resolve Q1 delegation and runtime composition; record selected defaults and budget/privacy/access choices. Credentials/resources must be verified before using them. Do not wait for optional P1 design to freeze P0.

| Gate | Decision / evidence | Owner |
| --- | --- | --- |
| G0 — planning | P0 scope, architecture/contracts, delegation, initial stack, security defaults; implementation authorization | Dror with lead recommendation |
| G1 — feasibility | Actual voice access/browser/backend/hosting path and actual code acquisition; exact model selected from recorded tests | Lead; material changes reviewed with Dror |
| G2 — mutations | Approved demo project/team, least-privilege access, confirmation/operation contracts, bounded provider calls | Lead prepares; Dror authorizes external use |
| G3 — release | Candidate checks, source/config validity, reviewer access, provider/cost/retention settings, hosting/repository approval | Lead prepares concrete release; Dror approves external action |
| G4 — submission | V0/R1–R6/D1–D3 evidence plus writeup/debug rehearsal | Dror + lead |

Provider identity/access and costs are finite prerequisites, not open architecture research. If blocked, continue local core/fixture work; do not claim integration complete.

## 3. Implementation sequence

Estimates are provisional focused engineering effort, excluding this planning conversation, guided review, account access delays, and provider surprises. Rough P0 range: 12–20 focused hours plus contingency. This is broader than Threefold's suggested 4–6-hour exercise; report actual effort honestly. The desired 48-hour elapsed window is not reset by this plan. Confirm remaining availability at G0.

### M0 — foundation and operational shape (0.5–1.5 hours)

Dependencies: G0.

- T00: Create isolated implementation worktree from clean current `main`; read root and affected ancestor/local `AGENTS.md` instructions and keep planning docs available.
- T01: Initialize selected runtime, pinned dependencies/lockfile, core/adapters/server/web/test layout; shared runtime schemas. Document local React/Node and Supabase/container prerequisites and a reproducible dev startup path, with dev/prod config isolation. Establish ADR-013 value ownership: cohesive named constants/shared codes, validated configuration boundaries, small English message catalogs with typed placeholders, and versioned prompt/procedure files as needed. Avoid a global miscellaneous constants file or speculative translation framework.
- T02: Wire composition root, provider-neutral fakes/fixed Clock, normalized event/trace context, config validation, safe health endpoints. Keep the Linear API mock behind test-only composition; local/deployed E2E and production require verified real endpoint/board configuration with no fallback.
- T03: Add package scripts and CI definition for typecheck/lint/format/build/core/contracts/architecture, SPEC traceability, and dependency checks using the recommended modern toolkit. Architecture checks enforce core dependency boundaries and `AGENTS.md` coverage in every maintained folder with explicit generated/vendor/runtime exclusions. Create local notes alongside each folder's first maintained files; follow the architecture layout without empty scaffolding. Define the scenario-to-check manifest with honest planned/implemented states. Verify supported compatible stable dependencies/Node LTS, direct-package rationale, pinning/lockfile and reproducible installs. CI must not require paid models.
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

- T20: Implement pure DB-config policy with server Clock, interval/weekday/holiday/DST/validity validation, and unsupported ticket-always setting rejection.
- T21: Implement draft intake schemas, current-revision confirmation request/evidence, correction invalidation, and explicit transition/result types.
- T22: Implement ConversationStore/CityConfigStore, atomic prepare-operation/revision transitions, unique operation keys, durable quota/attempt accounting and ownership restrictions.
- T23: Create migrations using installed CLI-discovered commands; version synthetic seeds for Boulder hours/departments/mock destinations and validate a fresh local Supabase setup. Runtime reads the selected environment's DB, not code constants.
- T24: Implement no-mutation behavior for missing configuration/persistence, block/expiry/cancel handling, reconnect/restart operation recovery.
- T25: Emit correlated workflow events/spans at every decision/attempt boundary; no hidden reasoning or unnecessary personal data.
- T26: Add core and real local DB regression checks for all implemented policy/state branches, both authorization/correction race winners, unique operation preparation, session scope, persistence failure, and restart/uncertain recovery. Wire local DB checks into required CI and link actual check IDs to affected SPEC requirements.

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
- T42: Acquire selected official news and upcoming event detail records, publication/time/location/cancellation metadata and freshness validation/refresh command.
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
| npm run check:architecture | Core SDK dependency boundaries and maintained-folder agent-note coverage | None |
| npm run check:spec | SPEC/scenario/check references and implemented-behavior gaps | None |
| npm run check:dependencies | Full direct/transitive advisory report, including dev tools; default high/critical blocking gate | Registry read-only advisory access; no paid model calls |
| npm run test:core | Policy/state/confirmation/limits with fixed fake ports | None |
| npm run test:contracts | Provider-neutral shapes, adapter fixtures/errors | None |
| npm run test:integration | Local DB plus Linear-adapter checks against the narrow mock API | None; no real Linear credentials/network |
| npm run knowledge:validate / refresh | Reviewed source metadata/freshness and acquisition | Official read-only access; source restrictions reviewed |
| npm run test:browser | Browser UI/API checks with controlled provider boundaries | None by default |
| npm run test:e2e | Local/deployed end-to-end journey with controlled voice and dedicated real Linear board | Opt-in external demo mutations; approved credentials/board and bounded synthetic data required |
| npm run eval:text / eval:voice | Empirical model/audio task outcomes | Approved provider budget; synthetic/redacted data |

M0 must create and document exact scripts; current repository has no package/runtime scripts. Use installed Supabase CLI help to define migration/reset/advisor commands; do not copy guessed commands from planning docs. CI secrets/mutations remain opt-in.

## 7. Time and risk controls

- End M1 before investing heavily in app integrations. Voice access and actual code acquisition are highest-risk assumptions.
- At M3, reassess remaining elapsed window with a complete resident report, not just separate components.
- Reserve final effort for deployment, fresh reviewer access, evidence, writeup, and rehearsal. These are mandatory delivery work.
- If effort exceeds assumptions, keep P1 deferred and narrow topic depth within accepted P0 rather than remove a capability or bypass safety. Material scope changes go to Dror.
- Do not expand retrieval frameworks, full authentication products, vector infrastructure, background orchestration, or shadow UI without a concrete requirement.

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

Local documentation checks passed for 12 planning documents: relative links, frontmatter/component section structure, balanced code fences, whitespace, obsolete contract/script names, all 21 P0 A-scenario mappings, and all 10 voice/capability/deliverable gates. Git whitespace checks passed. No application/provider/model/voice/deployment checks ran; implementation does not exist. Q1 and gated release prerequisites remain visible decisions for Dror, not completed work.

Additional planning review on September 15 covered local-development/cloud-production separation, testing throughout each slice with SPEC/regression protection, minimal maintained dependencies/advisory gates, and the modern Vite/TypeScript/Vitest/Playwright/Biome toolchain. Independent read-only reviews found no material issue; no concrete runtime/package versions, application code, test implementation, or dependency-audit result were claimed or created. Current authorization remains documentation only.
