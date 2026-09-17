/**
 * Demo-time control.
 * Lets the reviewer switch the server between the fixed open/closed clock
 * fixtures so both the routing and ticket paths can be experienced.
 */
import type { useScenario } from "../hooks/useScenario.js";

type ScenarioState = ReturnType<typeof useScenario>;

export function ScenarioControl({ scenario }: { scenario: ScenarioState }) {
  return (
    <section className="report-card" aria-label="Demo time scenario">
      <h2>Demo time</h2>
      <p className="form-hint">
        Simulate the office being open or closed to see routing vs. ticket
        creation. This is a demo simulation, not a real clock change.
      </p>
      <div className="example-actions">
        {(["live", "open", "closed"] as const).map((option) => (
          <button
            key={option}
            type="button"
            disabled={scenario.scenario === option}
            onClick={() => void scenario.select(option)}
          >
            {option === "live"
              ? "Live now"
              : option === "open"
                ? "Business hours (open)"
                : "After hours (closed)"}
          </button>
        ))}
      </div>
      {scenario.simulatedNow && (
        <p className="form-hint">
          Simulated server time:{" "}
          {new Date(scenario.simulatedNow).toLocaleString()}
        </p>
      )}
      {scenario.error && (
        <p role="alert" className="error">
          {scenario.error}
        </p>
      )}
    </section>
  );
}
