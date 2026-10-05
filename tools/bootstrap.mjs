import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pinnedNode = readFileSync(path.join(root, ".nvmrc"), "utf8").trim();

if (process.versions.node !== pinnedNode) {
  console.error(`Use Node ${pinnedNode} from .nvmrc; current runtime is ${process.versions.node}.`);
  process.exit(1);
}
if (!existsSync(path.join(root, "pnpm-lock.yaml"))) {
  console.error("Missing pnpm-lock.yaml. Restore the committed lockfile before bootstrapping.");
  process.exit(1);
}

// Dependency selection is complete. Bootstrap only restores the committed versions.
const result = spawnSync(
  process.execPath,
  [path.join(root, "tools/pnpm.mjs"), "install", "--frozen-lockfile"],
  { cwd: root, stdio: "inherit" },
);
if (result.error) console.error(result.error.message);
if (result.status === 0) {
  console.log("Pinned dependencies installed. Run check:foundation for the infrastructure stage.");
}
process.exitCode = result.status ?? 1;
