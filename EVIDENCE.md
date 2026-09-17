# Evidence ledger

Recording date, revision, commands/evidence, and result per gate. Local tests do not establish deployment or live audio; no gate passes merely by appearing here. Revisions refer to the `feat/core-policy` branch.

| Gate | Date (UTC) | Revision | Evidence / commands | Result |
| --- | --- | --- | --- | --- |
| V0 voice agent | 2026-09-16 | 99afa87 | `npm run dev`, browser **Start voice**, spoken exchange by Dror on the local machine; WebRTC/GPT-Live session and delegation wired and fake-tested | Passed informally (Dror: "worked really well"); formal recorded/interruption evidence pending |
| R1 code + website answers | 2026-09-16 | b96f2af | `npm run test:db` (BRC 8-3-9 and pothole-guidance cases); browser buttons; `npm run eval:intents` municipal-code and city-service cases | Passed in text/tools; spoken answers pending |
| R2 current events | 2026-09-16 | b96f2af | Live provider against `https://bouldercolorado.gov/events`: 19 occurrences parsed, 24-hour cache, fails closed; adapter tests `tests/adapters/boulder-events.test.ts` | Passed live fetch + tests; voice pending |
| R3 real Linear ticket | 2026-09-16 | 99afa87 | Closed-hours confirm flow created DRO-5; independent Linear API readback matched ID/title/description/team/project; `app.ticket_operations` state `created` | Passed; spoken trigger pending |
| R4 two department routes | 2026-09-16 | 0c7e857 | `npm run test:db` distinct mock destinations (Transportation `+13035550101`, Parks `+13035550102`) | Passed local DB/API; spoken pending |
| R5 deterministic hours | 2026-09-16 | 0c7e857 | Boundary/timezone/closure tests with fixed clocks; live closed-hours DRO-5 run | Passed; spoken open/closed comparison pending |
| R6 evaluation setup | 2026-09-17 | e1c5bdb | `npm run check` (123+43), `npm run test:db` (166/166), `npm run audit:dependencies` (0 advisories), `npm run eval:conversations` (11/11), GitHub Actions CI on `main` | Passed locally and in remote CI |
| D1 repository | 2026-09-17 | e1c5bdb | Incremental commits, setup instructions, public repository `https://github.com/drore/threefold-boulder-voice-agent` | Reviewer access available; CI green |
| D2 reviewer link | — | — | No deployment | Open (G3 approvals + hosting required) |
| D3 one-page writeup | — | 12d14b5 | `WRITEUP.md` draft with cuts, decisions, diagram, limitations, next steps | Draft exists; final page-length check and proof pending |

## Evaluation configuration

- Runtime: Node 24.21.0, npm 11.19.0 (`fnm use 24.21.0`), local Supabase Postgres, `.env.local` loopback DB.
- Intent eval: `gpt-5.6-luna`, Structured Outputs, synthetic cases in `eval/intent-cases.json`, development OpenAI key, 2026-09-16.
- Live Linear: dedicated demo project in Dror's workspace, team `Drore`, synthetic closed-hours report DRO-5.
- Live events: official Boulder calendar listing, 24-hour TTL, fail-closed on expiry + fetch failure.

## Remaining before submission

- Formal recorded spoken browser journey (mic/playback, interruption/correction, target browsers) — checklist in `VOICE_CHECKLIST.md`; run later by Dror.
- Deployment (D2) — deferred by Dror on 2026-09-16; the public reviewer repository (D1) is published.
- Final writeup page-length check and debugging rehearsal (T70/T73) — planned.
