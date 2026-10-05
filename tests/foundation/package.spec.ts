import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "chatcarry-package-"));
  temporaryRoots.push(root);
  mkdirSync(path.join(root, "tools"));
  mkdirSync(path.join(root, "src"));
  mkdirSync(path.join(root, "dist", "assets"), { recursive: true });
  cpSync(path.join(repository, "tools/package.mjs"), path.join(root, "tools/package.mjs"));
  const manifest = readFileSync(path.join(repository, "public/manifest.json"));
  const { version } = JSON.parse(manifest.toString("utf8")) as { version: string };
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ version }));

  // Deliberately synthetic, isolated release input; this is not a product build.
  const entries = new Map([
    ["manifest.json", manifest],
    [
      "index.html",
      Buffer.from(
        '<!doctype html><script src="./assets/popup.js"></script><link href="./assets/popup.css" rel="stylesheet">',
      ),
    ],
    ["assets/popup.js", Buffer.from('document.title = "中文🧩";\n')],
    ["assets/popup.css", Buffer.from("body { margin: 0; }\n")],
  ]);
  for (const [name, bytes] of entries) writeFileSync(path.join(root, "dist", name), bytes);
  writeFileSync(path.join(root, "src/entry.ts"), "export {};\n");

  return {
    root,
    entries,
    output: path.join(root, "release", `chatcarry-${version}.zip`),
    run: () =>
      spawnSync(process.execPath, [path.join(root, "tools/package.mjs")], {
        cwd: root,
        encoding: "utf8",
      }),
  };
}

function readStoredArchive(archive: Buffer): Map<string, Buffer> {
  const end = archive.length - 22;
  expect(archive.readUInt32LE(end)).toBe(0x06054b50);
  const count = archive.readUInt16LE(end + 10);
  let cursor = archive.readUInt32LE(end + 16);
  expect(cursor + archive.readUInt32LE(end + 12)).toBe(end);
  const entries = new Map<string, Buffer>();

  for (let index = 0; index < count; index++) {
    expect(archive.readUInt32LE(cursor)).toBe(0x02014b50);
    expect(archive.readUInt16LE(cursor + 10)).toBe(0); // Stored, not compressed.
    const checksum = archive.readUInt32LE(cursor + 16);
    const size = archive.readUInt32LE(cursor + 24);
    expect(archive.readUInt32LE(cursor + 20)).toBe(size);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const name = archive.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    const local = archive.readUInt32LE(cursor + 42);
    expect(archive.readUInt32LE(local)).toBe(0x04034b50);
    expect(archive.readUInt32LE(local + 14)).toBe(checksum);
    expect(archive.readUInt32LE(local + 18)).toBe(size);
    expect(archive.readUInt32LE(local + 22)).toBe(size);
    const localNameLength = archive.readUInt16LE(local + 26);
    expect(archive.subarray(local + 30, local + 30 + localNameLength).toString("utf8")).toBe(name);
    const dataStart = local + 30 + localNameLength + archive.readUInt16LE(local + 28);
    const data = archive.subarray(dataStart, dataStart + size);
    expect(data.length).toBe(size);
    expect(crc32(data)).toBe(checksum);
    expect(entries.has(name)).toBe(false);
    entries.set(name, data);
    cursor +=
      46 + nameLength + archive.readUInt16LE(cursor + 30) + archive.readUInt16LE(cursor + 32);
  }
  expect(cursor).toBe(end);
  return entries;
}

describe("release packaging infrastructure (synthetic input only)", () => {
  it("refuses source stubs even if bundling removed them from dist", () => {
    const project = fixture();
    writeFileSync(path.join(project.root, "src/entry.ts"), 'throw new Error("NOT_IMPLEMENTED");\n');
    const result = project.run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Remove implementation stubs before releasing");
    expect(existsSync(project.output)).toBe(false);
  });

  it("refuses demonstration output even when source has no stubs", () => {
    const project = fixture();
    writeFileSync(
      path.join(project.root, "dist/assets/popup.js"),
      'document.title = "工程起点";\n',
    );
    const result = project.run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Starter/demo code remains");
    expect(existsSync(project.output)).toBe(false);
  });

  it("refuses a popup entry outside dist even when the file exists", () => {
    const project = fixture();
    const manifestPath = path.join(project.root, "dist/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.action = { default_popup: "../outside.html" };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    writeFileSync(path.join(project.root, "outside.html"), "<!doctype html><title>Outside</title>");
    const result = project.run();
    expect(result.status).toBe(1);
    expect(existsSync(project.output)).toBe(false);
  });

  it("refuses a popup asset outside dist even when the file exists", () => {
    const project = fixture();
    writeFileSync(
      path.join(project.root, "dist/index.html"),
      '<script src="../outside.js"></script>',
    );
    writeFileSync(path.join(project.root, "outside.js"), 'document.title = "Outside";');
    const result = project.run();
    expect(result.status).toBe(1);
    expect(existsSync(project.output)).toBe(false);
  });

  it("refuses optional host permissions in production", () => {
    const project = fixture();
    const manifestPath = path.join(project.root, "dist/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.optional_host_permissions = ["https://example.invalid/*"];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const result = project.run();
    expect(result.status).toBe(1);
    expect(existsSync(project.output)).toBe(false);
  });

  it("packages only dist at ZIP root with intact bytes, CRCs, and reproducible output", () => {
    const project = fixture();
    writeFileSync(path.join(project.root, "private-note.txt"), "Must not be released.");
    const firstRun = project.run();
    expect(firstRun.stderr).toBe("");
    expect(firstRun.status).toBe(0);
    const firstArchive = readFileSync(project.output);
    expect(readStoredArchive(firstArchive)).toEqual(project.entries);
    expect(project.run().status).toBe(0);
    expect(readFileSync(project.output)).toEqual(firstArchive);
  });
});
