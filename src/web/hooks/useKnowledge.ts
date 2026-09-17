/**
 * Knowledge-panel hook.
 * Owns the three reviewed/sourced answer examples and the panel state; the
 * voice path feeds answers in through `show`.
 */
import { useState } from "react";
import type { AgentToolResult } from "../../server/reasoning/agent-tools.js";
import { fetchKnowledgeExample } from "../api.js";

export const KNOWLEDGE_EXAMPLES = [
  {
    label: "Glass in city parks",
    tool: "lookupMunicipalCode",
    query: "What is BRC 8-3-9 about glass containers in city parks?",
  },
  {
    label: "Report a pothole",
    tool: "lookupCityInformation",
    query: "How do I report a pothole in Boulder?",
  },
  {
    label: "Upcoming council study session",
    tool: "findCityEvents",
    query: "Is there an upcoming City Council study session?",
  },
] as const;

export type KnowledgeExample = (typeof KNOWLEDGE_EXAMPLES)[number];

export function useKnowledge() {
  const [knowledge, setKnowledge] = useState<AgentToolResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  /** Input: a reviewed example button. Output: its cited answer or coverage limit. */
  async function tryExample(example: KnowledgeExample) {
    setLoading(true);
    setKnowledge(null);
    setError("");
    try {
      setKnowledge(await fetchKnowledgeExample(example.tool, example.query));
    } catch {
      setError("Could not load the reviewed answer from the local service.");
    } finally {
      setLoading(false);
    }
  }

  /** Input: a verified knowledge result from the voice path. Output: the panel reflects it. */
  function show(result: AgentToolResult) {
    setKnowledge(result);
  }

  return { knowledge, error, loading, tryExample, show };
}
