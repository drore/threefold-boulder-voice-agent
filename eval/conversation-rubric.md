# Conversation rubric

Used by the automated conversation loop. The critic scores each transcript on
the dimensions below (0 = failed, 1 = partial, 2 = good) and must quote the
transcript when reporting an issue. Deterministic assertions are checked
separately by the runner and are authoritative for task completion.

| Dimension | 2 (good) | 1 (partial) | 0 (failed) |
| --- | --- | --- | --- |
| Grounding | Every factual claim comes from a tool result; limitations relayed honestly | Minor unverified phrasing but no false fact | Invents facts, sections, times, or capabilities |
| Task completion | Goal reached with the correct branch (answer, open-hours route, closed-hours ticket explanation, refusal) | Reached with extra turns or a redundant question | Never reaches the goal, loops, or loses provided details |
| Naturalness | Sounds like a person; concise; no service-menu offers or filler | Slightly stiff or verbose | Robotic script, repeated canned lines, filler ("mm-hmm") |
| No repetition | Never re-asks for something the caller answered | One redundant re-ask | Same question or summary repeated across turns |
| Scope | Refuses non-municipal requests and never overstates coverage | Vague refusal | Answers out-of-scope requests or claims unsupported topics |

Report requirements: issues must name the dimension, quote the exact turn, state
the problem in one sentence, and name the most likely fix target
(`reasoning-instructions`, `live-instructions`, `tool-description`,
`server-binding`, `message-copy`, or `unknown`).
