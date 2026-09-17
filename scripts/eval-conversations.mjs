/**
 * Automated conversation loop.
 * Runs versioned caller scenarios against a locally running assistant over the
 * text delegation path (the same reasoning turn, tools, and session as voice
 * without audio), checks deterministic expectations, has a critic score each
 * transcript against eval/conversation-rubric.md, and writes a JSON record plus
 * a coder-facing markdown report under eval/results/.
 *
 * Requirements: a running local server and OPENAI_API_KEY in ignored .env.dev.
 * Never confirms a draft while the scenario clock is closed, so the loop never
 * creates an external ticket.
 *
 * Usage:
 *   npm run eval:conversations
 *   npm run eval:conversations -- --scenarios=pothole-open-hours,glass-code-question
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const BASE_URL = process.env.EVAL_BASE_URL ?? "http://127.0.0.1:3001";
const ORIGIN = "http://127.0.0.1:5173";
const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = process.env.REASONING_MODEL ?? "gpt-5.6-luna";
const API_KEY = process.env.OPENAI_API_KEY;
const MAX_CALLER_TOKENS = 200;

const args = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const match = argument.match(/^--([^=]+)(?:=(.*))?$/);
    return match ? [match[1], match[2] ?? ""] : [argument, ""];
  }),
);

const scenarioFileUrl = new URL(
  "../eval/conversation-scenarios.json",
  import.meta.url,
);
const scenarioText = await readFile(scenarioFileUrl, "utf8");
const allScenarios = JSON.parse(scenarioText);
const selected = args.scenarios
  ? allScenarios.filter((scenario) =>
      args.scenarios.split(",").includes(scenario.id),
    )
  : allScenarios;
const scenariosHash = createHash("sha256").update(scenarioText).digest("hex");

if (!API_KEY) {
  process.stderr.write("Set OPENAI_API_KEY in ignored .env.dev first.\n");
  process.exitCode = 2;
} else {
  const records = [];
  for (const scenario of selected) {
    process.stdout.write(`\n=== ${scenario.id}\n`);
    records.push(await runScenario(scenario));
  }

  const recordedAtUtc = new Date().toISOString();
  const resultUrl = new URL(
    `../eval/results/conversations-${recordedAtUtc.replace(/[:.]/g, "-")}.json`,
    import.meta.url,
  );
  await mkdir(new URL("../eval/results/", import.meta.url), {
    recursive: true,
  });
  await writeFile(
    resultUrl,
    `${JSON.stringify(
      { recordedAtUtc, scenariosHash, model: MODEL, records },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    new URL("../eval/results/conversations-latest.md", import.meta.url),
    renderReport(records),
  );

  const failed = records.filter((record) =>
    record.assertions.some((item) => !item.pass),
  );
  process.stdout.write(
    `\n${records.length - failed.length}/${records.length} scenarios passed their assertions\n`,
  );
  process.stdout.write(`wrote ${resultUrl.pathname}\n`);
  if (failed.length > 0) process.exitCode = 1;
}

/** Runs one scenario end to end and returns its record. */
async function runScenario(scenario) {
  await api("/api/local/scenario", {
    method: "POST",
    body: { scenario: scenario.hours },
  });
  const session = { cookie: null };
  const turns = [];
  const draftStates = [];

  for (let turn = 1; turn <= scenario.maxTurns; turn += 1) {
    const utterance = await callerTurn(scenario, turns);
    if (!utterance) break;
    const response = await api("/api/local/delegation", {
      method: "POST",
      body: { utterance },
      session,
    });
    const reply = response.json?.speech ?? "";
    const toolResult = response.json?.result ?? null;
    turns.push({ caller: utterance, reply, toolResult });
    process.stdout.write(
      `  caller: ${utterance}\n  reply : ${reply.slice(0, 160)}\n`,
    );

    const draft = await api("/api/local/report", { session });
    draftStates.push(draft.json);
    if (isGoalReached(scenario, draft.json, toolResult, turns)) break;
  }

  const assertions = await checkAssertions(
    scenario,
    turns,
    draftStates,
    session,
  );
  const critic = await critique(scenario, turns, assertions);
  return {
    scenario: scenario.id,
    goal: scenario.goal,
    turns,
    assertions,
    critic,
  };
}

/** Input: the scenario and prior turns. Output: one caller utterance. */
async function callerTurn(scenario, turns) {
  const transcript = turns
    .map((turn) => `Resident: ${turn.caller}\nCity assistant: ${turn.reply}`)
    .join("\n");
  const text = await chat({
    system: [
      "You are a resident of Boulder, Colorado calling the city's automated demo line.",
      `Your goal: ${scenario.goal}`,
      scenario.notes ? `Context: ${scenario.notes}` : "",
      "Reply with exactly one short spoken utterance and nothing else.",
      "If the assistant asked a question, answer it using details from your goal.",
      'When the goal is complete, close briefly, for example: "Thanks, that\'s all."',
      "Never mention that you are an AI or following a script.",
    ]
      .filter(Boolean)
      .join(" "),
    user: transcript
      ? `Conversation so far:\n${transcript}\n\nYour next utterance:`
      : "Start the call. Your next utterance:",
    maxTokens: MAX_CALLER_TOKENS,
  });
  return text.trim().replace(/^"|"$/g, "");
}

