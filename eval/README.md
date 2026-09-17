# Reasoning evaluation and model comparison

`npm run eval:reasoning` is an opt-in, paid check of tool selection in the tool-calling reasoning turn. It reads the versioned cases from [reasoning-cases.json](reasoning-cases.json), runs one reasoning turn per case per model per repeat with stub tool handlers, and checks that the expected tool was chosen (`null` expects a conversational reply with no tool call).

Put `OPENAI_API_KEY` in ignored `.env.dev` first. The ordinary `npm run check` suite makes no paid model calls.

## Comparing models

```sh
npm run eval:reasoning -- --models=gpt-5.6-luna,candidate-2 --repeats=3
```

- `--models` is a comma-separated list (default `gpt-5.6-luna`). The same is available in the app via the `REASONING_MODEL` environment variable, so the chosen model can also be run live.
- `--repeats` runs each case N times, since tool selection is stochastic.
- Results print as a per-model pass rate with average latency and a line per failure, and a JSON record is written under `eval/results/` (git-ignored) with the cases hash, models, repeats, and per-run results.

## Last recorded run

On 2026-09-17 at about 06:14 UTC, `gpt-5.6-luna` with 2 repeats scored **18/22 (82%)**, average 2316 ms per turn. Cases hash `b82c6f3594705f59887b2f4728862fa7b697cb36212ece2ad4258761deb41754`.

Failures, all tool selection (not application correctness):
- `specific-event-follow-up` ("tell me about the landmarks design review committee") failed both runs: the model did not call `findCityEvents`. The reasoning turn currently receives only the current utterance and the active-draft hint, so a follow-up that refers to an event the assistant just listed has no context. Passing recent conversation context is the identified fix.
- `rules-i-know` failed one of two runs by calling `lookupMunicipalCode` instead of answering conversationally.
- `existing-report-location` ("at 15th and Pine" with an active draft) failed one of two runs by calling no tool; the active-draft hint is not decisive.

These findings are the reason this evaluation exists. Tool selection is one axis; it does not establish factual answer quality, grounding, latency under load, or cost. The server executes every call through validated, server-owned handlers, so a wrong choice is bounded by scope and authorization rather than dangerous.

Before delivery, exercise actual microphone input/output and check the cited answer content and source freshness in a fresh browser session.


## Automated conversation loop

`npm run eval:conversations` runs the improvement loop end to end against a
**locally running server** (and `OPENAI_API_KEY` in `.env.dev`):

1. A simulated caller (LLM) pursues a versioned goal from
   [conversation-scenarios.json](conversation-scenarios.json) over the text
   delegation path — the same reasoning turn, tools, and session as voice.
2. The runner checks deterministic expectations (draft fields, chosen tool,
   route/ticket branch, spoken phrases). It never confirms while the scenario
   clock is closed, so the loop cannot create an external ticket.
3. A critic scores the transcript against [conversation-rubric.md](conversation-rubric.md)
   and reports quotable issues with a likely `fixTarget`.
4. `eval/results/conversations-latest.md` is the coder-facing report; the full
   JSON record lands beside it.

Iterate: run → fix the reported targets → re-run (`--scenarios=id1,id2` to focus)
→ compare assertions and scores.

First full run (2026-09-17, `gpt-5.6-luna`): 7/10 scenarios passed. Findings and
fixes: event questions failed because the model sent empty strings for optional
tool arguments and the boundary rejected them (fixed in `areValidArguments`);
the free-text event guard was narrowed so relative phrasing ("this week") is
answered from the trusted window; report flows no longer demand dates. After the
fixes, `events-question` and `specific-event-follow-up` pass 2/2.
