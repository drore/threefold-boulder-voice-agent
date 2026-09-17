---
title: Browser voice, reasoning delegation, and conversation updates
version: 1.0-review
date_created: 2026-09-15
last_updated: 2026-09-16
owner: Dror Elovits
tags: [design, voice, reasoning]
---

# Voice and reasoning

## 1. Purpose and scope

P0 browser voice uses GPT-Live with client delegation, independent reasoning/tool contracts, honest task updates, and session lifecycle. The local WebRTC/session/delegation path is implemented and fake-tested; Dror personally exercised the spoken browser path on September 16, 2026 and reported it working well, while formal recorded microphone/interruption evidence remains pending. P1 adds tone/representative UI; P2 telephony.

Voice is one channel adapter into the shared server conversation workflow. The same agent-tool boundary and Application Core also support a later text-chat adapter; text does not require GPT-Live or voice delegation. The system architecture owns this channel-neutral boundary, while this document owns voice-specific media/events/playback behavior.

## 2. Definitions

**Delegation:** Live asks a reasoning backend for help. **Sideband:** server control connection attached to the same voice session while primary WebRTC carries audio. **Transcript fragment:** partial speech observation, not a completed caller turn. **Playback observation:** evidence audio was delivered/played, distinct from text generation.

## 3. Requirements, constraints, and guidelines

- VOC-001: Trusted server creates session; browser uses negotiated microphone/speaker media and public UI events, never secret credentials.
- VOC-002: Short Live prompt defines Boulder/demo role, tone, scope, clarification, delegation, interruption, and truthful result delivery. Detailed procedures/tool schemas stay in reasoning/backend.
- VOC-003: Delegate municipal factual answers, service reports, and corrections changing work. Clarify brief ambiguity without unsupported backend claims.
- VOC-004: Reasoning can extract fields/propose actions; core alone authorizes/executes. No model-created permissions/confirmation booleans.
- VOC-005: Keep enough transient scoped history to interpret yes/corrections; preserve timing/provenance and avoid treating fragments/background speech as final decisions.
- VOC-006: Application provides current task status, department guidance, evidence/result facts; no false completion while waiting/retrying.
- VOC-007: “Stop speaking” is different from request cancellation. Corrections invalidate draft state through the core; committed work is not silently rolled back.
- VOC-008: Enforce session/delegation/model budgets in code. Release microphone/media/connections on close or failure and persist incomplete finalization honestly.
- VOC-009: Client and managed delegation have different context/control capabilities; do not silently swap modes. Neither guarantees verified speech.

## 4. Interfaces and data contracts

VoiceSession capability metadata: fullDuplex, transcriptEvents, serverControl, speakableUpdates, observedPlayback, exactSpeech. A capability is not proof of task success. Browser contract: session start/status/close; microphone permission/retry; source/action cards; accessible text equivalent.

The selected [simple responsive concept](../design/README.md) uses one task screen and one state model. Its persistent surface contains the independent-demo qualification, conversation, voice state, and controls. Inline sources accompany supported answers. An actionable draft adds a compact current-request panel containing the collected context, location, department, deterministic hours decision, and revision-bound confirmation controls. After execution, that panel shows only the backend-verified ticket receipt/link or explicitly simulated route outcome. It stacks at narrow widths instead of becoming a separate mobile experience.

The synthetic concept does not establish live hours, actual receipts, accessibility, responsive behavior, or exact spoken output. Preserve permission, clarification, progress, result, failure/uncertainty, and disconnect branches even though they have no separate raster. UI controls consume validated server state and current-revision authorization; displayed copy never decides workflow. Exact wording remains subject to message ownership and review.

Normalized server events: voice_started, input_observed (observation ID/text/timing/completeness), output_observed, delegation_requested (opaque provider ref/timing), voice_failed, voice_closed, usage_observed. Map actual provider schemas in adapter; keep SDK details out of core.

`publishConversationUpdate(ctx, {kind: guidance|context|progress|result, operationId?, revision?, facts, speechGuidance?})` translates to provider commands. Examples:

