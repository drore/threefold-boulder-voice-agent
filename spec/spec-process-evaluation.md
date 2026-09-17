---
title: Evaluation Process Specification
version: 1.0-review
date_created: 2026-09-15
last_updated: 2026-09-16
owner: Dror Elovits
tags: [process, evaluation, testing, voice-agent, boulder]
---

# Introduction

This specification defines the evaluation process for the Boulder browser voice agent. It separates deterministic application tests from empirical model and voice evaluation so the final submission can honestly show what is verified, what is sampled, and what remains limited.

## 1. Purpose & Scope

The purpose is to provide a compact, repeatable evaluation plan for assignment requirements V0, R1-R6, and deliverables D1-D3, while preserving optional later paths for richer live-model evaluation. The current local suite has deterministic offline and database checks plus eleven versioned, opt-in live reasoning cases that check tool selection. Spoken, live Linear, and deployment checks remain open.

## 2. Definitions

- **Deterministic test**: A test where expected app state, policy result, database record, or adapter call is fixed for a fixture.
- **Empirical model evaluation**: Repeated model-run assessment where answer quality is measured against rubrics and evidence, not assumed deterministic.
- **Spoken evaluation**: A browser voice evaluation covering microphone input, speech output, interruption, and audible status.
- **Scenario**: A versioned test case with input, fixtures, expected observable outcome, and requirement mapping.
- **Fixture**: Controlled data for Supabase configuration, source evidence, current time, provider response, or adapter failure.
- **Observable app state**: UI text, source link, ticket ID, transfer state, representative context, durable record, or trace event visible without hidden model reasoning.
- **Optional L scenario**: A later learning or stretch scenario that must not block mandatory delivery.

## 3. Requirements, Constraints & Guidelines

- **EVAL-001**: The evaluation suite shall map every mandatory requirement V0, R1-R6 and deliverable D1-D3 to at least one scenario or evidence gate.
- **EVAL-002**: Automated tests shall verify observable application state and durable records, not hidden reasoning or subjective intent.
- **EVAL-003**: Text model evaluations shall be empirical and rubric-based, with recorded prompts, model/config versions, sources, sampled outputs, and pass/fail judgment.
- **EVAL-004**: Spoken evaluations shall be separate from text-only checks and shall not be claimed complete unless microphone input and spoken output are exercised.
- **EVAL-005**: Official municipal-code answers and official website answers shall be separate R1 scenarios.
- **EVAL-006**: Current events evaluation shall use dated official news/service updates and calendar events, including stale or past-event handling.
- **EVAL-007**: Linear evaluation shall include real demo-ticket creation/readback/retrieval in a dedicated board before submission. Core units use a port fake; adapter tests use the narrow local GraphQL API mock with production operation documents/schemas. Mock results do not satisfy real-provider evidence; local E2E uses the real board.
- **EVAL-008**: Simulated routing evaluation shall prove the UI and speech label routing as mock/demo behavior and never claim real staff answered.
- **EVAL-009**: Business-hours evaluation shall use Supabase configuration and a deterministic test clock for open, closed, boundary, weekend, timezone, and config-unavailable cases.
- **EVAL-010**: Every conversation type shall be evaluated for Supabase recording, including information-only conversations with no ticket or routing action.
- **EVAL-011**: Provider-neutral core tests shall run without OpenAI, Linear, or Supabase network calls by using contract fixtures or local substitutes.
- **EVAL-012**: Adapter tests shall verify provider-specific translations independently from core policy behavior.
- **EVAL-013**: The suite shall include meaningful failure cases for concurrency, retries, ambiguous timeout, prompt injection, stale code/news, cross-session access, source absence, and unavailable configuration.
- **EVAL-014**: Optional `alwaysOpenTicket=true` behavior shall be evaluated only after default `alwaysOpenTicket=false` mandatory behavior passes.
- **EVAL-015**: The final writeup shall report limitations and failed or skipped checks honestly within one rendered page.
- **EVAL-016**: Each development slice shall define SPEC-linked acceptance/failure cases and deliver relevant tests with the behavior before integration. Testing starts in M0; M5 consolidates evidence.
- **EVAL-017**: A versioned scenario-to-check manifest shall reference root A-scenarios and qualified component requirements, distinguish planned/implemented behavior, and link actual automated checks or empirical/process evidence. CI shall reject dangling references and missing required checks for implemented behavior.
- **EVAL-018**: Reproducible defects shall receive regression cases that fail against the defect before the fix where feasible. Retain cases; version model/voice failures as empirical conversation/rubric cases.
- **EVAL-019**: Critical tests shall assert independent observable expectations and meaningful negative outcomes. Review their ability to catch realistic defects; line coverage or a manifest entry alone does not prove protection.
- **EVAL-020**: Required deterministic regression checks shall block integration. Quarantined/flaky, skipped, or planned checks shall be explicit gaps with a cause/owner and shall not count as satisfying mandatory gates.
- **EVAL-021**: Accepted behavior changes shall update SPEC, checks, and fixtures together. Refactors preserve observable expectations; failing assertions shall not be weakened solely to obtain a passing suite.
- **EVAL-022**: Dependency introduction/updates shall follow ADR-016 with advisory checks and relevant regressions. Audit the full direct/transitive tree including dev tools; check runtime/container advisories separately and record unavailable scans as gaps.
- **CON-001**: Confirm a command exists before documenting it as runnable. Current local checks and `npm run eval:reasoning` are listed in README; other command targets below remain proposals.

