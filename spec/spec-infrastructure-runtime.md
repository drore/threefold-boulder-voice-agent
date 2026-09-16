---
title: Runtime composition, reviewer access, and delivery infrastructure
version: 1.0-review
date_created: 2026-09-15
last_updated: 2026-09-15
owner: Dror Elovits
tags: [infrastructure, delivery]
---

# Runtime and delivery

## 1. Purpose and scope

Define a deployable P0 Node/React application and verification boundaries. No hosting account, remote, CI workflow, resource, or release is created by this planning document. Final service/cost/access choices are Q2/Q3/Q8/Q9.

## 2. Definitions

**Composition root:** server setup wiring concrete adapters to core. **Readiness:** dependencies/config permit expected work. **Liveness:** server process responds. **Candidate:** exact commit/build under verification. **Release:** deployed candidate plus approved resources/configuration.

## 3. Requirements, constraints, and guidelines

- INF-001: TypeScript/React/Node selected. Recommend React/Vite browser build served by a Fastify Node service; dependency versions pinned after M0 verification with committed lockfile.
- INF-002: Long-lived server supports outbound voice control WebSocket and authenticated UI status delivery. Browser primary audio can use WebRTC to provider. Do not assume short-lived serverless handlers maintain control sessions.
- INF-003: Same-origin browser/API simplifies auth and credentials. Secret values exist only server-side; validate environment/config at startup without echoing them.
- INF-004: Reviewer access establishes server scope before session/model/mutation work. Rate limits/quotas apply to direct endpoints. Access method/costs approved before publication.
- INF-005: Save durable workflow state in Supabase. Live connection history may be transient and instance-owned; restarts do not promise seamless audio continuation.
- INF-006: On shutdown/close, stop admission, drain safe pending work within a bounded time, finalize usage/state if available, close control/media connections. Record incomplete close rather than fabricate success.
- INF-007: Health/status exposes no secrets/caller data. Emit build/revision/config readiness metadata for verification.
- INF-008: Independent CI checks need no paid models; opt-in provider/voice evals use separate demo secrets and strict budgets. Do not run destructive external cleanup automatically.
- INF-009: Development runs React/Node and local Supabase before cloud deployment. Local services bind to loopback by default. Core/adapter tests use controlled fakes or the loopback Linear API mock; local E2E uses the approved dedicated real Linear demo board. GPT-Live and hosted reasoning remain external APIs; controlled substitutes support offline checks.
- INF-010: Production runs the UI/backend and managed Supabase in the cloud. Share application contracts and versioned migrations across environments; isolate credentials, data, provider destinations, origins, and budgets. Validate the selected environment at startup, with no implicit fallback to production.
- INF-011: Follow root ADR-016: minimal justified packages, supported stable versions/Node LTS, pinned runtime/tooling/direct versions and lockfile, reproducible installs, full-tree advisory review, separate Node/container review, and tested focused updates.
- INF-012: Use the modern toolchain below with minimal overlapping responsibilities. Prefer its standard defaults and supported integrations; verify compatibility/support/advisories before selecting exact versions.
- INF-013: The mock Linear endpoint/transport exists only in test composition and binds to loopback/ephemeral ports. Local/deployed E2E and cloud/production require the real Linear endpoint, verified dedicated board IDs, and valid credentials; configuration failure never falls back to the mock. The browser/model cannot select an endpoint or provider mode. Production builds/routes contain no mock controls.

## 4. Interfaces and data contracts

Recommended toolkit (planning baseline; no install/version selection yet):

