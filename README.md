# Threefold Boulder voice agent

Planning workspace for the Threefold take-home assignment: a municipal voice agent for Boulder, Colorado.

**Status: planning only. No application, external integration, or deployment exists yet.**

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

Plan and make technical decisions with Dror step by step before implementation. Explain important alternatives and failure modes so Dror can own the live walkthrough and debugging session.

Review-ready direction: lightweight SDD with model-independent root/component specs and Astra/Codex working instructions in `AGENTS.md`. TypeScript, React, and Node are selected. Supabase stores configuration and application state; Linear supplies real demo tickets. GPT-Live voice and its reasoning delegation must pass an early feasibility gate. Remaining choices are explicit in the SPEC decision register.

Review the root SPEC, architecture, and affected contracts with Dror before implementation. For each slice: agree on observable behavior, define meaningful acceptance scenarios, implement, validate, and commit behavior with relevant tests and changed specs. Model quality requires empirical evaluation as well as deterministic application tests. Keep every assignment capability in P0; tone, representative view, ticket-always execution, and shadow/replay runners are later features.

Environment requirement: first verify local React/Node and local Supabase. Core tests use a TicketProvider fake; Linear-adapter tests use a narrow loopback mock of the consumed GraphQL API. Local end-to-end runs and the cloud demo create/read real synthetic issues in an approved dedicated Linear board. GPT-Live and hosted reasoning remain external APIs. Isolate credentials/data, keep real E2E opt-in and bounded, and distinguish fake/mock/live evidence. Current work remains documentation only; Dror asked to wait before writing application code.

Tests accompany each behavior slice and map to SPEC scenarios; bug fixes retain regression cases, with deterministic checks and empirical voice/model evidence distinguished. Keep dependencies minimal, maintained, pinned, and reviewed for known advisories. Required regression/advisory checks guard integration and release; exact versions and scripts are established during implementation.

Recommended modern toolkit: Vite, TypeScript, Node/Fastify, Vitest, Playwright, and Biome, with npm scripts/lockfile. The runtime spec defines responsibilities and M0 verifies compatible supported stable versions before installation.

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

No application or package scripts exist yet. The development plan lists future command targets; none is claimed to have run. Replace this paragraph with exact setup/run/check/evaluation instructions when M0 establishes them. Deployed access, provider checks, current source/configuration evidence, and the one-page writeup are mandatory submission work.