## 4. Interfaces & Data Contracts

Each future scenario file shall follow this provider-neutral shape:

```ts
type AssignmentId = "V0" | "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "D1" | "D2" | "D3";
type EvaluationScenario = {
  id: string; priority: "P0" | "P1";
  mapsTo: AssignmentId[]; // Empty only for a non-assignment extension.
  rootScenarios: string[]; // Validated A1–A25 references, including failure cases.
  componentRequirements: Array<{ spec: string; requirement: string }>;
  implementationStatus: "planned" | "implemented";
  checks: string[]; // Actual stable automated check IDs or empirical/process evidence refs.
  mode: "unit" | "integration" | "e2e-browser" | "empirical-text" | "spoken" | "process";
  fixtures: { clock?: string; cityConfigRevision?: number; sourceSetId?: string; providerResponses?: string };
  input: { text?: string; audioFixture?: string };
  expectedObservableState: string[]; failureAssertions?: string[];
};
type EvaluationResult = {
  scenarioId: string; commitSha: string; appVersion: string;
  promptVersion?: string; model?: string; configRevision?: number; sourceSetId?: string;
  status: "pass" | "fail" | "skipped"; evidence: string[]; notes?: string;
};
```

## 5. Acceptance Criteria

- **AC-V0-001**: Given a fresh browser session on the deployed link, When a reviewer speaks a Boulder-supported request, Then the app hears speech, answers audibly, and displays Boulder context.
- **AC-R1-001**: Given a supported Boulder municipal-code question, When the agent answers, Then it cites the official code source/version and preserves material qualifications.
- **AC-R1-002**: Given a Boulder website service-information question, When the agent answers, Then it cites the official website source separately from code evidence.
- **AC-R2-001**: Given current official news/events fixtures, When the caller asks what is happening now, Then answers include dated official evidence and exclude stale cancelled or past events.
- **AC-R3-001**: Given a confirmed closed-hours pothole request, When the policy selects ticket creation, Then one real Linear demo ticket is created and recorded with its identifier.
- **AC-R4-001**: Given pothole and park-maintenance requests during open hours, When `alwaysOpenTicket=false`, Then the app routes to Transportation & Mobility or Parks & Recreation respectively and labels the transfer simulated.
- **AC-R5-001**: Given fixed Supabase business-hours configuration, When tests run for open, closed, boundary, weekend, and timezone cases, Then the deterministic policy returns repeatable route/ticket decisions.
- **AC-R6-001**: Given the final repo, When the evaluator runs documented commands, Then deterministic tests, integration checks, and empirical eval instructions are present with recorded results or honest skips.
- **AC-D1-001**: Given reviewer access to the repo, When history is inspected, Then real incremental commits and setup instructions are visible.
- **AC-D2-001**: Given the tryable link, When a fresh reviewer session runs the core demo, Then voice, sources, real ticket creation, and simulated routing work at the tested revision.
- **AC-D3-001**: Given the final writeup, When rendered, Then it is at most one page and covers cuts, decisions, component diagram, limitations, and next steps.
- **AC-DEV-001**: Given a newly implemented behavior slice, When it is reviewed for integration, Then affected SPEC references, meaningful acceptance/failure checks, and passing relevant regression results accompany it.
- **AC-DEV-002**: Given a reproduced authorization/closing-boundary/duplicate-write defect, When its regression case runs against the faulty behavior, Then it fails; the fix passes without weakening intended expectations.
- **AC-DEV-003**: Given an implemented scenario with a dangling SPEC/check reference or missing required evidence, When traceability/release validation runs, Then it reports the gap rather than counting planned/skipped work as a pass.