/** Input: the scenario, turns, and draft history. Output: whether the goal is reached. */
function isGoalReached(scenario, draft, toolResult, turns) {
  if (scenario.kind === "report") {
    if (draft?.status !== "needs_confirmation") return false;
    return expectedDraftFieldsSatisfied(scenario, draft);
  }
  if (scenario.kind === "answer") {
    return (
      toolResult?.status === "answered" ||
      toolResult?.status === "limited_coverage"
    );
  }
  return turns.length >= 1;
}

/** Input: a scenario and a confirmation summary. Output: whether expected fields match. */
function expectedDraftFieldsSatisfied(scenario, draft) {
  const expected = scenario.expect.draftFields ?? {};
  const summary = draft?.summary ?? {};
  return Object.entries(expected).every(([field, value]) =>
    String(summary[field] ?? "")
      .toLowerCase()
      .includes(value.toLowerCase()),
  );
}

/** Input: a scenario and its run. Output: deterministic assertion records. */
async function checkAssertions(scenario, turns, draftStates, session) {
  const assertions = [];
  const expect = scenario.expect;
  const replies = turns.map((turn) => turn.reply.toLowerCase()).join("\n");
  const lastDraft = draftStates.at(-1);

  if ("tool" in expect) {
    const inferred = inferTools(turns);
    const pass =
      expect.tool === null
        ? inferred.length === 0
        : inferred.includes(expect.tool) ||
          (expect.tool.startsWith("lookup") && inferred.includes("knowledge"));
    assertions.push({
      name: "tool",
      pass,
      detail: `expected ${expect.tool ?? "none"}, inferred ${inferred.join(",") || "none"}`,
    });
  }
  if (expect.answerContains) {
    const answers = turns
      .map((turn) => turn.toolResult?.answer ?? "")
      .join("\n")
      .toLowerCase();
    for (const needle of expect.answerContains) {
      assertions.push({
        name: `answer contains "${needle}"`,
        pass: answers.includes(needle.toLowerCase()),
        detail: answers.slice(0, 160),
      });
    }
  }
  if (expect.speechContains) {
    for (const needle of expect.speechContains) {
      assertions.push({
        name: `speech contains "${needle}"`,
        pass: replies.includes(needle.toLowerCase()),
        detail: replies.slice(0, 200),
      });
    }
  }
  if (expect.draftFields) {
    const summary = lastDraft?.summary ?? {};
    for (const [field, value] of Object.entries(expect.draftFields)) {
      assertions.push({
        name: `draft ${field} contains "${value}"`,
        pass: String(summary[field] ?? "")
          .toLowerCase()
          .includes(value.toLowerCase()),
        detail: JSON.stringify(summary),
      });
    }
  }
  if (expect.confirmOutcome) {
    const draft = lastDraft;
    if (scenario.hours !== "open" || draft?.status !== "needs_confirmation") {
      assertions.push({
        name: `confirm outcome ${expect.confirmOutcome}`,
        pass: false,
        detail: `not confirmable (hours=${scenario.hours}, draft=${draft?.status})`,
      });
    } else {
      const confirmation = await api("/api/local/report/confirm", {
        method: "POST",
        body: { draftId: draft.draftId, revision: draft.revision },
        session,
      });
      assertions.push({
        name: `confirm outcome ${expect.confirmOutcome}`,
        pass: confirmation.json?.status === expect.confirmOutcome,
        detail: JSON.stringify(confirmation.json),
      });
    }
  }
  return assertions;
}

/** Input: the turns. Output: tool names inferred from result shapes. */
function inferTools(turns) {
  const tools = new Set();
  for (const turn of turns) {
    const result = turn.toolResult;
    if (!result) continue;
    if (
      result.status === "needs_input" ||
      result.status === "needs_confirmation"
    ) {
      tools.add("prepareServiceReport");
    } else if (
      result.status === "answered" &&
      result.coverage === "live_official_source"
    ) {
      tools.add("findCityEvents");
    } else if (result.status === "answered") {
      tools.add("knowledge");
      const answer = String(result.answer ?? "").toLowerCase();
      if (answer.includes("8-3-9") || answer.includes("glass")) {
        tools.add("lookupMunicipalCode");
      } else if (answer.includes("pothole")) {
        tools.add("lookupCityInformation");
      }
    }
  }
  return [...tools];
}

