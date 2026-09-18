/**
 * Promptfoo provider: runs one reasoning turn and returns the chosen tool name.
 * Input: the caller utterance as the prompt. Output: the tool name, or the
 * outcome status when the turn could not complete. This drives the tool-selection
 * regression matrix and model A/B comparison in `promptfoo eval` / `promptfoo view`.
 */
import { runReasoningTurn } from "../dist/server/reasoning/reasoning-turn.js";

process.loadEnvFile?.(".env.dev");

class ReasoningProvider {
  constructor(options) {
    this.model =
      options?.config?.model ?? process.env.PROMPTFOO_MODEL ?? "gpt-5.6-luna";
  }

  id() {
    return this.model;
  }

  async callApi(prompt) {
    const result = await runReasoningTurn({
      utterance: prompt,
      cityName: "Boulder",
      apiKey: process.env.OPENAI_API_KEY,
      model: this.model,
      executeTool: async () => ({
        status: "unavailable",
        reason: "not_implemented",
      }),
    });
    const output =
      result.status === "completed"
        ? (result.toolCalls[0]?.name ?? "none")
        : result.status;
    return { output };
  }
}

export default ReasoningProvider;
