# Threefold Boulder voice agent

Workspace for the Threefold take-home assignment: a municipal voice agent for Boulder, Colorado.

**Status: the local text form saves a pothole draft, accepts explicit confirmation of its current revision, reads Boulder hours and department mapping from Supabase Postgres, and displays the resulting mock routing decision. During closed hours it explains that no Linear ticket was created. Three reviewed, source-linked information examples work through the local agent-tool boundary and browser buttons. The separate Linear adapter passes loopback create/read tests but is not connected to the report path. Browser voice, real ticket creation, a second department route, and deployment remain unimplemented.**

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

Review-ready direction: lightweight SDD with model-independent root/component specs and Astra/Codex working instructions in `AGENTS.md`. TypeScript, React, and Node are selected. Supabase stores configuration and application state; Linear supplies real demo tickets. GPT-Live voice and its reasoning delegation must pass an early feasibility gate. Remaining choices are explicit in the SPEC decision register.

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

Open `http://127.0.0.1:5173`. Enter a pothole description and location, save, review the persisted summary, then confirm it. The server checks the current draft revision, Boulder policy row, and actual server time. If open, the page names the configured fictional Transportation number and says no call was placed. If closed, it says the Linear ticket path is pending and no ticket was created. Refreshing the page reloads the draft; the decision itself is not persisted. The API binds to `127.0.0.1:3001`; Vite proxies `/api` there. `npm run dev` starts both local processes and needs the local database. The sample database credential is for the Supabase development container only. `.env.local` is Git-ignored; keep hosted credentials separate.

The same page has three buttons for reviewed code, pothole guidance, and one City Council event. These call the server's agent-tool handlers without an OpenAI call. The event example is verified only through September 16, 2026 UTC; after its freshness horizon, it returns limited coverage until the source and checked-in record are reviewed again. The browser buttons prove only these examples, not general city search or spoken behavior.

This is a single-developer, loopback-only harness. It does not submit a real service request, call OpenAI or Linear, place a phone call, or provide multi-user browser sessions. These are explicit later P0 gates, not claims of a completed assignment.

## Local checks

Use Node 24.21.0 and npm 11.19.0 (see `.node-version` and `package.json`). With `fnm` installed, `fnm use 24.21.0` selects the local runtime; then run:

```sh
npm ci
npm run check
npm run build
npm run audit:dependencies
npm run test:db
```

`npm run check` performs formatting, lint (including the core import boundary), type, and offline test checks. `npm run test:db` adds real local Postgres adapter and API checks; it requires `.env.local` and the migrated local database. `npm run check:architecture` runs the focused Biome boundary rules; `npm run test:core` isolates the deterministic policy tests. `isWithinBusinessHours` receives a validated schedule and trusted server time and returns `true`, `false`, or `undefined` when indeterminate. `decideBusinessHoursAction` maps that result to `route`, `create_ticket`, or `unavailable`; neither function performs an external action. `src/server/agent-tools.ts` defines four agent capabilities, validates model arguments, and dispatches to handlers. The local pothole draft handler and a separate explicit UI confirmation path are implemented; no GPT-Live call is wired. The tested runtime policy row is seeded by a migration; the schedule in the pure unit tests is only a fixture.

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

These commands cover only the current provider-free slice. Deployed access, provider checks, current source/configuration evidence, and the one-page writeup remain mandatory submission work.
