# Audit Remediation Plan

Date: 2026-09-18
Source: `COMMITTEE_REVIEW.md` (seven independent reviewers: backend, security, voice/UX, voice-agent practitioner, architect, assignment-compliance, data-model).
Revision at audit: `22de73f` (main, CI green).

## Guiding principle

Fix in impact order, not convenience order. Each package is one coherent slice: behavior + regression test + SPEC/docs update in the same commit, per AGENTS.md. Decisions that are Dror's (product/safety/authorization) are called out and never silently picked.

---

## Decisions needed from Dror (blocking)

| # | Decision | Options | Blocks |
|---|---|---|---|
| D1 | **Voice confirmation model.** Today a spoken "yes" reaches `runConfirmation` and files a real ticket, while the prompt/spec claim "on-screen confirmation is required" — a false safety claim. | (a) Spoken confirmation is sufficient (voice-first phone metaphor); fix prompt+spec to say so, and add panel rendering of voice-confirmed outcomes. (b) Require an on-screen tap for voice too (return `needs_confirmation`). | Package 2 |
| D2 | **Evidence strategy for V0 + R3.** V0 has zero recorded audio; R3's DRO-5 readback is prose-only. | (a) Produce real evidence now (record a ~2-min voice run per VOICE_CHECKLIST; commit a redacted Linear receipt). (b) Downgrade the claims to "not yet evidenced" and mark the gates open. | Package 1 |
| D3 | **Retention window for caller speech.** `observations.observed_text` (caller words) is persisted unbounded. | Pick a horizon (e.g. 7/30 days) + purge mechanism, or explicitly "retain for demo, no bound" with that stated. | Package 5 |
| D4 | **Deployment scope.** Sessions/active-draft/quota are in-process; serverless multi-instance breaks them. | (a) Persist session state in Postgres (full D2). (b) Scope to single-instance + document; defer D2. | Package 6 |

---

## Package 1 — Evidence honesty (grading integrity)

**Why:** the compliance audit found the evidence ledger overstates delivery in the two hardest gates and contradicts itself. This is the highest-risk item for grading.