/** Input: a scenario, turns, and assertions. Output: the critic scorecard. */
async function critique(scenario, turns, assertions) {
  const transcript = turns
    .map((turn) => `Resident: ${turn.caller}\nCity assistant: ${turn.reply}`)
    .join("\n");
  const assertionText = assertions
    .map(
      (item) => `${item.pass ? "PASS" : "FAIL"} ${item.name} (${item.detail})`,
    )
    .join("\n");
  const dimensions = [
    "grounding",
    "taskCompletion",
    "naturalness",
    "noRepetition",
    "scope",
  ];
  const schema = {
    type: "object",
    properties: {
      scores: {
        type: "object",
        properties: Object.fromEntries(
          dimensions.map((dimension) => [
            dimension,
            { type: "integer", minimum: 0, maximum: 2 },
          ]),
        ),
        required: dimensions,
        additionalProperties: false,
      },
      summary: { type: "string" },
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            dimension: { type: "string", enum: dimensions },
            quote: { type: "string" },
            problem: { type: "string" },
            fixTarget: {
              type: "string",
              enum: [
                "reasoning-instructions",
                "live-instructions",
                "tool-description",
                "server-binding",
                "message-copy",
                "unknown",
              ],
            },
          },
          required: ["dimension", "quote", "problem", "fixTarget"],
          additionalProperties: false,
        },
      },
    },
    required: ["scores", "summary", "issues"],
    additionalProperties: false,
  };
  const raw = await chat({
    system: [
      "You are a strict evaluator of a city-services voice assistant demo.",
      "Score the transcript against the rubric dimensions 0-2.",
      "Only report issues you can quote from the transcript.",
      "Prefer concrete, fixable issues over generalities.",
    ].join(" "),
    user: [
      `Scenario goal: ${scenario.goal}`,
      `Deterministic assertions:\n${assertionText}`,
      `Transcript:\n${transcript}`,
    ].join("\n\n"),
    schema,
    maxTokens: 700,
  });
  try {
    return JSON.parse(raw);
  } catch {
    return { scores: null, summary: "critic response unparsable", issues: [] };
  }
}

/** Input: all records. Output: a coder-facing markdown report. */
function renderReport(records) {
  const lines = [
    "# Conversation loop report",
    "",
    `Model: ${MODEL}`,
    "",
    "| Scenario | Assertions | Scores (G/T/N/R/S) | Issues |",
    "| --- | --- | --- | --- |",
  ];
  for (const record of records) {
    const passed = record.assertions.filter((item) => item.pass).length;
    const scores = record.critic.scores
      ? [
          record.critic.scores.grounding,
          record.critic.scores.taskCompletion,
          record.critic.scores.naturalness,
          record.critic.scores.noRepetition,
          record.critic.scores.scope,
        ].join("/")
      : "n/a";
    lines.push(
      `| ${record.scenario} | ${passed}/${record.assertions.length} | ${scores} | ${record.critic.issues.length} |`,
    );
  }
  lines.push("", "## Failed assertions", "");
  for (const record of records) {
    for (const item of record.assertions.filter((entry) => !entry.pass)) {
      lines.push(`- ${record.scenario}: ${item.name} — ${item.detail}`);
    }
  }
  lines.push("", "## Critic issues by fix target", "");
  const byTarget = new Map();
  for (const record of records) {
    for (const issue of record.critic.issues) {
      const list = byTarget.get(issue.fixTarget) ?? [];
      list.push({ scenario: record.scenario, ...issue });
      byTarget.set(issue.fixTarget, list);
    }
  }
  for (const [target, issues] of byTarget) {
    lines.push(`### ${target}`, "");
    for (const issue of issues) {
      lines.push(
        `- (${issue.scenario}) ${issue.dimension}: ${issue.problem}`,
        `  - quote: "${issue.quote}"`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Input: an API path and request details. Output: parsed response and maintained cookie. */
async function api(path, { method = "GET", body, session } = {}) {
  const headers = { origin: ORIGIN };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (session?.cookie) headers.cookie = session.cookie;
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (session && !session.cookie) {
    const setCookie =
      response.headers.getSetCookie?.()[0] ??
      response.headers.get("set-cookie");
    if (setCookie) session.cookie = setCookie.split(";")[0];
  }
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

/** Input: a model request. Output: text or JSON string from the Responses API. */
async function chat({ system, user, schema, maxTokens = 400 }) {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      store: false,
      reasoning: { effort: "none" },
      max_output_tokens: maxTokens,
      input: [
        { role: "developer", content: system },
        { role: "user", content: user },
      ],
      ...(schema
        ? {
            text: {
              format: {
                type: "json_schema",
                name: "report",
                strict: true,
                schema,
              },
            },
          }
        : {}),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`Model request failed with ${response.status}`);
  }
  const body = await response.json();
  const message = body.output?.find((item) => item.type === "message");
  const text = message?.content
    ?.filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join(" ");
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error("Model returned no text");
  }
  return text.trim();
}
