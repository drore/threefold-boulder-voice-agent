# Interface generation prompts

**Status:** the simple responsive concept is selected for P0. Earlier desktop/mobile prompts are retained as superseded exploration. All scenarios are synthetic. [Concept review](README.md) owns the selected direction and review notes.

## Selected simple responsive concept

```text
Use case: ui-mockup.
Create one high-fidelity but deliberately simple responsive web interface concept for a developer take-home demonstrating a Boulder municipal voice assistant. This is an independent demo, not an official city product. Show a single flat, front-facing desktop web page at 1536x1024 landscape. Do not include a phone frame or a separate mobile mockup.

Visual direction: quiet and functional, white and very light gray surfaces, one accessible medium blue accent, dark readable system typography, simple 1px borders, restrained corner radius, generous but efficient spacing. No gradients, decorative mountain logos, huge microphone orb, sci-fi waveform, glass effects, analytics dashboard, map, admin panel, representative console, account UI, telephony keypad, or official city seal.

Header: exact title “Boulder voice assistant”. Beside it show a compact label “Independent demo”. Small supporting text: “Not connected to City of Boulder staff.”

Main page: two simple columns that naturally stack on narrow screens. The left column is the conversation and should be wider. Its title is “Conversation”. Near the title show a small blue status dot with exact label “Listening”. Show only two short readable messages:
You: “There’s a pothole at Pine Street and 15th Street.”
Assistant: “Please confirm the details before I submit your report.”
At the bottom of this column show one simple primary voice control labeled “Mute” and one secondary text control labeled “End”.

The right column is one bordered card titled “Current request”. It contains four clean rows:
Issue — Pothole
Location — Pine Street & 15th Street
Department — Transportation & Mobility
Decision — Offices closed → create a Linear ticket
Make Location and Decision easy to scan. Under the rows add exact supporting text: “Nothing has been submitted yet.” Then a blue primary button “Confirm” and a secondary button “Edit”.

Below the assistant message, include a small inline source link, not a separate dashboard: “Source: Boulder transportation maintenance”. At the bottom of the request card include a small disclosure-style link “Why this action?” Do not expose internal IDs, model names, configuration keys, traces, logs, or developer jargon.

The screen should make the required demonstration obvious within seconds: spoken conversation, collected location, department, deterministic business-hours decision, official source, and confirmation before action. It must not show a ticket ID or success state because confirmation has not happened. Use exact concise English labels and ensure all text is legible. Render a polished but realistically buildable developer-demo interface, not a marketing concept.
```

## Superseded desktop exploration

```text
Use case: ui-mockup
Asset type: high-fidelity desktop web interface concept for the Boulder municipal voice-agent take-home; a design proposal, no implemented product.
Primary request: Design a polished, human, calm civic-service voice interface for a resident reporting a nonurgent pothole. Flat front-facing web UI, landscape, crisp readable typography, generous spacing, restrained neutral surfaces with one accessible dark accent, simple outline icons. Practical shippable layout, no decorative dashboard or 3D device mockup.
Composition: A broad desktop interface with a simple header, a main voice/conversation region and a clearly dominant report-review card alongside it. Header text "Boulder" and "Municipal assistant", with prominent small badge "Independent demo" and visible "Not connected to City of Boulder staff". No official city seal or official brand imitation.
Scenario: After-hours service report, BEFORE confirmation/submission. A visible city-hours badge "Offices closed" and "Mon–Fri, 8 am–5 pm · Mountain time". These are illustrative scenario data, not live status.
Voice area: short title "Let’s review your report"; an understated microphone waveform with status "Listening". A readable latest caller sentence "There’s a pothole at Pine Street and 15th Street." and assistant text "Please confirm the location before I submit your report." A compact control bar with clearly labelled "Mute" and "End conversation" and accessible large touch/click targets. Small accessible-text disclosure "Conversation text", no sprawling transcript.
Review card: title "Review your report", field labels "Issue", "Location", "Department", values "Pothole", "Pine Street & 15th Street", "Transportation & Mobility". Location is visually prominent. Explanation "Offices are closed. Once you confirm, this demo will create a ticket." Clear primary button "Confirm and submit", secondary "Edit details". Small truthful line "Nothing has been submitted yet." No ticket ID or success claim in this state.
Source region: a modest card "Official guidance", "Boulder transportation maintenance", link label "View source"; no invented municipal-code quotation or unsupported news claim. A compact session activity text "Location collected · Awaiting your confirmation" conveys meaningful user-facing progress without exposing internal workflow IDs or logs.
Constraints: readable exact English text, clear contrast, solid functional typography, restrained rounded corners, consistent spacing, distinct safe destructive end-conversation control. Residents should understand what will happen next. No admin analytics, representative screen, map/geolocation, account signup, ticket-always toggle, telephony keypad, real transfer claim, model/API jargon, invented awards or marketing slogans. No extra cities or additional unsupported services. Show one complete screen without cropped controls. High-resolution flat UI.
```

## Desktop wording revision

```text
Edit this desktop UI mockup with ONE targeted correction. Preserve the entire layout, styling, typography, all other cards and text, icons, and controls. In the top 'Offices closed' banner, replace ONLY the two sentences on the right ('You can still report nonurgent issues anytime.' and 'We’ll create a ticket for follow-up when offices reopen.') with exact text: 'This is an after-hours demo.' and 'A ticket is created only after you confirm.' Do not promise City of Boulder follow-up or staff response. Everything else unchanged. Render a crisp flat high-resolution UI.
```

## Superseded mobile exploration

```text
Use case: ui-mockup
Asset type: high-fidelity mobile responsive web UI concept for a Boulder municipal voice-agent independent demo, portrait canvas, one complete phone-sized screen with no ornamental physical device frame.
Primary request: Create a polished, readable, human civic-service voice interface on a narrow mobile screen, consistent neutral surfaces and one accessible dark accent, restrained rounded cards, generous spacing, large 44px-equivalent controls, clear hierarchy, no tiny desktop dashboard squeezed into a phone. A design proposal, no implemented product.
Scenario: After hours, a CONFIRMED pothole report has received a verified demo ticket receipt. This is an illustrative completed-state concept, not real live action evidence.
Header text "Boulder", "Municipal assistant", small clearly visible "Independent demo"; visible disclaimer "Not connected to City of Boulder staff".
Main status card: a modest check icon, title "Demo ticket created". Explanation "Your confirmed pothole report was saved." Show clearly labelled "Demo ticket" and fictional reference "DEMO-1043"; button-like external link "View demo ticket". Never imply a real municipal report or response promise.
Confirmed details: "Location" with prominent value "Pine Street & 15th Street"; "Department" with "Transportation & Mobility". Supporting line "Offices are closed. No transfer was made." The department wrap must remain readable.
Voice area: compact microphone waveform, status "Listening", short assistant caption "Is there anything else about this report?" A "Conversation text" disclosure gives readable accessible text; a small "Official guidance" / "View source" card supports the answer without invented code quotations.
Mobile controls: sticky bottom region with clearly labelled large "Mute" and "End conversation" controls above a comfortable safe-area inset. All content stacked naturally; no horizontal scroll, no overlapping sticky bar, no cropped content. The main confirmation/receipt details should be visible with the controls.
Constraints: Exact readable English labels; no gradients/glowing sci-fi orb, official city seal, admin analytics, representative dashboard, map/geolocation, account signup, telephony keypad, live municipal transfer, model/API jargon, or invented response-time guarantees. Distinguish demo ticket success from municipal staff response. Render a single complete flat mobile screen at high resolution.
```
