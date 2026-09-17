import { readFile } from "node:fs/promises";
import { proposeCitizenIntent } from "../dist/server/intent-proposal.js";

const cases = JSON.parse(
  await readFile(new URL("../eval/intent-cases.json", import.meta.url), "utf8"),
);

if (!process.env.OPENAI_API_KEY) {
  process.stderr.write("Set OPENAI_API_KEY in ignored .env.dev first.\n");
  process.exitCode = 2;
} else {
  let failures = 0;
  for (const testCase of cases) {
    const result = await proposeCitizenIntent(
      testCase.utterance,
      process.env.OPENAI_API_KEY,
      fetch,
      testCase.activeDraft,
    );
    const passed =
      result.status === "proposed" &&
      Object.entries(testCase.expected).every(
        ([field, expected]) => result.proposal[field] === expected,
      );
    if (!passed) failures += 1;
    process.stdout.write(
      `${testCase.id}: ${passed ? "PASS" : "FAIL"} (${result.status === "proposed" ? result.proposal.intent : result.reason})\n`,
    );
  }
  process.stdout.write(`${cases.length - failures}/${cases.length} passed\n`);
  if (failures) process.exitCode = 1;
}
