# Evidence ledger

Recording date, revision, commands/evidence, and result per gate. Local tests do not establish deployment or live audio; no gate passes merely by appearing here. Revisions refer to `main`.

| Gate | Date (UTC) | Revision | Evidence / commands | Result |
| --- | --- | --- | --- | --- |
| V0 voice agent | 2026-09-19 | main | Deployed reviewer link; browser **Start voice** (WebRTC/GPT-Live + server delegation); fake-based tests | Spoken path available for a fresh reviewer run via the link; no recorded sample in-repo |
| R1 code + website answers | 2026-09-16 | b96f2af | `npm run test:db` (BRC 8-3-9 and pothole-guidance cases); browser buttons; `npm run eval:reasoning` municipal-code and city-service cases | Passed in text/tools; spoken answers pending |
| R2 current events | 2026-09-16 | b96f2af | Live provider against `https://bouldercolorado.gov/events`: 19 occurrences parsed, 24-hour cache, fails closed; adapter tests `tests/adapters/city-events.test.ts` | Passed live fetch + tests; voice pending |
| R3 real Linear ticket | 2026-09-16 | 99afa87 | Owner-reported live result on 2026-09-16 (DRO-5): closed-hours confirm flow created an issue and an independent Linear API readback matched ID/title/description/team/project; not yet captured as a reproducible in-repo artifact | Owner-reported, not repo-verifiable; spoken trigger pending |
| R4 two department routes | 2026-09-16 | 0c7e857 | `npm run test:db` distinct mock destinations (Transportation `+13035550101`, Parks `+13035550102`) | Passed local DB/API; spoken pending |
| R5 deterministic hours | 2026-09-16 | 0c7e857 | Boundary/timezone/closure tests with fixed clocks; closed-hours DRO-5 create/readback owner-reported on 2026-09-16 | Passed local tests; spoken open/closed comparison pending |
| R6 evaluation setup | 2026-09-17 | 22de73f | `npm run check` (140), `npm run test:db` (195/195, 21 files), `npm run audit:dependencies` (0 advisories), `npm run eval:conversations` (11/11 scenarios), `npm run eval:reasoning` (18/22, 82%), GitHub Actions CI on `main` | Passed locally and in remote CI |
| D1 repository | 2026-09-17 | e1c5bdb | Incremental commits, setup instructions, public repository `https://github.com/drore/threefold-boulder-voice-agent` | Reviewer access available; CI green |
| D2 reviewer link | 2026-09-19 | main | Deployed reviewer runtime at `https://threefold-boulder-agent.onrender.com` (code-gated; free-tier cold start); verified health, static UI, sourced answers, and live events through the link | Deployed; fresh spoken review pending |
| D3 one-page writeup | 2026-09-19 | main | `WRITEUP.md` with cuts, decisions, diagram, limitations, and next steps | Passed (one page) |

## Evaluation configuration

- Runtime: Node 24.21.0, npm 11.19.0 (`fnm use 24.21.0`), local Supabase Postgres, `.env.local` loopback DB.
- Reasoning eval: `gpt-5.6-luna`, synthetic cases in `eval/reasoning-cases.json`, development OpenAI key.
- Live Linear: dedicated demo project in Dror's workspace, team `Drore`, synthetic closed-hours report DRO-5.
- Live events: official Boulder calendar listing, 24-hour TTL, fail-closed on expiry + fetch failure.