| Responsibility | Tool | Reason / boundary |
| --- | --- | --- |
| React development and browser bundle | Vite with official React integration | Fast feedback and production assets; rely on its integrated bundler |
| Strict type checks and backend build | TypeScript compiler | Explicit type checking and JavaScript output for Node; frontend transpilation is separate from type checks |
| Runtime and HTTP service | Supported Node LTS + Fastify | Existing long-lived backend direction; native capabilities for simple utilities |
| Unit and contract checks | Vitest | Shared TypeScript test tooling, controlled clocks/mocks, watch feedback |
| Browser journeys | Playwright | Real browser/UI/API checks with controlled cloud boundaries; actual speech/device evidence remains separate |
| Lint and formatting | Biome | One tool for JS/TS/JSON lint/format; TypeScript still checks types |
| Dependency resolution and scripts | npm + committed lockfile | Simple reproducible project workflow; exact compatible package-manager version pinned in M0 |
| Local database services | Supabase CLI + Docker-compatible runtime | Local persistence/migrations consistent with managed Supabase |

Keep a single modular app and small configurations. Add plugins/build orchestration only for a demonstrated need. Backend compilation uses TypeScript output initially; extra server bundling is justified only by deployment requirements. M0 documents actual dev-watch/build/check commands and their compatibility. Local Vite API/event proxying preserves the same-origin session contract; deployed Node serves built UI assets. Check target browsers separately from build compatibility.

Environment contract:

| Component | Development | Production |
| --- | --- | --- |
| React UI and Node backend | Local processes; optional local build/container verification | Built UI served by the cloud backend |
| Application DB/configuration | Local Supabase via CLI and Docker-compatible container runtime | Separate managed Supabase project |
| Voice/reasoning | Approved cloud model APIs; controlled substitutes for offline tests | Approved cloud model APIs |
| Ticketing | Provider fake for core units; loopback Linear API mock for adapter tests; dedicated real Linear board for opt-in E2E | Real Linear in the explicitly approved reviewer/demo board; test mock excluded |
| Knowledge | Reviewed local corpus and official read-only refresh | Deployed corpus with the same provenance/freshness contract |

The take-home's deployed environment remains a municipal demo. Version migrations and synthetic seeds; inject environment-specific credentials/endpoints outside Git. Keep dev/prod state isolated. M0 documents reproducible local setup; M2 validates migrations and DB behavior locally; M6 verifies the cloud environment separately. Exact CLI/container commands are discovered and recorded during implementation.

Proposed HTTP surface:

| Route | Behavior |
| --- | --- |
| GET /health/live | Process health, no dependency or secret details |
| GET /health/ready | Validated DB/config/provider setup status with safe codes; no credentials |
| POST /api/access | Reviewer access method -> scoped secure session, if chosen |
| POST /api/conversations | Authorized admission/quota -> persisted conversation and public voice-session setup |
| GET /api/conversations/:id | Scoped public summary/sources/actions only |
| GET /api/conversations/:id/events | Authorized event stream; SSE/WebSocket implementation selected in M0 |
| POST /api/conversations/:id/close | Idempotent close/finalization request |

Session creation negotiates provider-specific WebRTC setup through VoiceSession/server adapter. Do not copy an incompatible Realtime endpoint/schema into GPT-Live. Runtime schemas validate requests, origin, size, and public responses; server authentication owns scope. Source URLs are evidence, not open redirect/proxy inputs.

Recommended demo access: server-created short-lived session with HttpOnly/Secure/SameSite cookie, explicit ownership, origin/CSRF protection, capped attempts, and separate secrets for reviewer admission versus provider APIs. A reviewer code is an option, not selected yet. Avoid email/OAuth account workflow unless required. If published without an access code, maintain equivalent server admission/quotas and obtain agreement on abuse exposure.

Configuration: exact voice/reasoning model/provider capability, DB connection/role, approved Linear team/credential, app version, allowed origin, budget/retention limits, telemetry exporter. City schedules/mappings/flag read from DB. No secret values in prompts, logs, fixtures, repository, or front-end build variables.

Dependency/release record: selected runtime/package-manager versions, direct package purpose/version, resolved lockfile, advisory check date/results/disposition, and selected base-image version/digest where used. M0 verifies compatibility/support and documents reproducible installs; M6 refreshes advisories. Exact commands are verified against the installed tooling. Known high/critical findings follow the blocking/exception rule in ADR-016; automated audit errors remain failures/unavailable rather than passing evidence.