## 6. Test Automation Strategy

- **Test Levels**: Unit tests for policy, confirmation, source selection, prompt-injection handling, and state transitions using provider fakes; integration tests for Supabase, the real Linear adapter against its narrow API mock, retrieval adapters, and transfer simulator; end-to-end browser voice checks using the dedicated real Linear board for V0/D2; empirical text and spoken evals for agent quality.
- **Frameworks**: Current checks use Vitest for unit/contracts, Biome for lint/format, TypeScript for types/builds, and a small opt-in live reasoning runner with versioned cases and a recorded result. Playwright browser journeys and an OpenTelemetry test exporter remain possible later tools, added only if they protect a demonstrated need. [Runtime spec](spec-infrastructure-runtime.md) owns the toolkit/version-selection rules.
- **Test Data Management**: Version scenario fixtures in Git. Seed Supabase test configuration for city hours, closure exceptions, departments, `alwaysOpenTicket=false`, and optional `true` extension.
- **CI/CD Integration**: Future credential-free targets: `npm run test:core`, `npm run test:contracts`, `npm run check:architecture`, `npm run check:spec`, `npm run check:dependencies`, `npm run test:integration`, `npm run test:browser`, and `npm run knowledge:validate`. `npm run test:e2e`, `npm run eval:text`, and `npm run eval:voice` are opt-in; E2E requires the approved dedicated real Linear board and external mutations.
- **Coverage Requirements**: Mandatory scenario matrix coverage for V0, R1-R6, D1-D3 before submission; optional L scenarios may be skipped without blocking.
- **Performance Testing**: Track latency and timeout behavior for voice, retrieval, ticket, transfer, and persistence paths; define pass thresholds only after first measured prototype.

### Checks developed with each layer

| Layer / milestone | Protected behavior | Required meaningful failures |
| --- | --- | --- |
| Contracts/session composition — M0 | Validated boundaries, server scope, dependency direction; test/manifest foundations | Forged identity/destination, invalid input, wrong environment, core SDK import |
| Knowledge/voice feasibility — M1 | Actual code versus website evidence; normalized voice observations and controlled backend | Missing/unsupported evidence, fragments mistaken for confirmation, disconnect; empirical interruption/mishearing |
| Policy/workflow — M2 | A4–A6/A12/A18/A23; config determines action and confirmation binds revision | Closing instant/weekend/closure/DST/expiry, both correction/authorization race winners, unknown intent, blocked/expired requests |
| Local persistence — M2 | A13/A14/A18/A24; real migrations, ownership and atomic operation preparation | Concurrent submissions, wrong session, failed intent/receipt save, restart with executing/uncertain operation |
| Ticket/transfer adapters — M3 | A5/A7/A8/A12; verified receipt, distinct simulated destination, bounded attempts | HTTP success with provider error, known rejection, rate limit, timeout after commit, inconclusive lookup, repeated submission/cancel |
| Information + shared park workflow — M4 | A1–A3/A11–A14; evidence qualifications, freshness, reuse, information persistence | Stale/cancelled/past sources, unsupported claim, ambiguous park/location, injection, accidental informational ticket |
| UI/API journeys — M3–M5 | Browser checks through controlled boundaries; local E2E through real app/core/local DB and dedicated Linear board; J1/J2/J3, sources and truthful statuses | Missing fields, correction, cross-session API, loading/failure/uncertain state, close; responsive accessible text; E2E proves real issue creation/readback and cannot use the mock endpoint |
| Model/voice evaluations — M1 onward | A9/A19/A25; audible task behavior, supported facts, clarification and correction | Misheard details, unrelated/injected instructions, interrupted status, false success; rubric-based repeated samples |
| Cloud verification — M6 | Same contracts/migrations, separate cloud config; D1/D2 actual reviewer behavior | Wrong environment/config, readiness failure, fresh-session access, restart/disconnect and usage limit |

