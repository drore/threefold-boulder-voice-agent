# Component specification instructions

This folder owns the detailed component contracts and acceptance criteria. Inherit [root engineering instructions](../AGENTS.md); current authorization is planning/documentation only.

- Read [SPEC](../SPEC.md) for current scope/decisions, [DECISIONS](../DECISIONS.md) for rationale, and [DEVELOPMENT_PLAN](../DEVELOPMENT_PLAN.md) for sequencing/evidence. Component documents refine these sources rather than silently overriding them.
- Preserve frontmatter and the eleven numbered sections. System architecture owns whole-system topology/shared envelopes; application-core architecture owns core responsibility/use-case/port semantics; workflow owns request/policy/state rules; integrations own provider operation/receipt contracts. Reference these owners instead of creating conflicting definitions.
- Document observable behavior and meaningful failure cases. Distinguish accepted requirements, proposed defaults, future commands, and actual verification. Preserve assignment coverage and P0 before P1/P2.
- Update affected links/contracts/acceptance criteria together. Check relative links, section/frontmatter structure, whitespace, and cross-document consistency; no application checks exist yet. `npm run check:spec` and `npm run check:architecture` are future M0 targets.
- Add a concise local `AGENTS.md` if a maintained subfolder is introduced. Keep runtime model instructions in the planned `prompts/` folder, separate from these repository maintenance instructions.
