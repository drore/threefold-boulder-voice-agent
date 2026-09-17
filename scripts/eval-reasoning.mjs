/**
 * Paid opt-in reasoning evaluation and model comparison.
 * Runs the versioned tool-selection cases against one or more reasoning models,
 * repeats each case for stability, prints a pass-rate summary with latency,
 * and writes a JSON result file under `eval/results/`.
 *
 * Usage:
 *   npm run eval:reasoning
 *   npm run eval:reasoning -- --models=gpt-5.6-luna,candidate-2 --repeats=3
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { runReasoningTurn } from "../dist/server/reasoning/reasoning-turn.js";

const args = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const match = argument.match(/^--([^=]+)(?:=(.*))?$/);
    return match ? [match[1], match[2] ?? ""] : [argument, ""];
  }),
);
const models = (args.models ?? "gpt-5.6-luna")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const repeats = Math.max(1, Number.parseInt(args.repeats ?? "1", 10) || 1);

const caseFileUrl = new URL("../eval/reasoning-cases.json", import.meta.url);
const caseText = await readFile(caseFileUrl, "utf8");
const cases = JSON.parse(caseText);
const casesHash = createHash("sha256").update(caseText).digest("hex");

if (!process.env.OPENAI_API_KEY) {
  process.stderr.write("Set OPENAI_API_KEY in ignored .env.dev first.\n");
  process.exitCode = 2;
} else {
  const records = [];
  for (const model of models) {
    for (const testCase of cases) {
      for (let run = 1; run <= repeats; run += 1) {
        const startedAt = performance.now();
        const result = await runReasoningTurn({
          utterance: testCase.utterance,
          ...(testCase.activeDraft
            ? { activeDraft: testCase.activeDraft }
            : {}),
          apiKey: process.env.OPENAI_API_KEY,
          model,
          executeTool: async () => ({
            status: "unavailable",
            reason: "not_implemented",
          }),
        });
        const latencyMs = Math.round(performance.now() - startedAt);
        const calledTool =
          result.status === "completed"
            ? (result.toolCalls[0]?.name ?? null)
            : null;
        const pass =
          result.status === "completed" &&
          calledTool === testCase.expected.tool;
        records.push({
          model,
          caseId: testCase.id,
          run,
          expectedTool: testCase.expected.tool,
          calledTool,
          pass,
          latencyMs,
          ...(result.status === "unavailable" ? { reason: result.reason } : {}),
        });
      }
    }
  }

  for (const model of models) {
    const modelRecords = records.filter((record) => record.model === model);
    const passed = modelRecords.filter((record) => record.pass).length;
    const averageLatency = Math.round(
      modelRecords.reduce((total, record) => total + record.latencyMs, 0) /
        modelRecords.length,
    );
    process.stdout.write(
      `${model}: ${passed}/${modelRecords.length} passed, avg ${averageLatency} ms\n`,
    );
    for (const record of modelRecords.filter((item) => !item.pass)) {
      process.stdout.write(
        `  FAIL ${record.caseId} run ${record.run}: expected ${record.expectedTool ?? "none"}, got ${record.calledTool ?? "none"}${record.reason ? ` (${record.reason})` : ""}\n`,
      );
    }
  }

  const recordedAtUtc = new Date().toISOString();
  const resultPath = new URL(
    `../eval/results/reasoning-${recordedAtUtc.replace(/[:.]/g, "-")}.json`,
    import.meta.url,
  );
  await mkdir(new URL("../eval/results/", import.meta.url), {
    recursive: true,
  });
  await writeFile(
    resultPath,
    `${JSON.stringify(
      { recordedAtUtc, casesHash, models, repeats, records },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(`wrote ${resultPath.pathname}\n`);

  if (records.some((record) => !record.pass)) process.exitCode = 1;
}
