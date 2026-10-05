import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "README.md",
  "AGENTS.md",
  "SPEC.md",
  "ACCEPTANCE.md",
  "CODEX_TASK.md",
  "REVIEW.md",
  "KIT_VALIDATION.md",
  "docs/SOURCES.md",
  "package.json",
  "public/manifest.json",
  "ui/preview.html",
  "src/main.ts",
  "tests/fixtures/scenarios.json",
  "tests/contracts.spec.ts",
  "tests/provider-boundary.spec.ts",
  "src/providers/types.ts",
  "src/providers/index.ts",
  "src/core/model.ts",
  "MIGRATION.md",
  "docs/ADDING_A_PLATFORM.md",
  "docs/NAMING.md",
  "tools/check-boundaries.mjs",
  "tools/bootstrap.mjs",
  "tools/package.mjs",
];
const failures = [];
for (const item of required)
  if (!existsSync(path.join(root, item))) failures.push(`Missing ${item}`);
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (
      [
        "node_modules",
        "dist",
        "dist-test",
        "release",
        ".git",
        "test-results",
        "playwright-report",
      ].includes(entry.name)
    )
      return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
const files = walk(root);
let jsonCount = 0,
  scripts = 0;
for (const file of files) {
  if (file.endsWith(".json")) {
    try {
      JSON.parse(readFileSync(file, "utf8"));
      jsonCount++;
    } catch (error) {
      failures.push(`Invalid JSON ${path.relative(root, file)}: ${error.message}`);
    }
  }
  if (file.endsWith(".mjs")) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (result.status !== 0)
      failures.push(`Invalid JS ${path.relative(root, file)}: ${result.stderr}`);
    else scripts++;
  }
}
const manifest = JSON.parse(readFileSync(path.join(root, "public/manifest.json"), "utf8"));
const permitted = ["activeTab", "scripting", "clipboardWrite", "downloads"].sort();
if (manifest.manifest_version !== 3) failures.push("Manifest must be v3");
if (
  JSON.stringify([...manifest.permissions].sort((a, b) => a.localeCompare(b))) !==
  JSON.stringify(permitted)
)
  failures.push("Permission scope changed");
for (const field of ["host_permissions", "background", "content_scripts", "options_page"]) {
  if (manifest[field]) failures.push(`Unexpected manifest field ${field}`);
}
const scenarios = JSON.parse(
  readFileSync(path.join(root, "tests/fixtures/scenarios.json"), "utf8"),
);
const names = new Set();
for (const scenario of scenarios) {
  if (names.has(scenario.name)) failures.push(`Duplicate fixture ${scenario.name}`);
  names.add(scenario.name);
  if (!scenario.expected.errorCode && !Array.isArray(scenario.expected.messageIds))
    failures.push(`Fixture has no outcome: ${scenario.name}`);
  if (scenario.expected.messageIds) {
    const ids = [],
      seen = new Set();
    let node = scenario.capture.payload.current_node;
    const graph = scenario.capture.payload.mapping;
    while (node !== null) {
      if (seen.has(node) || !graph[node]) {
        failures.push(`Invalid positive fixture ${scenario.name}`);
        break;
      }
      seen.add(node);
      const m = graph[node].message;
      if (
        m &&
        ["user", "assistant"].includes(m.author.role) &&
        !["analysis", "commentary"].includes(m.channel) &&
        !m.metadata?.is_visually_hidden_from_conversation &&
        (!m.recipient || m.recipient === "all")
      )
        ids.push(m.id);
      node = graph[node].parent;
    }
    if (JSON.stringify(ids.reverse()) !== JSON.stringify(scenario.expected.messageIds))
      failures.push(`Incorrect hand-labelled path ${scenario.name}`);
  }
}
for (const file of files.filter((file) => file.endsWith(".md"))) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/(?<!!)\[[^\]\n]+\]\(([^\s)]+)\)/g)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|#|sandbox:)/.test(target)) continue;
    const resolved = path.resolve(path.dirname(file), decodeURIComponent(target.split("#")[0]));
    if (!existsSync(resolved))
      failures.push(`Broken relative link ${path.relative(root, file)} -> ${target}`);
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `KIT VALID: ${jsonCount} JSON files, ${scripts} Node scripts, ${scenarios.length} synthetic scenarios; required files and relative links checked. This does NOT run the application tests or validate live ChatGPT.`,
  );
