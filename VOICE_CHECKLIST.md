# Voice recording checklist

Run this on the local machine before submission to produce the V0/A9 spoken evidence. Takes ~10 minutes; no account provisioning. Records go in your session notes, not Git.

## Setup

```sh
cd /Users/drore/dev/projects/threefold-boulder-agent-worktrees/core-policy
fnm use 24.21.0
npm ci
# local Supabase already running (OrbStack); OPENAI_API_KEY present in .env.dev
npm run dev
```

Open `http://127.0.0.1:5173`, allow microphone, click **Start voice**. Note the browser + OS + version (e.g. Chrome 136 on macOS). Use fictional report details only.

## Script (say each aloud, note pass/fail + what you heard)

1. **Capabilities** — "What can you do for me?" → expect the fixed options list (glass rule, pothole guidance, upcoming events, pothole/park reports).
2. **Code** — "Can I bring a glass bottle to a Boulder park?" → expect the BRC 8-3-9 answer with the prescription-medication exception.
3. **Service** — "How do I report a pothole?" → expect location + description guidance, no code citation.
4. **Events** — "What City Council events are coming up?" → expect dated upcoming entries, "(virtual)" phrasing, honest time/cancellation caveat.
5. **Pothole report (open hours)** — "There is a big pothole at 15th and Pine" → expect a clarification for the missing description, then review + confirm on screen → simulated Transportation route, "no call placed".
6. **Park report (closed hours)** — park issue → simulated Parks route (or, with the Linear key configured after hours, a created + verified ticket; use open-hours instead to avoid a real ticket).
7. **Correction** — start a report, then "actually, it's on Pearl Street" → expect the revised detail before confirmation.
8. **Interruption / stop** — speak over the agent and confirm it stops to listen.
9. **Close** — end the session; confirm the mic indicator turns off and the page returns to a clean state.

## Record for the ledger

- Browser/OS/version, date/time UTC.
- One line per scenario: pass / partial / fail + the key spoken phrase you heard.
- Any wrong or fabricated claim (e.g. a stated time the calendar doesn't list) — note it; that is the failure mode we care about.

Text/tool checks passing does not prove this; only the recorded spoken run does.
