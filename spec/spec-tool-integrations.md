---
title: Persistence, Linear tickets, and simulated transfer adapters
version: 1.0-review
date_created: 2026-09-15
last_updated: 2026-09-16
owner: Dror Elovits
tags: [tool, persistence, integrations]
---

# Provider adapters

## 1. Purpose and scope

Implement the first draft/configuration stores on Supabase Postgres, TicketProvider on Linear, and TransferProvider as explicit simulation. P0 requires actual demo ticket creation; mock-only ticket substitution is insufficient. Dror authorized a dedicated Linear project and synthetic demo tickets; a live API credential and first ticket readback are still pending.

## 2. Definitions

**Receipt:** verified provider ID/outcome. **Idempotent:** repeated application request preserves one logical operation. **Reconciliation:** determine provider commit status after uncertainty. **Attempt:** one provider call under an operation budget. **RLS:** PostgreSQL row-level security.

## 3. Requirements, constraints, and guidelines

- INT-001: Persist conversation before initiating voice work and persist operation intent before mutation. Failure returns unavailable/blocked, not unrecorded successful execution.
- INT-002: Scope state queries by server-authorized conversation/city, not caller-supplied IDs. Configuration mutation is not an agent tool.
- INT-003: Use DB atomic transitions/unique constraints for revisions, confirmation, operation creation, and quota accounting. In-memory mutex alone is insufficient across restart/instances.
- INT-004: Linear team and dedicated project are server-configured. Ticket text is bounded untrusted content, never an instruction to another executor.
- INT-005: Store actual receipt and display it only after provider success. Transport HTTP success alone is not GraphQL mutation success.
- INT-006: Writes that may have committed become uncertain and enter reconciliation; no blind recreate loop. Do not promise cross-system exactly-once delivery without provider proof.
- INT-007: Classify errors by operation kind/provider semantics. The first slice makes one bounded read attempt per user request; an explicit repeat may read again. Writes do not retry without authoritative no-commit evidence or verified native idempotency.
- INT-008: Transfer simulation has an observable lifecycle and distinct configured department. Never dial fictional numbers or claim real Boulder staff answered.
- INT-009: All adapters propagate correlation/timing/error events and implement capability metadata. Provider specifics stay outside core.
- INT-010: Linear is the real external ticket system. Create, readback, authorized detail/status retrieval, and reconciliation use its API in approved local E2E/deployed operation. Supabase references/receipts/snapshots do not replace current provider reads. Fakes and the local API mock provide no real Linear evidence.
- INT-011: Ticket reads require a server-authorized operation/conversation-to-provider reference. Reject unrelated references before calling Linear; validate returned issue ID and bounded fields. Treat remote ticket text as untrusted data and enforce the read deadline. Team/project identity is enforced on create; current read-by-ID response does not expose team/project fields, so live E2E must inspect project membership before claiming it.
- INT-012: The Linear test harness exposes only the GraphQL-over-HTTP operations the real adapter consumes. Reuse the production operation documents and runtime response schemas; validate operation name/variables and return realistic data/errors, HTTP status, and relevant rate-limit headers for success, rejection, partial/GraphQL error, rate limit, timeout-after-commit, not-found, and read-unavailable fixtures. Do not implement a generic GraphQL engine, local board UI, or provider capabilities we have not verified.
- INT-013: The P0 ticket operation has one atomic `ready -> attempting` claim before a create call. A nonterminal `attempting` operation after interruption is potentially committed and must not be blindly retried. A separate attempt ledger is deferred until a demonstrated need for multiple attempts.

## 4. Interfaces and data contracts

Proposed DB entities (schema/migration implementation in M2):

| Entity | Minimum fields / invariant |
| --- | --- |
| city_configs | city ID, monotonic revision, timezone, policy, validity/source metadata; validated snapshot |
| departments/schedules/closures | city/config revision, allowed request mappings, fictional destination, verified weekly and special-date opening hours; normalized or validated versioned JSON is an implementation choice |
| conversations | server ID, city, scope/owner binding, created/closed UTC, mode, status, prompt/model/config versions; minimal summary/context |
| request_drafts | conversation FK, request type, current revision, bounded location/description, state |
| confirmation_evidence | draft/revision, pending-summary reference, observed explicit response/provenance/time; invalidated on correction |
| ticket_operations | one row per draft, authorized revision/policy, immutable report details, state, provider issue ID/readback or uncertainty |

