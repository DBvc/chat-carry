import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
if (!/^pnpm@\d+\.\d+\.\d+$/.test(pkg.packageManager ?? "")) {
  console.error("Run node tools/bootstrap.mjs first to resolve an exact pnpm version.");
  process.exit(1);
}
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node tools/pnpm.mjs <pnpm command and arguments>");
  process.exit(1);
}
const result = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["exec", "--yes", "--prefer-offline", `--package=${pkg.packageManager}`, "--", "pnpm", ...args],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
