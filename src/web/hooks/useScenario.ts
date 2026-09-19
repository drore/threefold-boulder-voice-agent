/**
 * Demo-time scenario hook.
 * Owns the open/closed clock selection for the demo and the server's applied
 * simulated time. The selection is a demo control, never caller-set. It resyncs
 * from the server on load so the toggle reflects the clock actually in effect.
 */
import { useEffect, useState } from "react";
import {
  fetchDemoScenario,
  selectDemoScenario,
  type DemoScenario,
} from "../api.js";

export function useScenario() {
  const [scenario, setScenario] = useState<DemoScenario>("live");
  const [simulatedNow, setSimulatedNow] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetchDemoScenario()
      .then((state) => {
        if (!active) return;
        setScenario(state.scenario);
        setSimulatedNow(state.simulatedNow);
      })
      .catch(() => {
        // Non-critical: the toggle keeps its default until the next selection.
      });
    return () => {
      active = false;
    };
  }, []);

  /** Input: a demo-time selection. Output: the server applies it for the next confirmation. */
  async function select(next: DemoScenario) {
    setError("");
    try {
      const body = await selectDemoScenario(next);
      setScenario(next);
      setSimulatedNow(body.simulatedNow);
    } catch {
      setError("Could not set the demo scenario.");
    }
  }

  return { scenario, simulatedNow, error, select };
}
