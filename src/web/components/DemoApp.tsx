/**
 * Demo application.
 * Composes the task screen from the report, knowledge, and scenario hooks and
 * wires the voice panel's verified results into the same state model.
 */
import { useEffect, useState } from "react";
import type { AgentToolResult } from "../../server/reasoning/tool-definitions.js";
import { fetchCityName } from "../api.js";
import { useKnowledge } from "../hooks/useKnowledge.js";
import { useReportFlow } from "../hooks/useReportFlow.js";
import { useScenario } from "../hooks/useScenario.js";
import { KnowledgePanel } from "./KnowledgePanel.js";
import { ReportPanel } from "./ReportPanel.js";
import { ScenarioControl } from "./ScenarioControl.js";
import { VoicePanel } from "./VoicePanel.js";

export function DemoApp() {
  const [cityName, setCityName] = useState("City");
  const report = useReportFlow();
  const knowledge = useKnowledge();
  const scenario = useScenario();

  /** Input: a verified voice-path result. Output: the matching panel reflects it. */
  function handleVoiceResult(result: AgentToolResult) {
    if (
      result.status === "needs_input" ||
      result.status === "needs_confirmation"
    ) {
      report.acceptDraft(result);
    } else if (
      result.status === "answered" ||
      result.status === "limited_coverage"
    ) {
      knowledge.show(result);
    } else if (result.status === "blocked") {
      report.showBlocked(result.code);
    }
  }

  return (
    <main className="page">
      <header className="page-header">
        <p className="eyebrow">Independent developer demo · City services</p>
        <h1>City service demo</h1>
        <p className="intro">
          Ask a reviewed city question or report a nonurgent pothole or park
          maintenance issue. Confirm the saved details to see the business-hours
          decision.
        </p>
        <p className="intro">
          Use fictional report details. This demo stores drafts and may create a
          synthetic issue in its dedicated Linear project.
        </p>
      </header>

      <ScenarioControl scenario={scenario} />

      <VoicePanel
        onResult={handleVoiceResult}
        action={report.action}
        actionDraftId={report.actionDraftId}
        reportEpochRef={report.reportEpochRef}
      />

      <ReportPanel flow={report} />

      <KnowledgePanel knowledge={knowledge} />

      <p className="footer-note">
        Local test interface. This page does not contact the city or submit a
        service request.
      </p>
    </main>
  );
}
