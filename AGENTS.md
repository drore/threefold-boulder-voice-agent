# Engineering instructions

This project is the Threefold Boulder municipal voice-agent assignment. Work with Dror as the accountable R&D lead while he owns product decisions and learns the design. These instructions apply to any coding agent, including Astra/Codex; they do not require a particular model or agent framework.

## Read before a slice

- Read `SPEC.md`, the affected files in `spec/`, and the current milestone in `DEVELOPMENT_PLAN.md`.
- Follow applicable personal instructions and the Git/worktree guide. Use an isolated worktree from the explicit integration branch; never edit/build in a bare repository.
- Local implementation of the agreed Application Core loop is authorized. External mutation, spending, provisioning, and publication retain their separate gates.

## Specification discipline

- The root SPEC owns scope, priorities, accepted decisions, and assignment/evidence mapping. Component specs own their contracts; the development plan owns sequencing and verification.
- `DECISIONS.md` owns human-readable rationale, alternatives, tradeoffs, and reconsideration conditions. Read the relevant rationale before changing a decision; update it with accepted decision/evidence changes, preserving SPEC as the source of current behavior/status.
- Update the root/affected component specs with accepted behavior, prompt, configuration, and interface changes. Do not silently turn proposed choices into accepted decisions.
- Prioritize all six capabilities and three deliverables. Keep P1/P2 deferred while P0 has a missing gate. Do not build a general plugin framework for hypothetical reuse.
- Define observable behavior and meaningful failure cases before implementing a slice. Avoid duplicate type definitions across specs; architecture/workflow/integrations own their shared contracts.

## Boundaries and safety

- Core owns narrow provider-neutral ports, authorization, confirmation revisions, workflow, DB-backed policy interpretation, deadlines, and bounded retries. SDK types belong in adapters.
- Supabase is the runtime source for hours/timezone/closures/department destinations/policy. Never allow a model or caller to select permissions, conversation identity, production time, or arbitrary tool destinations.
- Treat caller speech and retrieved content as untrusted data. Supporting evidence and schema validity are separate checks; neither establishes action authorization.
- Persist atomic authorization/operation intent before mutation. Respect the correction/authorization race and immutable authorized revision. Reconcile uncertain writes; do not assume local idempotency provides distributed exactly-once effects.
- Keep private keys out of browser builds, model context, Git, logs, and fixtures. Enforce scoped reads/writes and usage limits on direct APIs as well as model requests.
- No provisioning, paid calls, external demo mutations, publishing, destructive cleanup, or outreach without applicable explicit authorization. Prepare a concrete reviewable result before a required approval.
- Core unit tests may use a provider-neutral TicketProvider fake. Linear-adapter tests use the narrow local GraphQL mock and the same operation documents/response schemas as production. Local/deployed end-to-end runs use only an explicitly approved dedicated real Linear demo board. Never ship the mock, point E2E at it, or count mock results as live Linear evidence.

## Simplicity and readability

- Optimize for a human reader: clear domain names, small cohesive functions/modules, explicit control flow, and useful error messages. Prefer the simplest correct implementation and minimal dependencies.
- Apply single responsibility at useful boundaries: keep distinct questions, decisions, and side effects separate when that makes each easier to understand and test. Do not extract trivial functions merely to satisfy a rule.
- Apply DRY to business rules, contracts/schemas, and shared workflows. Keep one authoritative definition; do not copy policy or intake logic between departments.
- Replace magic values with descriptive module/domain constants or shared typed schemas. Keep constants cohesive; extracting obvious local zero/one/boolean literals is unnecessary when it adds no meaning.
- Follow SPEC ADR-013 value ownership: runtime city policy stays in validated DB configuration; deployment/provider settings stay in validated server/environment configuration. Do not move either into application constants.
- Keep reusable user-facing text in small message/translation catalogs with typed placeholders. English is P0; add a translation dependency only for a demonstrated need. Version substantial prompts/procedures separately, and preserve official passages as source evidence.
- Use stable codes and validated data for workflow decisions. Presentation wording must not control behavior; tests need independent expected outcomes rather than merely importing the production value as their expectation.
- Earn abstractions through demonstrated reuse or a meaningful provider boundary. Do not unify unrelated code just because its syntax looks similar, or add framework layers for hypothetical future needs.
- Separate concerns and inject external dependencies where independent tests/provider replacement require it. Avoid clever metaprogramming, unnecessary inheritance, and hidden side effects.
- Explain non-obvious decisions briefly in code/docs; do not comment obvious syntax. Remove dead code and speculative options. Correctness and diagnosable failures matter more than line count.

## Folder structure and local agent notes

