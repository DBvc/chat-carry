import { expect } from "@playwright/test";
import { extensionTests } from "./extension-fixture";

const test = extensionTests();

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
    await expect(page.getByRole("status")).toHaveText("请打开受支持的已保存对话");
    await expect(page.locator(".popup")).toHaveCSS("width", "336px");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`foundation-${colorScheme}.png`) });
    expect(errors).toEqual([]);
    expect(remoteRequests).toEqual([]);
  });
}