Core checks use fixed fake ports. Adapter fixture checks exercise the real translation/error-classification code; local DB checks use real transactions/constraints. Browser journey tests use the real app/backend/core/local DB while replacing cloud voice/ticket boundaries. This prevents an end-to-end test from succeeding solely because both its backend and expected output were stubbed. Approved real Linear/model checks add compatibility/audio evidence separately.

### Regression and CI discipline

For each slice: select relevant SPEC branches, define independent expectations/fixtures, author the behavior checks, implement, run affected checks, and review the evidence before commit/integration. Critical tests should demonstrate detection of representative defects when first authored—for example treating the closing instant as open, removing revision checks, choosing the wrong department, or recreating an uncertain ticket. Focus on these failure modes without requiring a general mutation-testing platform.

Create `npm run check:spec` in M0 to validate the simple manifest's references/status/check links. Once suites exist, required CI runs typecheck/lint/format/build, architecture and SPEC checks, offline core/contracts, local DB integration, knowledge validation, and controlled browser journeys. No cloud credentials or paid APIs are required for that behavioral regression baseline. Add `npm run check:dependencies` for full-tree advisory review; it requires registry access, with default high/critical blocking per ADR-016. A failed/unavailable audit is recorded separately from offline behavioral results. Local DB/CI setup is introduced with M2; journey checks grow with M3/M4. New implemented behavior must add its checks; remaining planned cases stay visible until implemented. Run the full required baseline on the final candidate, not only changed tests.

Real-provider and model/voice checks are opt-in with approved budgets and versioned evidence. Prompt/model/corpus changes rerun affected empirical cases against recorded baselines using factual/task rubrics rather than exact generated strings; final release still requires the actual spoken/provider evidence. Record failed cases and comparison results. A flaky test is diagnosed and fixed; any temporary quarantine has an owner/reason and leaves its gate unsatisfied. Mandatory release gates cannot be waived by a green offline suite.

## 7. Rationale & Context

The project must demonstrate practical capability without overstating reliability. Deterministic tests can prove routing policy, state persistence, access boundaries, adapter contracts, and no-false-success behavior. Model answer quality and voice conversation behavior require empirical evaluation with recorded evidence because the same prompt may not produce identical text across runs or models.

## 8. Dependencies & External Integrations

### External Systems
- **EXT-001**: Boulder official website, official events/news pages, and municipal code library for grounded evidence; Linear demo destination for real ticket evidence.

### Third-Party Services
- **SVC-001**: OpenAI GPT-Live and reasoning model for spoken and text empirical evaluation.
- **SVC-002**: Supabase for durable conversations, business-hours configuration, scenario result storage if selected, and representative context.

### Infrastructure Dependencies
- **INF-001**: Deployed reviewer-accessible web app for V0 and D2 checks.
- **INF-002**: Versioned repository with real commit history for D1.

### Data Dependencies
- **DAT-001**: Versioned official-source metadata for code, website guidance, news, events, and deterministic business-hours fixtures.

### Technology Platform Dependencies
- **PLT-001**: TypeScript React and Node implementation with provider-neutral core and adapters.

### Compliance Dependencies
- **COM-001**: Transcript and audio retention choices affect stored spoken-eval artifacts and require separate approval.

## 9. Examples & Edge Cases

Compact scenario matrix:

