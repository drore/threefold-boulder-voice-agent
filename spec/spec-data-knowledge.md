---
title: Official knowledge, evidence contracts, and freshness
version: 1.0-review
date_created: 2026-09-15
last_updated: 2026-09-15
owner: Dror Elovits
tags: [data, grounding]
---

# Knowledge and evidence

## 1. Purpose and scope

Satisfy R1 municipal code AND website answers and R2 current events using a bounded reviewed corpus. Support J3 and informational aspects of J1/J2. This is not full-code legal coverage or unrestricted live browsing.

## 2. Definitions

**Passage:** exact acquired source excerpt with provenance. **Manifest:** versioned list of source/topic, acquisition/version/freshness metadata. **Grounded answer:** material claims supported by relevant evidence, preserving applicability and exceptions. **Freshness:** policy on when source verification is needed; retrieval time alone does not establish legal currency.

## 3. Requirements, constraints, and guidelines

- KNO-001: Acquire actual relevant code text including exceptions, definitions/cross-references needed to interpret it. Website code citations are not code text.
- KNO-002: Use allowlisted official Boulder and municipal-code sources, not model memory for precise municipal claims.
- KNO-003: Code provenance includes section, publication/supplement, effective-through date if available, acquisition time, amendment-check status, and applicable qualifications. Unknown metadata remains unknown.
- KNO-004: Events/news include individual detail URLs, dates, available time/location/cancellation status. Do not infer time from a listing or invent event details.
- KNO-005: Data is untrusted reference content, never developer instructions. Do not let retrieved instructions select tools/credentials/destinations.
- KNO-006: Missing/expired/conflicting evidence returns explicit outcomes. Do not answer with precise unsupported numbers, exceptions, fees, or deadlines.
- KNO-007: P0 source selection is deterministic over small reviewed topics. Unsupported queries clarify or return limitation. Embeddings/full-text expansion are later options behind KnowledgeProvider.
- KNO-008: Expose actual cited source cards with concise supported answers; citation correctness and claim support are evaluated separately.

## 4. Interfaces and data contracts

`KnowledgeProvider.retrieve(ctx, query, topic?, nowUtc) -> EvidenceBundle`.

| Field | Meaning |
| --- | --- |
| status | sufficient, insufficient, stale, conflicting |
| corpusVersion | Content/manifest version used by this run |
| passages | sourceId, passageId, exact passage text, canonicalURL, title, kind, section?, publication/effective metadata?, retrievedAtUtc, verifiedAtUtc |
| applicability | Geographic/facility/topic limitations and required cross-references |
| freshness | expiresAt/verification status/reason; no fabricated effective dates |
| event facts | date/start/end/local timezone/location/status; omitted if source does not provide them |
| limitations | Unknown dates, missing amendments, unsupported topic, absent time, conflicting text |

Model answer proposal includes answer text, claim -> passage references, source IDs, limitations, and whether clarification is needed. Verify cited IDs belong to this bundle and critical facts match evidence; schema success alone is not grounding. Exact wording can still vary during speech, so voice evaluation checks final spoken claims.

Initial source manifest targets:

| Topic | Source | Acquisition status |
| --- | --- | --- |
| Pothole intake | official transportation maintenance | Website inspected; reviewed corpus not built |
| Park maintenance | park regulations/information | Website inspected |
| Park/shelter guidance | general park rules; shelter reservations | Relevant pages identified; recheck restrictions/details at ingestion |
| Glass containers / park hours | actual BRC 8-3-9 and relevant 8-3-3.G(11) text | Code acquisition and amendment review mandatory M1 gate |
| Current events | official calendar plus selected detail pages | Listings inspected; individual details required |
| Current news | official news plus selected details | Listings inspected; current details required |

Recommended refresh defaults for review: events/news verification <=24 hours; service pages <=7 days; code review before submission and whenever source version changes, with explicit amendment status. Never claim timeless validity from these intervals. Unknown/unverified legal currency is disclosed. P0 manifests have a known support/freshness horizon and refresh command; request path need not crawl the web.

Manual reviewed code acquisition is acceptable P0 if provenance/version is retained and reproducible refresh instructions exist. No invented text or unsafe scraping workaround. If selected sections cannot be acquired, resolve alternate actual code coverage with Dror before proceeding. Respect source access terms.

## 5. Acceptance criteria

- AC-001: Given actual acquired code plus required exceptions, when asked a supported code question, then answer/support references preserve those qualifications.
- AC-002: Given only website guidance, when code evidence is requested, then the system does not count that as actual code coverage.
- AC-003: Given expired/conflicting/absent evidence, then clarification/limitation results without unsupported precision.
- AC-004: Given yesterday's event or a cancellation, when asked upcoming events today, then it is not presented as upcoming.
- AC-005: Given injected instructions inside a passage, then no tool scope/authorization changes.

## 6. Test automation strategy

Planned `npm run knowledge:validate`, `npm run knowledge:refresh`, `npm run eval:text`. Validate canonical URLs, hashes, metadata, expired horizons, supported topic coverage, and code/website separation. Fixed dates and synthetic fixtures for date/cancellation tests. Model grounding tests are empirical, with human review of material claims/exceptions; a second model judge is fallible.

## 7. Rationale and context

A bounded corpus is sufficient to demonstrate R1/R2 while retaining auditability. First select sources transparently; broader retrieval becomes worthwhile when topic coverage requires it. Freshness and legal applicability are independent of citation presence.

## 8. Dependencies and integrations

Approved Boulder pages and municipal library; reviewed local corpus/manifest behind KnowledgeProvider, server Clock, ReasoningBackend, UI source cards, event/trace boundary. No mandatory vector database, crawler service, or external search API.

## 9. Examples and edge cases

Park guidance hours do not define city office hours. Missing event time -> say source does not list a time. Shelter policy changes seasonally -> preserve source dates. Later ordinances may not appear in a supplement -> record amendment review rather than claiming code is definitely current.

## 10. Validation criteria

M1 acquires and verifies at least one code answer with actual text and one separate website answer. M4 builds bounded events/news corpus and refresh path. M6 refreshes before submission and records manifest/revision/date against A1–A3/A11/A19. No corpus/eval exists yet.

## 11. Related specifications

[Root](../SPEC.md), [voice](spec-design-voice.md), [security](spec-process-security-observability.md), [evaluation](spec-process-evaluation.md).

Sources: [code](https://library.municode.com/co/boulder/codes/municipal_code), [park guidance](https://bouldercolorado.gov/general-park-rules-and-regulations), [transportation](https://bouldercolorado.gov/services/transportation-maintenance), [events](https://bouldercolorado.gov/events), [news](https://bouldercolorado.gov/news).