The first implementation uses a unique `draft_id` and scoped ownership FK. Authorization rechecks admission, revision, complete details, and policy revision in a transaction; a separate atomic `ready -> attempting` update permits one create call. Draft corrections and authorization serialize on the same draft row. Network work is outside database transactions. Receipt update checks operation state and retains evidence if caller disconnected. Recovery treats an unterminated started write attempt as potentially committed.

DB access recommendation: private application tables with a restricted server role and encrypted pooled connection; alternatively a server-only Supabase client with tightly reviewed grants/RLS and explicit app authorization. Select credential/access mode at M0/M2. Never expose secret/service-role credentials; service-role bypasses RLS and therefore cannot substitute for authorization. RLS must be enabled on exposed tables with deliberate grants/policies; revoke unnecessary browser-role access. Do not casually introduce SECURITY DEFINER functions.

Ticket input: `PreparedTicket { operationId, cityId, departmentId, requestType, location, description, confirmedRevision, confirmedAtUtc, demoLabel }`; team/provider identifiers supplied by adapter composition, not model. No mandatory caller contact data. Output: provider ID, identifier, URL, verified timestamp, provider name; store mapping to operation.

Ticket read contract: server resolves an authorized linked ticket reference, then TicketProvider fetches it from Linear. Normalize a found snapshot containing provider ID/identifier/URL, bounded title/description, provider state ID/label, optional provider-update timestamp, and server fetch timestamp; distinguish not-found from unavailable/classified error. Verify actual field/schema support in M3. Location and description must be inspectable in the actual issue; no native custom location field is assumed. Preserve provider state labels separately from local operation state. A saved snapshot is historical and must retain its fetch time; a fresh-status request invokes Linear rather than returning the stored snapshot as current.

Perform real readback for creation evidence and use bounded reads when details/status or reconciliation are needed. Avoid background per-ticket polling; automatic live synchronization/webhooks are outside P0. A successful verified create receipt still establishes creation if a later status fetch fails: retain that receipt, report latest details/status unavailable, and never recreate the issue. A not-found read is not authoritative no-commit evidence for an uncertain create.

Linear reconciliation: prefer provider-supported stable create ID/idempotency mechanism **only after verifying schema/semantics**. Otherwise include a server operation marker in the approved demo ticket and perform a bounded supported lookup. If lookup is inconclusive, retain uncertain, inform caller, and require follow-up; absence from an eventually consistent search is not authoritative permission to recreate. Tests prove the chosen strategy, not a generic exactly-once claim.

Linear API mock: run in the test process or on a loopback ephemeral port using existing Node/server tooling, with no new infrastructure service. It stores only isolated synthetic fixture state needed for a test. Keep mock provider state separate from application operation/receipt state so timeout-after-commit and application-restart cases preserve the cross-system boundary. Reset explicitly between cases. Production configuration cannot select the mock endpoint; tests inject the mock transport/endpoint through a test-only composition boundary.

Real E2E project: local and deployed end-to-end cases use the dedicated Linear demo project created on September 16, 2026. Use bounded synthetic tickets with clear demo/operation markers and no real caller data. Verify created fields through real readback and confirm project membership in Linear; retain issue identifiers as evidence. Avoid repeated unnecessary external creations; no automatic external cleanup is implied. General workspace browsing remains outside P0.

Transfer input: allowed department/destination/config revision/operation ID. Simulation result: pending -> answered|failed|cancelled with timestamps and `simulated:true`. Answer means simulation completed, not actual staff. P0 uses a small deliberate simulation delay; exact duration is a configuration default to review. Controlled test fixtures can force failure/cancel. Optional tone/representative view attaches in P1 to these states.

## 5. Acceptance criteria