- Fix `EVIDENCE.md:7`: V0 "Passed informally" → per D2 (a) or (b).
- R3 DRO-5: commit a redacted receipt under `eval/results/` or relabel "owner-reported, not repo-verifiable" in SPEC.md:35,67, README.md:5, EVIDENCE.md:10.
- Resolve DEVELOPMENT_PLAN.md:10 and §9:285 ("no live ticket verified" vs "DRO-5 passed"); bump `last_updated`.
- Refresh stale counts: 190 tests (EVIDENCE.md:13, SPEC.md:38, WRITEUP.md:18).
- Surface the 18/22 (82%) reasoning eval + its 3 failures (SPEC.md:38, WRITEUP.md:18).
- Regenerate `conversations-latest.md` (or tag focused runs so they don't overwrite "latest").
- Credit recent commits (`d9f6ec6`, `81b2dfe`, `22de73f`) in all status docs.
- Verify: `npm run test:db` = 190; `git log`; cross-doc grep for stale numbers.

---

## Package 2 — Safety & honesty (voice path)

**Why:** a false safety claim + a concealment instruction + no critical-field confirmation. Caller-visible and trust-critical.

- **Confirmation gate** (per D1): align `reasoning-turn.ts:51`, `spec-design-voice.md:67`, `SPEC.md:108` with the chosen model. If spoken confirmation is allowed, add a `handleVoiceResult` branch in `DemoApp.tsx:24-38` so `simulated_route`/`linear_ticket_created` render in `ReportPanel`.
- **Remove the concealment instruction** `VoicePanel.tsx:66` ("Do not mention being an AI, a demo, or a simulation"); keep the ring tone, have the persona acknowledge the demo.
- **Critical-field confirmation:** before `confirmReport`, mandate a spoken re-read of exact location/description with a distinct "is that correct?"; spell reference IDs digit-by-digit.
- **Move the emergency/urgency redirect** into `live-session.ts:18-28` (the live model hears the caller first), not only `reasoning-turn.ts:50`.
- **Protect verbatim facts:** live-prompt rule to read IDs/numbers character-by-character; keep on-screen display (already in `ReportPanel.tsx:103`).
- Verify: extend `tests/web/voice-panel.test.ts` + `tests/server/local-delegation.test.ts` (voice-confirm outcome rendering, critical-field re-read); re-run `VOICE_CHECKLIST`.

---

## Package 3 — Correctness of external effects (durable state)

**Why:** a crash between `start` and `finish` leaves an operation stuck in `attempting` (duplicate-ticket risk); the CHECK is weaker than the contract.

- **Reconcilable `attempting`:** add `started_at` column; on a stale `attempting`, do a bounded `readTicket` to converge to `created`/`uncertain` before creating again; handle `attempting` in `describeExistingTicket` and `finish`'s WHERE guard.
- **Tighten the CHECK:** restore `provider_issue_key is not null` on `created` (migration `20260917180000_...sql:17-19`) with a backfill (`coalesce(provider_issue_key, provider_issue_id)`) so legacy rows pass.
- **Restart-recoverable confirm:** load `runConfirmation` from `request.body.draftId` (scoped by context) instead of the in-memory pointer.
- **Dedupe concurrent confirms:** a losing double-submit should return the eventual `created` receipt, not transient `uncertain`.
- Verify: migration applies on legacy + fresh DB (`supabase migration up --local`); new `tests/adapters/postgres/ticket-operation-store.test.ts` + `tests/server/confirmed-ticket.test.ts` cases.

---

## Package 4 — Voice robustness (caller experience)

**Why:** turn-taking misfires and latency stalls a real caller.

- **Turn-taking:** parameterize/lengthen the 500 ms quiet period; fall back to the last fragment by `end_ms` (not `startMs`) so final transcripts aren't dropped.
- **Cancellation + progress:** abort in-flight delegation on a new turn; show a "checking…" state during the server round-trip.
- **Transport:** watch `connectionState === "disconnected"` (transient blips), not only `"failed"` (`live-voice.ts:121-125`).
- Verify: `tests/web/live-voice.test.ts` for offset/quiet-period fallback and disconnect handling.

---

## Package 5 — Security hardening

**Why:** low-probability but real gaps (SSRF, unbounded retention, RLS).

- **Fetcher:** allowlist nested sitemap hosts (`website.ts:231-240`); add `AbortSignal.timeout()` + size caps to `fetchDocument`/`events.ts`.
- **Retention** (per D3): TTL/purge for `observed_text` + drafts/operations, or documented no-bound decision.
- **RLS:** `enable row level security` with an `app_runtime` per-row policy (defense-in-depth).
- **Instruction surface:** route the transfer-persona instruction server-side instead of browser `sendInstruction` (`live-voice.ts:250-264`).
- **Redact public identifiers:** replace `hamaarag` + Linear project UUID + issue keys in README/EVIDENCE.
- Verify: `tests/adapters/city-website.test.ts` for nested-host rejection + timeout.

---

## Package 6 — Deployment blockers (before any D2 claim)

**Why:** in-process session state silently breaks serverless.

- **Session persistence** (per D4): persist active-draft pointer + quota in Postgres, or scope to single-instance + document.
- **Pool hardening** (`main.ts:32-38`): `statement_timeout`, `lock_timeout`, `connectionTimeoutMillis`, `idleTimeoutMillis`, `application_name`.
- **Indexes:** `observations(conversation_id)`, `request_drafts(conversation_id)`, `ticket_operations(conversation_id)`.
- **FK:** `conversations.city_id → city_policies(city_id)` (or validate in `openConversation`).
- Verify: `npm run test:db`; fresh local Supabase `reset` + migration run.

---

## Package 7 — Code quality & architecture (debt cleanup)

**Why:** the architect + naming pass found structural debt that hurts a reader (the stated audience).

- **Own `TicketProvider` in core** (`ticket-operation.ts`), drop the `Pick<LinearTicketProvider,…>` in `confirmed-ticket.ts:17`.
- **Split `build-app.ts` (694 lines):** extract delegation-turn orchestration (`executeDelegatedTool`, `isSpokenSpan`, `withReportLock`) into `server/workflow/delegation-turn.ts`.
- **Message catalog:** consolidate spoken copy (`build-app.ts`, `VoicePanel.tsx:30-51`, `knowledge-tools.ts`) into a typed catalog mirroring `messages.ts`.
- **Single-source:** `SupportedReportType`/`SUPPORTED_REPORT_TYPES` from core into `city-policy-store.ts:22,25`; hoist `isRecord`/`nonEmpty`/`isHttpsUrl`/`LOCAL_ORIGINS`.
- **Delete dead code** (6 lint warnings): `fetchCityName`/`cityName`/`useEffect` in `DemoApp.tsx`, `AgentSourceCard` import, `delegationId` param.
- **Naming:** consolidate three "confirm" module names; unify `identifier`/`providerIssueKey`/`issueKey`; fix `spec-architecture-system.md` layout drift (`prompts/`/`knowledge/` don't exist, dup `service-report/` line).
- Verify: `npm run lint` = 0 warnings; `npm run check:architecture`; `npm run check`.

---

## Package 8 — Evaluation & accessibility + doc sync

**Why:** the eval loop can't substantiate V0, and there's doc/A11Y drift.

- **Voice-channel eval:** recorded-audio artifacts, latency budget, ASR-error injection, barge-in/correction probes.
- **A11y:** raise focus-outline contrast (≈1.9:1 → ≥3:1), humanize `role="status"` announcements.
- **Docs:** `design/README.md:3` ("no interface implemented" → implemented), 11-vs-12 scenario count, `WRITEUP.md` "(draft)", render city name.
- Verify: `npm run check`; manual browser + screen-reader pass.

---

## Suggested execution order

1. **Package 1** (evidence honesty) — pure docs, immediate, grading-critical.
2. **Package 2** (safety/honesty) — needs D1 decision.
3. **Package 3** (correctness) — independent of D1/D2.
4. **Package 4** (voice robustness) — small, high caller impact.
5. **Package 5 + 6** (security + deployment) — needs D3/D4.
6. **Package 7 + 8** (quality/eval) — as time allows.

Packages 1, 3, 4, 7 are independently shippable now (no decision gate). Packages 2, 5, 6 are gated on D1/D3/D4. Package 8 is partially gated on a mic for recorded audio.
