# Threefold Boulder voice agent

Workspace for the Threefold take-home assignment: a municipal voice agent for Boulder, Colorado.

**Status: the local browser saves and confirms pothole or park-maintenance reports against DB-backed Boulder hours. Open hours show distinct simulated department routes; closed hours use the Linear adapter when the dedicated demo project and API key are configured. Local fixtures pass, but a live Linear issue has not been verified. Three reviewed information examples work in text. GPT-Live browser/client-delegation code and a structured reasoning proposal are connected; two live synthetic reasoning calls passed, while microphone/spoken behavior remains unverified. Deployment is pending.**

**Submission target: all six assignment capabilities and all three deliverables.** Track completion against the evidence gates in the specification; optional extensions come after mandatory coverage.

- [Assignment](https://www.threefold.ai/developer-task)
- [Root specification, decisions, and assignment coverage](SPEC.md)
- [Decision rationale: why Boulder, OpenAI, and this design](DECISIONS.md)
- [Detailed development plan, milestones, checks, and commits](DEVELOPMENT_PLAN.md)
- [Architecture diagram and shared interfaces](spec/spec-architecture-system.md)
- [Application Core responsibilities, use cases, and ports](spec/spec-architecture-application-core.md)
- [Simple responsive UI concept — selected P0 direction](design/README.md)
- [Component specifications](spec/)
- [Agent engineering instructions](AGENTS.md)

## Working approach

Plan and make technical decisions with Dror step by step during implementation. Explain important alternatives and failure modes so Dror can own the live walkthrough and debugging session.

Review-ready direction: lightweight SDD with model-independent root/component specs and project instructions in `AGENTS.md`. TypeScript, React, and Node are selected. Supabase stores configuration and application state; Linear supplies real demo tickets. GPT-Live uses browser WebRTC and client delegation to the application backend. The API-level integration is wired; a spoken browser journey is still an evidence gate.

The agent-tool boundary and Application Core are shared conversation services. Voice is the required first channel; a later text-chat adapter can pass server-observed messages through the same tools and workflow without a second ticket or business-hours implementation.

Review the root SPEC, architecture, and affected contracts before each slice. Agree on observable behavior, define meaningful acceptance scenarios, implement, validate, and review behavior with relevant tests and changed specs. Model quality requires empirical evaluation as well as deterministic application tests. Keep every assignment capability in P0; tone, representative view, ticket-always execution, and shadow/replay runners are later features.

Environment requirement: first verify local React/Node and local Supabase. Core tests use provider-neutral fakes; Linear-adapter tests use a narrow loopback mock of the consumed GraphQL API. Local end-to-end runs and the cloud demo create/read real synthetic issues in an approved dedicated Linear board. GPT-Live and hosted reasoning remain external APIs. Isolate credentials/data, keep real E2E opt-in and bounded, and distinguish fake/mock/live evidence.

Tests accompany each behavior slice and map to SPEC scenarios; bug fixes retain regression cases, with deterministic checks and empirical voice/model evidence distinguished. Keep dependencies minimal, maintained, pinned, and reviewed for known advisories. Required regression/advisory checks guard integration and release; exact versions and scripts are established during implementation.

The first slices use pinned Node 24, TypeScript, Vitest, Vite, Biome, React, Fastify, and direct `pg` access to local Supabase Postgres. Native `Date` and `Intl` handle current time and Boulder timezone conversion. The policy adapter validates the DB row before the pure hours rule sees it. Playwright remains uninstalled. The runtime spec defines tool responsibilities.

## Run the local report path

Install Node 24.21.0 and npm 11.19.0 (`fnm use 24.21.0`), Docker, and the Supabase CLI. From this worktree:

```sh
npm ci
cp .env.example .env.local
supabase db start
supabase migration up --local
npm run dev
```

Open `http://127.0.0.1:5173`. Choose pothole or park maintenance, enter an issue and location, save, review the persisted summary, then confirm it. The server checks the current draft revision, Boulder policy row, and actual server time. If open, the page names the configured fictional department number and says no call was placed. If closed, it creates a Linear issue only when `LINEAR_API_KEY`, `LINEAR_TEAM_ID`, and `LINEAR_PROJECT_ID` are all set in the ignored `.env.local`; otherwise it says no ticket was created. A confirmed ticket operation freezes the draft, permits one create attempt, and stores the readback or uncertainty without blind retries. The API binds to `127.0.0.1:3001`; Vite proxies `/api` there. `npm run dev` starts both local processes and needs the local database. The sample database credential is for the Supabase development container only. Keep hosted credentials separate.

The same page has three buttons for reviewed code, pothole guidance, and one City Council event. These call the server's agent-tool handlers without an OpenAI call. The event example is verified only through September 16, 2026 UTC; after its freshness horizon, it returns limited coverage until the source and checked-in record are reviewed again. The browser buttons prove only these examples, not general city search or spoken behavior.

For the local voice path, put the approved development `OPENAI_API_KEY` in ignored `.env.dev` and click **Start voice**. The browser asks for microphone access and exchanges a WebRTC offer through the local Node server; the key stays server-side. GPT-Live delegates a caller turn to a bounded `gpt-5.6-luna` intent proposal, then the server validates it and calls the same application tools as the text page. A report still needs on-screen review and confirmation before routing or ticketing. Live voice costs apply; the local server limits session attempts and delegations. Without the key, the text path remains usable.

This is a single-developer, loopback-only harness. It does not submit a real Boulder service request or place a phone call. With a real Linear key, it can create synthetic tickets in the dedicated [Linear demo project](https://linear.app/hamaarag/project/96d0aa81-ab4c-48c1-996a-9c1c1bc45780/overview), but that live path still needs verification. Microphone/spoken behavior, public session admission, and deployment remain P0 gates; local API tests do not prove those paths.

## Local checks

Use Node 24.21.0 and npm 11.19.0 (see `.node-version` and `package.json`). With `fnm` installed, `fnm use 24.21.0` selects the local runtime; then run:

```sh
npm ci
npm run check
npm run build
npm run audit:dependencies
npm run test:db
```

`npm run check` performs formatting, lint (including the core import boundary), type, and offline test checks. `npm run test:db` adds real local Postgres adapter and API checks; it requires `.env.local` and the migrated local database. `npm run check:architecture` runs the focused Biome boundary rules; `npm run test:core` isolates the deterministic policy tests. `isWithinBusinessHours` receives a validated schedule and trusted server time and returns `true`, `false`, or `undefined` when indeterminate. `decideBusinessHoursAction` maps that result to `route`, `create_ticket`, or `unavailable`; neither function performs an external action. `src/server/agent-tools.ts` validates arguments and dispatches the four agent capabilities. The tested runtime policy row is seeded by a migration; the schedule in pure unit tests is only a fixture.

## Git

Repository history starts with one reviewed planning baseline. Subsequent implementation should use real incremental commits. No remote or CI is configured. Before implementation, follow the applicable personal Git/worktree guide and create an isolated worktree from the explicit `main` integration branch.

Commit discipline (details and examples in the development plan):

- One coherent, reviewable change per commit; descriptive messages explaining the resulting behavior.
- Include relevant tests with the behavior they verify. Preserve meaningful development history.
- Use Conventional Commit subjects, useful scopes, and short rationale/SPEC/verification bodies for nontrivial changes.
- Keep each delivered commit buildable/checkable at its milestone; verify the committed snapshot, including when partially staging changes.
- Separate unrelated refactors/formatting/dependency work. Preserve authentic incremental commits and avoid a single final dump or manufactured history.
- Keep source, prompt, policy, and evaluation changes traceable to specification scenarios.
- Create the planned stack-specific scripts in M0; verify the final candidate commit before delivery.
- Record local verification, remote CI, deployment, and live demo results separately.

These commands cover the current local slice. Deployed access, live provider checks, current source/configuration evidence, and the one-page writeup remain mandatory submission work.