Candidate hosting: one long-lived container/web service. Render documentation supports WebSockets but vendor/plan/region remain unselected. Verify outbound provider connections, HTTPS, browser media, health readiness, restart behavior, access and cost. Auto-sleep/cold start and shutdown must be considered; local success does not establish hosted behavior.

## 5. Acceptance criteria

- AC-001: Given a fresh authorized reviewer session, deployed candidate speaks/hears and exposes source/action status.
- AC-002: Given missing/invalid secret/configuration, server readiness reports safe failure and no paid/action work starts.
- AC-003: Given wrong conversation scope/direct endpoint call, no data/mutation access.
- AC-004: Given restart or media loss, UI reports interruption and persisted operations reconcile without duplicate actions.
- AC-005: Given shutdown/close, bounded cleanup occurs and finalization status is accurate.
- AC-006: Given documented local prerequisites and synthetic seeds, a fresh developer can run UI/backend/local Supabase and exercise J1/J2/J3 before cloud hosting. Record controlled-substitute and approved real-provider results separately.
- AC-007: Given development mode with missing or mismatched configuration, startup fails safely without connecting to production data or provider destinations.
- AC-008: Given a dependency update or release candidate, supported versions, unchanged reproducible resolution, advisory disposition, and relevant regression results are inspectable; unresolved material findings block the default gate.
- AC-009: Given unit/adapter checks, the mock binds only in test composition and no Linear credentials/network are required. Given local/deployed E2E, the real endpoint and dedicated board are mandatory; mock selection/interception or missing real configuration fails safely. Endpoint/provider choice cannot come from caller/model input.

## 6. Test automation strategy

Planned `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture`, `npm run check:spec`, `npm run check:dependencies`, `npm run test:core`, `npm run test:contracts`, `npm run test:browser`, and `npm run test:e2e`. Introduce package scripts in M0. Routine browser/component checks may use controlled boundaries; `test:e2e` always requires the dedicated real Linear board and is opt-in. Real microphone/device/provider evals remain explicit. Verify DB migrations from fresh local reset and deployed schema separately. Dependency audit needs registry access but no paid provider credentials; behavioral offline checks remain runnable when the registry is unavailable.

## 7. Rationale and context

One service reduces deployment/context ownership complexity while preserving adapter boundaries. Persistent DB state supports safe restarts; sticky audio/session routing is not distributed orchestration. A later worker can execute recorded operations behind unchanged contracts if scale requires it.

## 8. Dependencies and integrations

Node runtime/support version verified at implementation; React build tool; hosted long-lived HTTPS service; Supabase; OpenAI; Linear; optional OTel collector. No Redis, queue platform, Kubernetes, or contact-center service in P0. Git remote and reviewer permissions required for D1.

## 9. Examples and edge cases

Browser cannot reconnect its control socket to another instance and assume transient history exists. Server recovers durable operation state, but may require a new voice session with relevant restored context. In-memory rate limiting is only a single-instance safeguard; shared mutation quotas/admission records must be durable before claiming multi-instance enforcement.

## 10. Validation criteria

M0 resolves composition/provisioning prerequisites and command targets. M1 validates local control/media behavior and the candidate hosting path from platform constraints; an early hosted probe requires explicit external authorization. M6 records actual hosted behavior, exact deployed candidate, and fresh reviewer proof for D1/D2. External creation/publication/spending approval is required; local docs/CI proof does not meet release gates.

## 11. Related specifications

[Root](../SPEC.md), [architecture](spec-architecture-system.md), [integrations](spec-tool-integrations.md), [security](spec-process-security-observability.md), [plan](../DEVELOPMENT_PLAN.md).

Primary references: [Live server controls](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live), [WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live), [Render connection lifecycle](https://render.com/docs/websocket), [Supabase security](https://supabase.com/docs/guides/api/securing-your-api), [Supabase local development](https://supabase.com/docs/guides/local-development).

Tool references: [Vite](https://vite.dev/guide/), [Vitest](https://vitest.dev/guide/), [Playwright](https://playwright.dev/docs/intro), [Biome](https://biomejs.dev/guides/getting-started/).
