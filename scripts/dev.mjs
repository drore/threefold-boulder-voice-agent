import { spawn, spawnSync } from "node:child_process";

const build = spawnSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", "tsconfig.build.json"],
  { stdio: "inherit" },
);
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const children = [
  spawn(
    process.execPath,
    [
      "--env-file=.env.local",
      "--env-file-if-exists=.env.dev",
      "dist/server/main.js",
    ],
    { stdio: "inherit" },
  ),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
    stdio: "inherit",
  }),
];
let stopping = false;

/** Stops the local API and Vite when the user interrupts or either process ends. */
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
}

for (const child of children) {
  child.once("error", (error) => {
    process.stderr.write(
      `Could not start local development: ${error.message}\n`,
    );
    process.exitCode = 1;
    stop();
  });
  child.once("exit", (code) => {
    if (!stopping) {
      process.exitCode = code === 0 ? 1 : (code ?? 1);
      stop();
    }
  });
}

process.once("SIGINT", () => {
  process.exitCode = 130;
  stop();
});
process.once("SIGTERM", () => {
  process.exitCode = 143;
  stop();
});
process.once("exit", stop);
