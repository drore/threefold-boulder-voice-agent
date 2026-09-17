# Voice failure case 001 — GPT-Live paraphrasing and capability invention

Status: observed 2026-09-16, fix applied same day (prompt + answer-length). Re-test spoken before submission.

## Observed conversation (excerpt)

```
Caller:  I would like to hear about some of the events in the city
Assistant: Sure, lemme get the options for City of Boulder events. Here are a few coming up soon: the Landmarks Design Review Committee meeting, the Beverage Licensing Authority Hearing, and [cut off]
Caller:  Anything fitting for children
Assistant: Okay. I'll narrow it down to family stuff. Could you say a bit more about what you want...
Caller:  I just told you
Assistant: Sorry, I heard you say you'd like events that are good for children. This demo only covers basic City of Boulder services.
Caller:  Yes
Assistant: I can help if you wanna report something like a pothole or streetlight issue...
Caller:  What services does the city provide
Assistant: Lemme try to get a list of city services. I don't have a current, vetted answer for that here...
```

## Rubric (what should have happened)

| Defect | Expected behavior |
| --- | --- |
| Paraphrased and truncated the backend events answer ("Here are a few... and [cut]") instead of speaking the returned text | Speak the backend result faithfully: no added, dropped, or changed fact, ID, date, limitation, or outcome |
| Invented a family/children filter ("I'll narrow it down to family stuff") that does not exist | Never state a capability the demo lacks; limited-coverage only |
| Invented "streetlight issue" as a report option | Only the two supported report types exist (pothole, park maintenance) |
| Announced "Lemme try to get a list of city services" before the backend answered | Say only a short "One moment." and then the backend's exact text |
| Treated a cough/sneeze as a caller turn and delegated it | Ignore non-speech noise |
| Greeted with "Hey! What's up?" | Open with the fixed options overview |

## Fix

- `src/server/voice/live-session.ts` `LIVE_INSTRUCTIONS` rewritten: fixed greeting listing options, delegate-then-speak-exactly, no capability invention, short "One moment." acknowledgment, ignore noise, no premature success claims.
- `src/server/reasoning/knowledge-tools.ts` events answer capped to 3 occurrences so the returned list is short enough to speak verbatim.

## Re-test

Re-run `VOICE_CHECKLIST.md` items 1, 4, 5 and a capability-invention probe ("can you tell me about family events?") and confirm: verbatim answers, no invented capabilities, no truncation, noise ignored. Record browser/model and result here before submission.
