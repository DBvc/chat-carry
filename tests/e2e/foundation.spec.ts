import { createHash, generateKeyPairSync } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test as base } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";

interface ExtensionFixture {
  context: BrowserContext;
  popupUrl: string;
}

const productionDist = fileURLToPath(new URL("../../dist", import.meta.url));
const test = base.extend<{ extension: ExtensionFixture }>({
  extension: async ({ browserName }, use) => {
    expect(browserName).toBe("chromium");
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "chatcarry-foundation-"));
    const extensionPath = path.join(temporaryRoot, "dist-test");
    let context: BrowserContext | undefined;

    try {
      // Test the production Vite output. Only the test copy receives a public key;
      // no worker, host permissions, mock logic, or production files are added.
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
        JSON.stringify({ ...manifest, key: publicDer.toString("base64") }),
      );
      expect(await readFile(path.join(productionDist, "manifest.json"), "utf8")).toBe(
        originalManifest,
      );

      context = await chromium.launchPersistentContext(path.join(temporaryRoot, "profile"), {
        channel: "chromium",
        headless: true,
        viewport: { width: 336, height: 640 },
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
      });
      await use({ context, popupUrl: `chrome-extension://${extensionId}/${popup}` });
    } finally {
      await context?.close();
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  },
});

// Opening an extension page in a normal tab checks bundled HTML, JS, CSS, and CSP.
// It does not verify toolbar activation, activeTab, clipboard, downloads, or popup
// closure. Those remain separate business and real-browser acceptance checks.
for (const colorScheme of ["light", "dark"] as const) {
  test(`production shell loads without enabling business actions (${colorScheme})`, async ({
    extension,
  }, testInfo) => {
    const remoteRequests: string[] = [];
    const errors: string[] = [];
    await extension.context.route(/^https?:\/\//, async (route) => {
      remoteRequests.push(route.request().url());
      await route.abort();
    });
    const page = await extension.context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.emulateMedia({ colorScheme });
    await page.goto(extension.popupUrl);

    await expect(page.getByRole("heading", { name: "ChatCarry", exact: true })).toBeVisible();
    await expect(page.getByRole("button")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "复制纯文本", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "导出 Markdown", exact: true })).toBeDisabled();
    await expect(page.getByRole("status")).toHaveText("工程起点：等待 Codex 完成真实数据接入");
    await expect(page.locator(".popup")).toHaveCSS("width", "336px");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`foundation-${colorScheme}.png`) });
    expect(errors).toEqual([]);
    expect(remoteRequests).toEqual([]);
  });
}
