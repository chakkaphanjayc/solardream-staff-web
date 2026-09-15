import { spawn } from "node:child_process";

const scriptName = process.env.WORKERS_CI === "1" ? "build:cloudflare" : "build:next";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npmCommand, ["run", scriptName], {
  env: process.env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Unable to start ${scriptName}:`, error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});