- Submitting (only after operation starts): “I’m submitting your report.”
- Uncertain: receipt not confirmed; do not say failed or created without evidence.
- Mock transfer pending: explicitly simulated destination; never real municipal staff.
- Completed: verified outcome/reference, including demo qualification.

Selected client delegation: server owns transient transcripts/current task snapshots, calls ReasoningBackend, validates results, and returns concise verified facts to Live. Per the delegation guide, commentary appends are paraphrased by the live model, not read verbatim, so the contract is faithful speech (no added, dropped, or changed facts, IDs, dates, limitations, or outcomes) rather than literal text. Behavior changes such as the simulated-transfer department persona use session.instructions.append; each append stays within the guide's 500-token limit and long answers are split on sentence boundaries. The delegation event contains metadata rather than task text; adapter must reconstruct appropriate task context from observations/state and handle corrections while work runs. Discard stale result communication but retain committed operation evidence.

The voice model requests a supported task; the server assembles observed caller details and current state for the reasoning backend. It does not receive `isWithinBusinessHours`, `decideBusinessHoursAction`, `TicketProvider`, or `TransferProvider` as callable tools. The coordinator maps validated reasoning proposals to the core's `updateDraft`, `requestConfirmation`, and `recordConfirmation` use cases. Only after the server verifies confirmation of the current draft revision may the coordinator call `executeRequest`. The core chooses the action from validated database configuration and trusted time, then returns a verified outcome for the coordinator to communicate through Live.

The reasoning backend runs one bounded tool-calling turn per delegated utterance (`gpt-5.6-luna` via the Responses API). The model chooses from the four application capabilities in the [tool boundary](../src/server/reasoning/agent-tools.ts); the server executes each call through validated, server-owned handlers and returns exact evidence; the model then composes a short grounded reply. Reviewed code and service examples and both service-report drafts have handlers, and capability questions ("what can you do") are answered conversationally from the tool list. The model cannot select a destination, confirm a draft, or create a ticket; only a confirmed revision reaches the effect path. Live tool selection passed on 2026-09-16, but no formal spoken delegated result has yet been recorded.

| Agent tool | Model-supplied input | Application responsibility |
| --- | --- | --- |
| `lookupMunicipalCode` | Bounded question | Retrieve reviewed actual code text and qualifications through `retrieveEvidence`. |
| `lookupCityInformation` | Bounded question | Retrieve reviewed city service/department website facts through `retrieveEvidence`. |
| `findCityEvents` | Bounded question, optional ISO local-date range | Fetch the official calendar through a daily-cached live provider, filter upcoming occurrences by the trusted server date and the requested range, and answer with bounded dated entries and official links. |
| `prepareServiceReport` | Supported report type and candidate location/description | Validate untrusted details and update a draft; return needed fields or confirmation state, never submit a ticket or route directly. |

Conversation/city scope, trusted time, observations, source allowlists, department mappings, and provider settings are supplied by the server. The model cannot pass URLs, source IDs, Linear destinations, permissions, confirmation booleans, or a business-hours outcome. Only the confirmed core `executeRequest` flow may cause a ticket or simulated route. Tool definitions are backend-owned in client delegation; GPT-Live delegates the conversation task rather than executing these application tools itself. The [knowledge spec](spec-data-knowledge.md) owns code/site evidence and event data rules.

For client delegation, the browser correlates `session.delegation.created` with recent timed transcript fragments, and the server runs the bounded reasoning/tool workflow. The browser sends verified speakable results with `session.commentary.append` and the matching delegation ID. The current transcript assembly waits for a short quiet period and asks the caller to repeat if it has no usable text; because fragments have no completion event, actual delayed-fragment behavior needs empirical evaluation. A delegation captures the active report generation when the event arrives; a reset during queuing, transcript assembly, or backend work discards its stale result. Report writes and reset are serialized in the local session so a late write cannot restore an old active report. On-screen confirmation remains required before the app sends a verified route/ticket result back under the matching draft's delegation ID. An append acknowledgment is not proof of playback. M1 validates actual event ordering and correction behavior. Responses delegation remains an alternative only if client delegation proves unworkable.

Live prompt skeleton (specification guidance, not exact mandated speech):

