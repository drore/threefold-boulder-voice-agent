# Component specification instructions

This folder owns the detailed component contracts and acceptance criteria. Inherit [root engineering instructions](../AGENTS.md); local Application Core work is authorized, and external-action gates still apply.

- Read [SPEC](../SPEC.md) for current scope/decisions, [DECISIONS](../DECISIONS.md) for rationale, and [DEVELOPMENT_PLAN](../DEVELOPMENT_PLAN.md) for sequencing/evidence. Component documents refine these sources rather than silently overriding them.
- Preserve frontmatter and the eleven numbered sections. System architecture owns whole-system topology/shared envelopes; application-core architecture owns core responsibility/use-case/port semantics; workflow owns request/policy/state rules; integrations own provider operation/receipt contracts. Reference these owners instead of creating conflicting definitions.
- Document observable behavior and meaningful failure cases. Distinguish accepted requirements, proposed defaults, future commands, and actual verification. Preserve assignment coverage and P0 before P1/P2.
- Update affected links/contracts/acceptance criteria together. Check relative links, section/frontmatter structure, whitespace, and cross-document consistency. `npm run check:architecture` exists; `npm run check:spec` is a future M0 target.
- Add a nested `AGENTS.md` only if a spec subfolder introduces material local ownership, format, safety, or validation rules that this file and the root do not cover. Keep runtime model instructions in the planned `prompts/` folder, separate from repository maintenance instructions.
