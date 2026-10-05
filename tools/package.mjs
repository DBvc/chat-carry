import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
function localResource(reference, base = dist) {
  if (typeof reference !== "string" || !reference) throw new Error("Missing local resource path.");
  const pathname = decodeURIComponent(reference.split(/[?#]/)[0]);
  if (/^(?:[a-z][a-z\d+.-]*:|[\\/])/i.test(pathname) || pathname.includes("\\")) {
    throw new Error(`Invalid local resource path: ${reference}`);
  }
  const resolved = path.resolve(base, pathname);
  const relative = path.relative(dist, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Resource escapes dist: ${reference}`);
  }
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    throw new Error(`Missing local resource: ${reference}`);
  }
  return resolved;
}
function filesAt(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.isSymbolicLink()) throw new Error("Symlinks are not allowed in release input.");
      const name = `${prefix}${entry.name}`;
      return entry.isDirectory() ? filesAt(path.join(dir, entry.name), `${name}/`) : [name];
    })
    .sort();
}
const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipStored(entries) {
  const locals = [],
    central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const n = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0x0021, 12); // 1980-01-01, deterministic DOS date.
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    locals.push(local, n, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(0x0021, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += local.length + n.length + data.length;
  }
  const center = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(center.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, center, end]);
}
try {
  if (!existsSync(path.join(dist, "manifest.json"))) throw new Error("Build dist first.");
  const manifest = JSON.parse(readFileSync(path.join(dist, "manifest.json"), "utf8"));
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  if (manifest.manifest_version !== 3 || manifest.version !== pkg.version)
    throw new Error("Manifest/package version mismatch.");
  const allowed = ["activeTab", "scripting", "clipboardWrite", "downloads"].sort();
  if (
    JSON.stringify([...(manifest.permissions ?? [])].sort((a, b) => a.localeCompare(b))) !==
    JSON.stringify(allowed)
  )
    throw new Error("Unexpected production permissions.");
  for (const key of [
    "host_permissions",
    "optional_host_permissions",
    "optional_permissions",
    "background",
    "content_scripts",
    "options_page",
    "options_ui",
    "key",
    "externally_connectable",
  ]) {
    if (key in manifest) throw new Error(`Unexpected production manifest field: ${key}`);
  }
  const popup = manifest.action?.default_popup;
  const popupPath = localResource(popup);
  const names = filesAt(dist);
  if (names.length > 65535) throw new Error("Too many ZIP entries.");
  for (const name of names) {
    if (/(^|\/)(node_modules|tests|fixtures|ui)(\/|$)|\.env|\.map$/.test(name))
      throw new Error(`Forbidden release file: ${name}`);
    if (/\.(js|html|json)$/.test(name)) {
      const text = readFileSync(path.join(dist, name), "utf8");
      if (/NOT_IMPLEMENTED|等待 Codex|工程起点|DEMO_ONLY/.test(text))
        throw new Error(`Starter/demo code remains: ${name}`);
    }
  }
  for (const name of filesAt(path.join(root, "src"))) {
    if (/NOT_IMPLEMENTED/.test(readFileSync(path.join(root, "src", name), "utf8")))
      throw new Error(`Remove implementation stubs before releasing: src/${name}`);
  }
  const html = readFileSync(popupPath, "utf8");
  for (const match of html.matchAll(/(?:src|href)\s*=\s*(["'])(.*?)\1/g)) {
    const url = match[2];
    if (!url.startsWith("#") && !url.startsWith("data:"))
      localResource(url, path.dirname(popupPath));
  }
  const entries = names.map((name) => [name, readFileSync(path.join(dist, name))]);
  mkdirSync(path.join(root, "release"), { recursive: true });
  const output = path.join(root, "release", `chatcarry-${pkg.version}.zip`);
  writeFileSync(output, zipStored(entries));
  console.log(`Packaged ${entries.length} files: ${output}`);
  console.log(
    "Packaging is not proof that tests or live ChatGPT verification passed. See IMPLEMENTATION_REPORT.md.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
