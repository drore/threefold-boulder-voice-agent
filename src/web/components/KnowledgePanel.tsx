/**
 * Knowledge panel.
 * Renders the three reviewed/sourced answer buttons and the current answer or
 * coverage limit. Answers may also arrive from the voice path.
 */
import type { useKnowledge } from "../hooks/useKnowledge.js";
import { KNOWLEDGE_EXAMPLES } from "../hooks/useKnowledge.js";

type KnowledgeState = ReturnType<typeof useKnowledge>;

export function KnowledgePanel({ knowledge }: { knowledge: KnowledgeState }) {
  return (
    <section className="report-card" aria-labelledby="knowledge-heading">
      <h2 id="knowledge-heading">Try three sourced answers</h2>
      <p className="form-hint">
        These reviewed examples demonstrate municipal code, city service
        information, and one dated event. They are not a complete city knowledge
        base.
      </p>
      <div className="example-actions">
        {KNOWLEDGE_EXAMPLES.map((example) => (
          <button
            type="button"
            key={example.tool}
            disabled={knowledge.loading}
            onClick={() => void knowledge.tryExample(example)}
          >
            {example.label}
          </button>
        ))}
      </div>
      {knowledge.loading && <p role="status">Checking reviewed source…</p>}
      {knowledge.error && (
        <p role="alert" className="error">
          {knowledge.error}
        </p>
      )}
      {knowledge.knowledge?.status === "answered" && (
        <div className="notice" role="status">
          <p>{knowledge.knowledge.answer}</p>
          {knowledge.knowledge.sources.map((source) => (
            <p key={source.url}>
              Source:{" "}
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title}
              </a>
              {source.excerpt && <> · “{source.excerpt}…”</>} · reviewed{" "}
              {source.verifiedOn}
            </p>
          ))}
          <p>{knowledge.knowledge.limitations.join(" ")}</p>
        </div>
      )}
      {knowledge.knowledge?.status === "limited_coverage" && (
        <p role="status" className="form-hint">
          This reviewed example is unavailable for the question or date. Consult
          official city sources for current information.
        </p>
      )}
    </section>
  );
}