- AC-001: Given an approved Linear team, closed-hours confirmed report creates a real issue and matching DB receipt/fields.
- AC-002: Given timeout after simulated commit, retry/reconnect returns uncertain or reconciled receipt without another create.
- AC-003: Given duplicate/concurrent submissions, one local operation is prepared and external creation is not invoked twice concurrently.
- AC-004: Given real DB transition conflict, stale confirmation/report cannot execute.
- AC-005: Given two report intents, distinct DB mock destinations receive observable simulated routing.
- AC-006: Given blocked/stale/persistence-unavailable state, no new provider mutation occurs.
- AC-007: Given a created authorized ticket, actual Linear readback returns matching provider identity/location/description and a timestamped state snapshot; needed refresh reads the provider rather than a local placeholder.
- AC-008: Given an unrelated reference, provider read is blocked; given auth/GraphQL/rate-limit/not-found/unavailable outcomes, no private ticket is exposed, current status is not invented, and no create is triggered by a read failure.
- AC-009: Given the Linear API mock, the real adapter emits the expected GraphQL operations and classifies response/error/rate-limit/timeout fixtures correctly without network credentials. Given local E2E, the app creates and reads back a real synthetic issue in the dedicated board; mock endpoints/configuration cannot satisfy or intercept that run.
- AC-010 (first Linear slice): The adapter uses a server-held key and configured team/project to issue only the documented create and issue-by-ID GraphQL operations. A loopback mock verifies create payload and separate readback, including HTTP and GraphQL errors. An ambiguous create result is `uncertain` and never retried by the adapter. The local closed-hours workflow has only fixture evidence; it does not claim live integration until a real run verifies it.

## 6. Test automation strategy

Planned `npm run test:contracts` with provider-neutral fakes; `npm run test:integration` with local DB plus the real Linear adapter against the mock API; opt-in `npm run test:e2e` against the explicitly approved demo DB/board. Across the appropriate levels, cover success, GraphQL error despite HTTP 200, rate limit, auth failure, known rejection, ambiguous timeout, reconciliation uncertainty, duplicate and restart behavior. Live E2E includes create-then-real-readback, authorized refresh, unrelated-reference rejection, and read failure without recreate or false current status. Use synthetic reports, bounded mutation count, identifiable run labels; no automatic delete/archive cleanup of external issues without authorization.

Run provider-neutral core cases with a simple fake and Linear-adapter cases against the local API mock. A fake TicketProvider alone cannot validate GraphQL mapping. Local/deployed E2E uses the actual Linear adapter and dedicated real board; it is opt-in, credentialed, bounded, and never a default credential-free CI check. Keep real create/readback/retrieval evidence mandatory before submission.

## 7. Rationale and context

Real Linear validates R3. Local operation tracking plus provider reconciliation prevents common duplicates while honestly handling distributed uncertainty. Durable contracts allow later provider replacement; native capabilities must be verified per provider.

## 8. Dependencies and integrations

Approved Supabase project/DB role and Linear team/credential. Migration tool/commands discovered from installed CLI help in M2, not guessed now. Pin libraries/lockfile; verify schema and grants before external operations. Transfer is entirely local simulation.

## 9. Examples and edge cases

Provider created ticket, local receipt save failed -> preserve uncertain operation and reconcile; never say ticket definitely failed. Server restarts while executing -> reconcile recorded in-flight operations before new creates. Validation/auth errors are not transient retry candidates. A user repeats the request after hearing no result -> existing operation, not new ticket by default.

## 10. Validation criteria

M2 local DB/schema/access/concurrency checks; M3 real bounded Linear operation and reconciliation tests; M6 deployed fresh-session proof. Record provider schema/permission evidence and test revision. The create/read adapter has been exercised against a loopback GraphQL mock and the closed-hours workflow against a fixture provider with a real local database. No real Linear query or ticket has executed.

## 11. Related specifications

[Workflow](spec-process-workflow.md), [runtime](spec-infrastructure-runtime.md), [security](spec-process-security-observability.md), [evaluation](spec-process-evaluation.md).

Sources: [Supabase grants/RLS](https://supabase.com/docs/guides/api/securing-your-api), [Linear GraphQL](https://linear.app/developers/graphql), [Linear limits](https://linear.app/developers/rate-limiting), [fictional numbers](https://nanpa.com/numbering/555-line-numbers).
