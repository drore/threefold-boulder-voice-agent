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

P0 browser voice via planned GPT-Live, independent reasoning/tool contracts, honest task updates, and session lifecycle. Exact model/access/delegation must pass Q1/M1. P1 adds tone/representative UI; P2 telephony.

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

Client delegation recommendation: server owns transient transcripts/current task snapshots, calls ReasoningBackend, validates results, returns concise verified facts to Live. A delegation event may contain only metadata; adapter must reconstruct appropriate task context from observations/state and handle corrections while work runs. Discard stale result communication but retain committed operation evidence.

Managed Responses alternative: hosted context/reasoning loop proposes custom functions; backend validates each function, supplies results, and controls continuation. Update supported backend prompt/tool settings by phase. It remains valid if independent reasoning/evidence/operation contracts can be tested. Q1 selects the planned mode; M1 confirms actual behavior.

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

## 6. Test automation strategy

Planned `npm run test:contracts` checks normalized adapter events with fixtures; `npm run eval:text` tests backend independently; `npm run eval:voice` exercises actual spoken interactions and audio-specific behavior. `npm run test:e2e` covers UI/session API with controlled voice substitute. Desktop/mobile microphone/playback needs empirical device/browser checks; text passing is not voice passing.

## 7. Rationale and context

Separation keeps voice replaceable and workflow deterministic. Client control costs context/correction integration effort; managed delegation costs less initial orchestration but offers different result control. Scope instructions/guardrails cannot guarantee every spoken word. Strict pre-playback validation adds buffering/latency and is outside P0.

## 8. Dependencies and integrations

GPT-Live planned, WebRTC browser media, server-side control capability, ReasoningBackend, core, evidence, authorized UI events. Pin exact libraries/models after access tests. No telephony provider, LiveKit, Pipecat, or agent framework selected.

## 9. Examples and edge cases

“Pine and 15th” misheard -> confirm. “Yes” after a different question -> clarify. Backend complete does not prove audio played. Muted microphone does not stop model output. A server command acknowledgment does not prove caller heard requested wording. Mandatory exact wording requires controlled audio/TTS later.

## 10. Validation criteria

M1: startup, actual input/output, one backend call, ambiguity, interruption/correction, close, and server connection hosting. Record access/model/browser/version and limitations. M5/M6 exercise A9/A19/A25 and fresh deployed reviewer session. No paid calls/audio tests executed yet.

## 11. Related specifications

[Architecture](spec-architecture-system.md), [workflow](spec-process-workflow.md), [security](spec-process-security-observability.md), [evaluation](spec-process-evaluation.md).

Official references: [Live prompting](https://developers.openai.com/api/docs/guides/live-prompting), [delegation](https://developers.openai.com/api/docs/guides/live-delegation), [browser WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live), [server controls](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live).