| ID | Priority | Maps to | Root scenarios | Mode | Expected observable outcome |
| --- | --- | --- | --- | --- | --- |
| V0-001 | P0 | V0,D2 | A9,A25 | spoken | Browser hears caller and speaks a Boulder-specific answer; correction/interruption and resource close are inspected. |
| R1-001 | P0 | R1 | A1,A2 | empirical-text | Actual municipal code answer preserves qualifications and cites supporting code source/version; missing evidence limits answer. |
| R1-002 | P0 | R1 | A11 | empirical-text | Website service answer cites official Boulder website guidance. |
| R2-001 | P0 | R2 | A3 | empirical-text | Current news/events answer uses dated details; past/cancelled items are not upcoming. |
| R3-001 | P0 | R3,R5 | A5,A7,A14 | integration | Closed-hours confirmed request creates one verified Linear demo ticket; actual API readback verifies identity/location/description and authorized refresh reads current provider state. Read failure does not recreate; uncertain writes remain honest. |
| R4-001 | P0 | R4,R5 | A4,A8,A12 | e2e-browser | Open-hours pothole routes to Transportation & Mobility mock destination without ticket. |
| R4-002 | P0 | R4,R5 | A4,A8,A12 | e2e-browser | Open-hours park issue routes to Parks & Recreation mock destination without ticket. |
| R5-001 | P0 | R5 | A6,A23 | unit | Policy is deterministic from city-config fixture/test clock; invalid config blocks action. |
| F1-001 | P0 | R3,R5,R6 | A18,A24 | integration | Both correction/authorization race winners, duplicate submissions, and persistence failure follow workflow/integration contracts. |
| F2-001 | P0 | R6 | A17,A19,A20,A21 | integration | Provider-free checks, source/tool/session restrictions, limits, and redacted correlation are verified. |
| F3-001 | P0 | R6 | A13 | integration | Information-only conversation persists without staff action. |
| R6-001 | P0 | R6 | A17 | process | Commands, versioned scenarios, results, and known gaps are documented. |
| D1-001 | P0 | D1 | — | process | Git history and setup instructions are reviewable. |
| D2-001 | P0 | D2 | A1,A3,A4,A5,A8,A9,A11,A12,A25 | spoken | Fresh reviewer checks actual deployed voice, code/website/events, demo ticket and two mock routes. |
| D3-001 | P0 | D3 | — | process | One-page writeup renders within limit. |
| L1-001 | P1 | — | A22 | empirical-text | Candidate model shadow comparison uses simulated adapters only. |
| L2-001 | P1 | — | A10 | e2e-browser | `alwaysOpenTicket=true` creates a ticket before simulated route when open. |

The matrix is a compact suite map, not the complete runnable cases. Each listed failure and acceptance branch becomes a separate fixture/assertion in M2–M5. D1/D3 process evidence has no root A-scenario; extension rows use an empty mapsTo array. Remaining P1 A15/A16 checks are authored when tone/representative view is implemented. Every P0 A-scenario is mapped above.

Failure cases:

- **Concurrency**: two tabs submit the same confirmed draft; one atomic operation is prepared with no concurrent duplicate provider invocation. Test whether correction or authorization wins first and inspect the immutable authorized revision.
- **Retry timeout**: Linear create returns ambiguous timeout; app follows the verified native capability or operation-marker reconciliation strategy. Inconclusive search leaves uncertain and never authorizes blind recreate.
- **Prompt injection**: user or source text requests arbitrary URLs, all-ticket mode, or credential disclosure; app refuses by policy.
- **Stale evidence**: code/news source is older than configured freshness; answer names limitation or asks to retry after refresh.
- **Config unavailable**: Supabase hours config cannot load; app records failure and does not route or create a ticket blindly.

## 10. Validation Criteria

- The final scenario list maps all mandatory IDs V0, R1-R6, D1-D3.
- Automated tests assert UI state, durable records, adapter calls, trace correlation, and source links.
- Empirical model evaluations store prompt/config/model/source versions and human-readable rubric judgments.
- Spoken evaluation is labelled separately from text evaluation and includes at least one interruption or correction scenario.
- Final submission evidence records commit SHA, deployed URL, tested date, command/result summary, and known limitations.
- Inspect traceability to actual checks and results for implemented behavior, and review critical negative branches. Deliberately failing representative defects provides evidence that important tests detect regressions; mapping/coverage alone is insufficient.
- Required deterministic regressions pass on the integrated candidate; bug cases remain retained. Empirical changes include affected baseline comparisons. Planned/skipped/quarantined evidence is visible and cannot satisfy mandatory release gates.

## 11. Related Specifications / Further Reading

- [Root specification](../SPEC.md)
- [Security and observability process specification](spec-process-security-observability.md)
- [OpenAI voice agent evaluation example](https://developers.openai.com/cookbook/examples/audio/voice_agent_evaluation)
- [OpenAI voice server controls](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live) and [OpenTelemetry GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai)
