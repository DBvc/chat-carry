import { createHash, generateKeyPairSync } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test as base } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";

export interface ExtensionFixture {
  context: BrowserContext;
  popupUrl: string;
  downloadsPath: string;
}

const productionDist = fileURLToPath(new URL("../../dist", import.meta.url));
export function extensionTests(hostPermissions: string[] = []) {
  return base.extend<{ extension: ExtensionFixture }>({
    extension: async ({ browserName }, use) => {
      expect(browserName).toBe("chromium");
      const temporaryRoot = await mkdtemp(path.join(tmpdir(), "chatcarry-foundation-"));
      const extensionPath = path.join(temporaryRoot, "dist-test");
      const downloadsPath = path.join(temporaryRoot, "downloads");
      let context: BrowserContext | undefined;

      try {
        // Keep the production Vite JavaScript unchanged. Only the temporary copy
        // receives its public key and optional synthetic-origin test permissions.
        await cp(productionDist, extensionPath, { recursive: true });
        const manifestPath = path.join(extensionPath, "manifest.json");
        const originalManifest = await readFile(manifestPath, "utf8");
        const manifest = JSON.parse(originalManifest) as Record<string, unknown>;
        expect(manifest).not.toHaveProperty("key");
        expect(manifest).not.toHaveProperty("background");
        expect(manifest).not.toHaveProperty("host_permissions");

        const action = manifest.action as { default_popup?: unknown } | undefined;
        const popup = action?.default_popup;
        if (typeof popup !== "string") throw new Error("Built extension has no popup entry.");

        const { publicKey } = generateKeyPairSync("rsa", {
          modulusLength: 2048,
        });
        const publicDer = publicKey.export({ type: "spki", format: "der" });
        // Chromium's ID: SHA-256(public DER), first 16 bytes, hexadecimal mapped a-p.
        // https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/crx_file/id_util.cc
        const extensionId = createHash("sha256")
          .update(publicDer)
          .digest("hex")
          .slice(0, 32)
          .replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)));
        await writeFile(
          manifestPath,
          JSON.stringify({
            ...manifest,
            key: publicDer.toString("base64"),
            ...(hostPermissions.length > 0 ? { host_permissions: hostPermissions } : {}),
          }),
        );
        expect(await readFile(path.join(productionDist, "manifest.json"), "utf8")).toBe(
          originalManifest,
        );

        const profile = path.join(temporaryRoot, "profile");
        await mkdir(path.join(profile, "Default"), { recursive: true });
        await mkdir(downloadsPath, { recursive: true });
        await writeFile(
          path.join(profile, "Default", "Preferences"),
          JSON.stringify({
            download: { default_directory: downloadsPath, prompt_for_download: false },
          }),
        );
        context = await chromium.launchPersistentContext(profile, {
          channel: "chromium",
          headless: true,
          serviceWorkers: "block",
          downloadsPath,
          viewport: { width: 336, height: 640 },
          args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
          ],
        });
        const session = await context.newCDPSession(context.pages()[0]!);
        await session.send("Browser.setDownloadBehavior", {
          behavior: "allow",
          downloadPath: downloadsPath,
        });
        await session.detach();
        await use({
          context,
          popupUrl: `chrome-extension://${extensionId}/${popup}`,
          downloadsPath,
        });
      } finally {
        await context?.close();
        await rm(temporaryRoot, { recursive: true, force: true });
      }
    },
  });
}
