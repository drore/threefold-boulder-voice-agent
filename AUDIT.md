# Architecture audit

Independent review of quality, engineering principles, structure, and naming.
Baseline: `feat/core-policy` at `1894138`; `npm run check` (123 + 43 skipped),
`npm run test:db` 166/166, `npm run build`, and the live conversation loop pass.

## What is strong

- Clear hexagonal layering (`core` provider-free, `adapters` provider-specific,
  `server` composition/reasoning/voice/workflow, `web` presentation) with an
  enforced core import boundary and 166 passing checks.
- Safety posture: the model proposes through validated tools; only the server
  authorization path performs a route or ticket. Confirmation is revision-bound.
- Spec/decision discipline (SPEC, ADRs, evidence ledger, versioned evals) and
  reproducible checks; the conversation loop turns review into findings.
- Direct `pg` stores are the right call: narrow ports, parameterized SQL, now
  shared transaction/log plumbing. An ORM would add a second migration system,
  codegen, and hide the SQL this project reviews for safety.

## Findings

### High

1. **City-specific values live in code.** `knowledge-tools.ts` holds
   `BOULDER_TIME_ZONE`, the glass/pothole answers and source cards, the event
   listing source, and a council-title matcher; `adapters/boulder/events.ts`
   holds the listing URL; `main.ts` holds `CITY_ID`; instructions and UI copy
   name Boulder. This contradicts ADR-003/ADR-013 value ownership and blocks
   reuse for another city. See the plan below.
2. **Prompts and copy are embedded in code.** Reasoning instructions,
   LIVE_INSTRUCTIONS, and user-facing strings live in TS modules. SPEC expects
   substantial prompts as versioned artifacts (the layout's `prompts/`), with
   the version recorded in traces so an evaluation can name what it tested.
3. **No trace/correlation boundary yet (ADR-010).** Failures return opaque
   messages; the planned debugging rehearsal has little to inspect.

### Medium

4. **`build-app.ts` is a god-module** (~600 lines): routes, session glue, tool
   execution, scenario state, and copy. Split into route registration, a tool
   executor, and scenario/demo state.
5. **Message copy is scattered** across `build-app.ts`, `web/messages.ts`, and
   the prompts. ADR-013 asks for small typed catalogs per surface.
6. **Tool-argument validation rejects instead of normalizes.** Two live
   failures came from `null`/empty optionals; unknown keys still fail the whole
   call as `invalid_arguments`. Keep required fields strict, but drop unknown
   and empty optional values with a logged warning so the model gets a usable
   result.
7. **`knowledge-tools.ts` mixes evidence, matching, and composition.** The
   reviewed answers and citations are content, not logic; they belong in a
   corpus, with only a generic matcher in code.
8. **Tests stop mirroring source** after the `core/service-report/` move;
   `tests/core/*` still sit flat.

### Low

9. Naming: `LocalConfirmResult` is the shared outcome, not a local one;
   `effectiveClock`/`scenarioClock` read as two concepts; `isGroundedInUtterance`
   is good but its predecessor name remains in history only.
10. The demo scenario endpoint is unconditional in reviewer mode; it is an
    intentional demo affordance and should stay documented as such.
11. Eval results are git-ignored; canonical numbers must keep being recorded in
    `eval/README.md` (they are).
12. CI exists but has never run remotely (no remote configured) — the D1 gate.

## De-Boulderization plan

Goal: one generic city-services system, currently configured for Boulder; data
in the database wherever runtime policy or content is involved.

**Slice 1 — configuration into the DB.** Extend the city config row
(`city_policies` or a sibling `city_settings`) with `displayName`, `timeZone`,
and `eventsListingUrl`; validate them in the Postgres adapter (ADR-003);
consume them in `knowledge-tools`, the events adapter, and `main`; seed Boulder.
Rename `adapters/boulder/` to a config-driven `adapters/city-website/`.

**Slice 2 — knowledge corpus into the DB.** New `city_knowledge` table
(topic key, matcher terms, answer, source title/url/kind/verified/effective,
excerpt, limitations) seeded per city; `KnowledgeProvider` reads it; the glass
and pothole examples become rows, and `knowledge-tools` keeps only generic
matching and answer composition.

**Slice 3 — prompts and copy.** Move instructions to versioned `prompts/`
files, inject the city display name from config, consolidate user copy into
per-surface catalogs, and record prompt versions in tool/turn results.

**Slice 4 — trace boundary.** Implement the minimal correlated event/trace
seam already described by ADR-010 so failures are diagnosable.

Slices 1–2 are the substantive ones; 3–4 improve reviewability and debugging.
