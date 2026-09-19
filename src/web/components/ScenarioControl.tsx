/**
 * Demo-clock control.
 * A compact segmented toggle shown in the header: it switches the server
 * between the fixed open/closed clock fixtures so the reviewer can experience
 * both the routing and ticket paths. Server-owned, never caller-set.
 */
import type { useScenario } from "../hooks/useScenario.js";

type ScenarioState = ReturnType<typeof useScenario>;

const OPTIONS = [
  { value: "live", label: "Live", title: "Use the real server time" },
  { value: "open", label: "Open", title: "Fixed business-hours clock" },
  { value: "closed", label: "Closed", title: "Fixed after-hours clock" },
] as const;

export function ScenarioControl({ scenario }: { scenario: ScenarioState }) {
  return (
    <div className="scenario-toggle">
      <span className="scenario-label" id="demo-clock-label">
        Demo clock
      </span>
      <fieldset className="segmented" aria-labelledby="demo-clock-label">
        {OPTIONS.map((option) => {
          const selected = scenario.scenario === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={selected ? "seg seg-active" : "seg"}
              aria-pressed={selected}
              title={option.title}
              onClick={() => void scenario.select(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </fieldset>
      {scenario.error && (
        <span role="alert" className="scenario-error">
          {scenario.error}
        </span>
      )}
    </div>
  );
}
