// Runs both watch builds (main + content script) in parallel.
import { spawn } from "node:child_process";

const commands = [
  ["vite", "build", "--watch", "--mode", "development"],
  ["vite", "build", "--watch", "--mode", "development", "--config", "vite.content.config.ts"],
];

const children = commands.map((args) =>
  spawn("pnpm", ["exec", ...args], { stdio: "inherit", shell: process.platform === "win32" }),
);
for (const child of children) {
  child.on("exit", (code) => {
    children.forEach((c) => c.kill());
    process.exit(code ?? 0);
  });
}