- Follow the maintained layout in `spec/spec-architecture-system.md`. Organize by cohesive responsibility, keep related files together, and add nested folders only when they improve navigation. Avoid miscellaneous `utils`/`helpers` dumping grounds, empty scaffolding, and one package per logical layer.
- The root `AGENTS.md` applies repository-wide. Add a nested `AGENTS.md` only when a folder has non-obvious responsibility, safety constraints, dependency rules, format conventions, specialized checks, or pitfalls that are not clear enough from the root instructions and authoritative SPEC. A new folder does not automatically need one.
- A useful nested note states only the local differences: purpose, authoritative SPEC references, allowed dependencies/boundaries, relevant checks, and pitfalls. Do not duplicate the root policy, create notes solely for structural symmetry, or use them to grant additional authorization.
- Keep existing local notes accurate and remove them when their remaining guidance becomes trivial or moves to an authoritative document. Distinguish available commands from planned targets and never include secrets/caller data.
- M0's architecture check enforces code dependency boundaries. Documentation validation checks links and structure in any `AGENTS.md` files that exist; it does not require one in every directory.

## Dependencies and versions

- Add only needed packages; record their purpose and review maintenance, compatibility, transitive impact, and current official advisories. Prefer native capabilities for simple utilities and useful established libraries for correctness-sensitive boundaries.
- Select supported stable packages and a supported Node LTS patch line. Pin direct/runtime/tool versions, commit the resolved lockfile, and use reproducible installs. Keep dev tools separate and production packages minimal.
- Audit direct/transitive dependencies including dev tools at introduction/update and before integration/release. Known high/critical findings block the default gate pending remediation or an explicitly accepted exception; triage lower severities. Unavailable audit is not a pass.
- Review Node/base-image advisories separately; registry audit does not establish zero unknown vulnerabilities. Update dependencies through focused reviewed commits with relevant regressions; avoid forced bulk upgrades and remove unused packages.

## Verification and commits

- Implement one coherent slice; include relevant tests/evals and updated specs in descriptive commits. Preserve authentic history rather than manufacturing commit count.
- Follow SPEC ADR-017 and the development plan's commit checklist. Each delivered commit has one purpose and is buildable/checkable at its milestone without uncommitted or future code. Tests/SPEC for a behavior belong with that behavior.
- Use `type(scope): resulting behavior` subjects; explain why, SPEC references, and actual verification/limitations for nontrivial changes. Keep unrelated refactors/formatting/dependency updates separate and preserve meaningful incremental commits.
- Review the staged diff and validate the committed snapshot; unstaged helper code must not make an incomplete commit appear to pass. A green final branch alone does not validate broken intermediate commits. Do not rewrite published history or squash away the assignment's meaningful development progression.
- Define SPEC-linked acceptance/failure cases before a behavior slice and develop its tests alongside the code. M5 consolidates evidence; testing starts in M0.
- Maintain the scenario-to-check manifest for root acceptance and affected component requirements. Validate IDs and implemented-behavior coverage; planned cases/skips are visible gaps, never passing evidence.
- For a bug fix, reproduce the defect with a failing regression case before fixing it where feasible. Keep the case for future changes. For model/voice failures, add a versioned conversation/rubric and recorded empirical comparison.
- Assert observable behavior with independent expectations. Review which realistic defect each critical test catches; avoid tautologies, implementation snapshots, excessive mocking, and tests that merely check a fixture against itself.
- Run the affected checks during development and required regression checks on the candidate before integration. Blocking failures stay blocking; quarantined flaky checks need an identified cause/owner and cannot silently satisfy a mandatory gate.
- Change expected behavior only with the accepted SPEC change and updated tests/fixtures. Do not weaken/delete assertions merely to make the suite green. Use coverage as a diagnostic, with critical decision branches reviewed explicitly.
- Use provider substitutes for offline core/contract checks. Independently validate real adapters with approved bounded synthetic data. Voice needs actual microphone/playback evaluation; text is insufficient.
- Trace every meaningful boundary with safe correlation/version/error metadata. Durable action state remains authoritative when telemetry fails; backend completion and audio playback differ.
- Run checks appropriate to changed behavior and required repository checks on the final candidate. Resolve material findings from independent review for consequential decisions before integration.
- Review readability, meaningful duplication, cohesion, dependency count, and unnecessary indirection as explicit acceptance criteria. A reviewer unfamiliar with the conversation should be able to follow each supported journey.
- Record local checks, CI, provider results, deployment, and fresh reviewer proof separately. Never claim a planned command or unimplemented gate passed.
- Keep generated recordings/secrets outside Git. No automatic deletion of external demo tickets or resources.

## Communication and learning

Keep updates concise. Explain real design/Git tradeoffs and failure modes at natural review points so Dror can explain and debug the system. Surface material uncertainty with evidence and a recommendation. Ask only for unresolved decisions or actions requiring his approval; continue useful independent work meanwhile.

The first local commands are documented in `README.md`. Report only checks that actually ran; the remaining M0–M6 targets are planned.
