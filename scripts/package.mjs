// Zips dist/ into job-tracker-sync-<version>.zip for upload / sharing.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("dist/manifest.json", "utf8"));
const out = `job-tracker-sync-${version}.zip`;
execFileSync("zip", ["-r", "-q", `../${out}`, "."], { cwd: "dist", stdio: "inherit" });
console.log(`Created ${out}`);
