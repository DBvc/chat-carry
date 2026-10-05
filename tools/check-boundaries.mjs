import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function filesAt(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesAt(full) : full.endsWith(".ts") ? [full] : [];
  });
}
const core = filesAt(path.join(root, "src/core"));
for (const file of core) {
  const text = readFileSync(file, "utf8");
  if (/from\s+["'][^"']*providers(?:\/|["'])/.test(text))
    failures.push(`${file}: core imports providers`);
  if (/current_node|backend-api|chatgpt\.com|accessToken|data-message-author-role/.test(text)) {
    failures.push(`${file}: platform-specific implementation leaked into core`);
  }
  if (file.endsWith("render.ts") && /["']ChatGPT["']/.test(text))
    failures.push(`${file}: hard-coded assistant label`);
}
const main = readFileSync(path.join(root, "src/main.ts"), "utf8");
if (/from\s+["'][^"']*providers\/(?!(?:index|types)(?:\.ts)?["'])/.test(main))
  failures.push("UI imports a concrete provider module");
const registry = readFileSync(path.join(root, "src/providers/index.ts"), "utf8");
if (!/const adapters[^=]*=\s*\[chatgptAdapter\]/.test(registry))
  failures.push("v0.1 registry must contain only chatgptAdapter");
for (const entry of readdirSync(path.join(root, "src/providers"), { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name !== "chatgpt")
    failures.push(`Unexpected production provider folder: ${entry.name}`);
}
const manifest = JSON.parse(readFileSync(path.join(root, "public/manifest.json"), "utf8"));
const allowed = ["activeTab", "scripting", "clipboardWrite", "downloads"].sort();
if (
  JSON.stringify([...(manifest.permissions ?? [])].sort((a, b) => a.localeCompare(b))) !==
  JSON.stringify(allowed)
)
  failures.push("Unexpected permissions");
for (const key of [
  "host_permissions",
  "optional_host_permissions",
  "optional_permissions",
  "background",
  "content_scripts",
  "options_page",
  "options_ui",
]) {
  if (key in manifest) failures.push(`Unexpected manifest field ${key}`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `BOUNDARIES OK: ${core.length} core modules, one explicit ChatGPT adapter, unchanged permissions. Static smoke check only, not type, business or live-site verification.`,
  );
}