```text
You are a calm Boulder municipal demo assistant.
Backchannel policy: moderate, natural acknowledgments.
Interruption policy: stop speaking and listen to interruptions.
Delegation policy:
Backend tools: supported city evidence and nonurgent maintenance reports.
Delegate when facts require evidence, a caller requests staff action,
or a correction changes requested work.
Clarify brief ambiguity before delegating; never guess a result.
Speak only verified action status and explain simulated transfers honestly.
Redirect unrelated requests briefly to the supported municipal purpose.
```

Required capture rules are enforced through workflow contracts, not just this prompt. Department procedure data from CityConfigStore and trusted application-authored guidance are separate from untrusted caller text. Never inject caller content as a developer instruction.

## 5. Acceptance criteria

- AC-001: Given microphone consent and allowed session, caller speaks and hears a relevant reply with matching source/action UI.
- AC-002: Given missing pothole location, agent clarifies; after confirmation, exact current location reaches workflow/receipt.
- AC-003: Given meaningful correction during work, agent yields; correction winning before atomic authorization prevents old-revision execution. If authorization won first, retain that revision and report committed/uncertain results honestly.
- AC-004: Given tool uncertainty/failure, agent does not speak success.
- AC-005: Given denied mic, connection loss, or close, resources release and recoverable state is accurate.
- AC-006: Given a delegated code, service-guidance, or event question, the corresponding tool returns only approved scoped evidence or an explicit limitation; a model-supplied URL or stale/unsupported claim cannot become a sourced answer.
- AC-007: Given an unknown tool, invalid argument shape/report type, or model-supplied confirmation/destination, the tool boundary rejects the call without invoking a handler. Valid stubs return unavailable until their use cases are implemented. The event use case validates calendar dates and allowed ranges before returning event data; live-fetch failures return an explicit limited-coverage outcome rather than stale or invented events.
- AC-008: Given a "what can you do" or "what can I ask" utterance, the reasoning model answers conversationally from the tool list without calling a tool, and describes coverage only as the tools describe it; it never claims topics or sources beyond the reviewed examples.

## 6. Test automation strategy

Planned `npm run test:contracts` checks normalized adapter events with fixtures; `npm run eval:text` tests backend independently; `npm run eval:voice` exercises actual spoken interactions and audio-specific behavior. `npm run test:e2e` covers UI/session API with controlled voice substitute. Desktop/mobile microphone/playback needs empirical device/browser checks; text passing is not voice passing.

## 7. Rationale and context

Separation keeps voice replaceable and workflow deterministic. Client control costs context/correction integration effort; managed delegation costs less initial orchestration but offers different result control. Scope instructions/guardrails cannot guarantee every spoken word. Strict pre-playback validation adds buffering/latency and is outside P0.

## 8. Dependencies and integrations

GPT-Live browser WebRTC, server-held OpenAI key, `gpt-5.6-luna` tool-calling reasoning, core, reviewed evidence, authorized UI events. Live tool selection passed; browser media remains unverified. No telephony provider, LiveKit, Pipecat, or agent framework selected.

## 9. Examples and edge cases

“Pine and 15th” misheard -> confirm. “Yes” after a different question -> clarify. Backend complete does not prove audio played. Muted microphone does not stop model output. A server command acknowledgment does not prove caller heard requested wording. Mandatory exact wording requires controlled audio/TTS later.

## 10. Validation criteria

M1: startup, actual input/output, one backend call, ambiguity, interruption/correction, close, and server connection hosting. Record access/model/browser/version and limitations. M5/M6 exercise A9/A19/A25 and fresh deployed reviewer session. Model access and paid synthetic reasoning turns passed on September 16, 2026, and Dror personally used the live spoken browser path the same day with a positive report; formal recorded voice evidence and hosted browser verification remain pending.

## 11. Related specifications

[Architecture](spec-architecture-system.md), [workflow](spec-process-workflow.md), [security](spec-process-security-observability.md), [evaluation](spec-process-evaluation.md).

Official references: [Live prompting](https://developers.openai.com/api/docs/guides/live-prompting), [delegation](https://developers.openai.com/api/docs/guides/live-delegation), [browser WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live), [server controls](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live).
