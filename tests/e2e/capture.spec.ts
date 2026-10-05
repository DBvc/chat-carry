import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { extensionTests } from "./extension-fixture";
import type { ExtensionFixture } from "./extension-fixture";
import type { Capture } from "../../src/providers/chatgpt/capture";
import { normalizeConversation } from "../../src/providers/chatgpt/normalize";

const test = extensionTests(["https://chatgpt.com/*"]);
const conversationId = "fixture-conversation";
const conversationUrl = `https://chatgpt.com/c/${conversationId}`;
const privateSentinel = "synthetic-private-metadata-must-stay-in-page";
const token = "synthetic-session-token-must-stay-in-page";

interface InjectionObservation {
  world: string | undefined;
  target: chrome.scripting.InjectionTarget;
  args: unknown[];
  results: unknown[];
  frameIds: number[];
}

interface BrowserObservations {
  injections: InjectionObservation[];
  deliveries: string[];
}

interface Scenario {
  modernIds?: boolean;
  noMessageIds?: boolean;
  generating?: boolean;
  branchConflict?: boolean;
  invalidParent?: boolean;
  oversized?: boolean;
  status?: number;
  htmlResponse?: boolean;
  redirect?: boolean;
  stallConversation?: boolean;
  beforeConversationReply?: (page: Page) => Promise<void>;
  beforeProbe?: (page: Page) => Promise<void>;
  changePayload?: (payload: ReturnType<typeof conversationPayload>) => void;
}

function conversationPayload(branchConflict = false, invalidParent = false) {
  const message = (id: string, role: string, text: string) => ({
    id,
    author: { role, name: privateSentinel, metadata: { private: privateSentinel } },
    content: { content_type: "text", parts: [text], private: privateSentinel },
    status: "finished_successfully",
    metadata: { private: privateSentinel },
    private: privateSentinel,
    ...(role === "assistant" ? { channel: "final", recipient: "all", end_turn: true } : {}),
  });
  return {
    title: "合成测试对话 🧪",
    conversation_id: conversationId,
    current_node: "node-assistant",
    private: privateSentinel,
    accessToken: token,
    mapping: {
      root: { parent: null, children: ["node-hidden"], message: null, private: privateSentinel },
      "node-hidden": {
        parent: "root",
        children: ["node-user"],
        message: {
          ...message("internal-id", "assistant", privateSentinel),
          channel: undefined,
          content: { content_type: "thoughts", thoughts: [{ summary: privateSentinel }] },
        },
      },
      "node-user": {
        parent: invalidParent ? 42 : "node-hidden",
        children: branchConflict ? ["node-assistant", "node-old"] : ["node-assistant"],
        message: message("user-1", "user", "合成用户消息"),
        private: privateSentinel,
      },
      "node-assistant": {
        parent: "node-user",
        children: [],
        message: message("assistant-1", "assistant", "合成助手消息"),
      },
      ...(branchConflict
        ? {
            "node-old": {
              parent: "node-user",
              children: [],
              message: message("assistant-old", "assistant", privateSentinel),
            },
          }
        : {}),
    },
  };
}

function syntheticPage(scenario: Scenario) {
  const assistantId = scenario.branchConflict ? "assistant-old" : "assistant-1";
  const ids = scenario.modernIds
    ? `data-chatgpt-search-message-ids="${assistantId} ${assistantId}"`
    : `data-message-id="${assistantId}"`;
  const html = `<!doctype html><html><head><meta charset="UTF-8"><link rel="icon" href="data:,"></head><body>
    <aside data-message-id="sidebar-message">侧栏不属于当前对话</aside>
    <main>
      <div data-message-author-role="user" data-message-id="user-1">合成用户消息</div>
      <article ${ids}><div data-message-author-role="assistant"
        ${scenario.modernIds ? `data-message-id="${assistantId}"` : ""}>合成助手消息</div></article>
      <div data-message-id="hidden-message" hidden>隐藏分支</div>
      <div data-message-id="css-hidden-message" style="display:none">隐藏分支</div>
      ${scenario.generating ? '<button data-testid="stop-button" aria-label="Stop streaming">停止</button>' : ""}
      <iframe src="/synthetic-frame" title="不应注入子框架"></iframe>
    </main>
  </body></html>`;
  return scenario.noMessageIds
    ? html.replace(/ data-(?:message-id|chatgpt-search-message-ids)="[^"]*"/g, "")
    : html;
}

async function observeProductionCalls(popup: Page, fixtureUrl: string) {
  await popup.addInitScript(
    ({ selectedUrl }) => {
      // Only tab selection is substituted. MAIN functions, arguments, results and
      // their serialization still go through Chromium's actual scripting API.
      const query = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = ((info: chrome.tabs.QueryInfo) =>
        query(info.active ? { url: selectedUrl } : info)) as typeof chrome.tabs.query;

      const observations: BrowserObservations = { injections: [], deliveries: [] };
      Object.assign(window, { chatcarryTest: observations });
      const execute = chrome.scripting.executeScript.bind(chrome.scripting);
      chrome.scripting.executeScript = (async (
        injection: chrome.scripting.ScriptInjection<unknown[], unknown>,
      ) => {
        const observation: InjectionObservation = {
          world: injection.world,
          target: injection.target,
          args: "args" in injection ? injection.args : [],
          results: [],
          frameIds: [],
        };
        observations.injections.push(observation);
        if (observation.args[1] === "probe") {
          // The test changes the real page just before the real probe runs. It
          // does not substitute the function, probe result or captured snapshot.
          await (
            window as Window & { chatcarryBeforeProbe?: () => Promise<void> }
          ).chatcarryBeforeProbe?.();
        }
        const results = await execute(injection);
        observation.results = results.map((result) => result.result as unknown);
        observation.frameIds = results.map((result) => result.frameId);
        return results;
      }) as typeof chrome.scripting.executeScript;

      // Guard the test machine as well as assert B06: preparation has no delivery.
      navigator.clipboard.writeText = async () => {
        observations.deliveries.push("clipboard");
        throw new Error("Unexpected clipboard write while only preparing a snapshot.");
      };
      chrome.downloads.download = (async () => {
        observations.deliveries.push("download");
        throw new Error("Unexpected download while only preparing a snapshot.");
      }) as typeof chrome.downloads.download;
    },
    { selectedUrl: fixtureUrl },
  );
}

async function observations(popup: Page): Promise<BrowserObservations> {
  return popup.evaluate(() => {
    const result = (window as Window & { chatcarryTest?: BrowserObservations }).chatcarryTest;
    if (!result) throw new Error("Test observations were not installed.");
    return result;
  });
}

async function openScenario(extension: ExtensionFixture, scenario: Scenario = {}) {
  const apiRequests: string[] = [];
  const unexpectedRequests: string[] = [];
  const errors: string[] = [];
  let conversationRequestAt = 0;
  const chatPage = await extension.context.newPage();
  await extension.context.route(/^https?:\/\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.href === conversationUrl && request.isNavigationRequest()) {
      await route.fulfill({ contentType: "text/html", body: syntheticPage(scenario) });
    } else if (url.href === "https://chatgpt.com/synthetic-frame") {
      await route.fulfill({
        contentType: "text/html",
        body: '<main><div data-message-id="iframe-message">子框架消息</div></main>',
      });
    } else if (url.href === "https://chatgpt.com/api/auth/session") {
      apiRequests.push(url.pathname);
      expect(request.method()).toBe("GET");
      await route.fulfill({
        json: { accessToken: token, user: { email: privateSentinel }, private: privateSentinel },
      });
    } else if (url.href === `https://chatgpt.com/backend-api/conversation/${conversationId}`) {
      apiRequests.push(url.pathname);
      conversationRequestAt = Date.now();
      expect(request.method()).toBe("GET");
      expect(request.headers().authorization).toBe(`Bearer ${token}`);
      await scenario.beforeConversationReply?.(chatPage);
      if (scenario.stallConversation) {
        // Leaving this route unresolved stalls the actual browser fetch until
        // the production AbortController cancels it, without changing timers.
        return;
      }
      if (scenario.redirect) {
        await route.fulfill({
          status: 302,
          headers: { location: "https://redirect.invalid/should-never-be-requested" },
          body: "",
        });
        return;
      }
      const payload = conversationPayload(scenario.branchConflict, scenario.invalidParent);
      scenario.changePayload?.(payload);
      if (scenario.oversized) payload.title = "x".repeat(16 * 1024 * 1024);
      await route.fulfill({
        status: scenario.status ?? 200,
        contentType: scenario.htmlResponse ? "text/html" : "application/json",
        body: scenario.htmlResponse
          ? "<!doctype html><title>Synthetic login page</title>"
          : JSON.stringify(payload),
      });
    } else {
      unexpectedRequests.push(url.href);
      await route.abort();
    }
  });
  await chatPage.goto(conversationUrl);
  const popup = await extension.context.newPage();
  if (scenario.beforeProbe) {
    await popup.exposeFunction("chatcarryBeforeProbe", () => scenario.beforeProbe?.(chatPage));
  }
  popup.on("pageerror", (error) => errors.push(error.message));
  popup.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await observeProductionCalls(popup, conversationUrl);
  await popup.goto(extension.popupUrl);
  return {
    popup,
    chatPage,
    apiRequests,
    unexpectedRequests,
    errors,
    conversationRequestAt: () => conversationRequestAt,
  };
}

async function expectNoDelivery(popup: Page) {
  await expect(popup.getByRole("button", { name: "复制纯文本", exact: true })).toBeDisabled();
  await expect(popup.getByRole("button", { name: "导出 Markdown", exact: true })).toBeDisabled();
  expect((await observations(popup)).deliveries).toEqual([]);
}

test("thinking preambles never leave the page or create a visible fork", async ({ extension }) => {
  const { popup } = await openScenario(extension, {
    branchConflict: true,
    noMessageIds: true,
    changePayload(payload) {
      const preamble = payload.mapping["node-hidden"].message;
      Object.assign(preamble, {
        content: { content_type: "text", parts: [privateSentinel] },
        end_turn: false,
      });
      Object.assign(preamble.metadata, { is_thinking_preamble_message: true });
      const alternative = payload.mapping["node-old"]!.message;
      Object.assign(alternative.metadata, {
        is_thinking_preamble_message: true,
        attachments: [{ id: privateSentinel, name: privateSentinel }],
      });
    },
  });
  await expect(popup.locator("#status")).toContainText("已读取 2 条消息");
  expect(JSON.stringify((await observations(popup)).injections)).not.toContain(privateSentinel);
  await expectNoDelivery(popup);
});

for (const text of ["有正文和附件", ""]) {
  test(`metadata attachments retain a placeholder with ${text ? "text" : "no text"}`, async ({
    extension,
  }) => {
    const { popup } = await openScenario(extension, {
      changePayload(payload) {
        payload.mapping["node-user"].message.content.parts = [text];
        Object.assign(payload.mapping["node-user"].message.metadata, {
          attachments: [
            { id: privateSentinel, name: privateSentinel, mime_type: "application/pdf" },
          ],
        });
      },
    });
    await expect(popup.locator("#status")).toContainText("已读取 2 条消息");
    const injections = (await observations(popup)).injections;
    expect(JSON.stringify(injections)).not.toContain(privateSentinel);
    // Inspect the real capture projection with the actual pure normalizer.
    const result = injections[0]!.results[0] as { capture: Capture };
    const conversation = normalizeConversation(result.capture);
    expect(conversation.messages[0]?.body).toBe(`${text}\n[附件未包含在导出中]\n`);
    expect(conversation.warnings).toEqual(["含图片/附件/音频，仅保留文字和占位说明"]);
    await expectNoDelivery(popup);
  });
}

for (const metadata of [
  { is_thinking_preamble_message: "true" },
  { attachments: "unknown attachment structure" },
  { attachments: [42] },
  { attachments: [{}] },
]) {
  test(`malformed relevant metadata is rejected: ${JSON.stringify(metadata)}`, async ({
    extension,
  }) => {
    const { popup } = await openScenario(extension, {
      changePayload(payload) {
        Object.assign(payload.mapping["node-user"].message.metadata, metadata);
      },
    });
    await expect(popup.locator("#status")).toContainText("会话数据格式无效");
    await expectNoDelivery(popup);
  });
}

for (const modernIds of [false, true]) {
  test(`production MAIN capture is private, top-frame only and probe-only on recheck (${modernIds ? "modern IDs" : "legacy IDs"})`, async ({
    extension,
  }) => {
    const result = await openScenario(extension, { modernIds });
    await expect(result.popup.getByRole("status")).toHaveText(
      "已读取 2 条消息 · 复制和导出将在下一步接入",
    );
    const observed = await observations(result.popup);
    expect(observed.injections.map((call) => call.args)).toEqual([
      [conversationId, "capture"],
      [conversationId, "probe"],
    ]);
    for (const call of observed.injections) {
      expect(call.world).toBe("MAIN");
      expect(call.target.allFrames).not.toBe(true);
      expect(call.frameIds).toEqual([0]);
    }
    expect(observed.injections[0]?.results).toMatchObject([
      {
        ok: true,
        capture: {
          payload: { title: "合成测试对话 🧪", conversation_id: conversationId },
          probe: { visibleMessageIds: ["user-1", "assistant-1"], generating: false },
        },
      },
    ]);
    const returned = JSON.stringify(observed.injections.map((call) => call.results));
    expect(returned).not.toContain(privateSentinel);
    expect(returned).not.toContain(token);
    expect(returned).not.toContain("accessToken");
    expect(result.apiRequests).toEqual([
      "/api/auth/session",
      `/backend-api/conversation/${conversationId}`,
    ]);
    expect(result.unexpectedRequests).toEqual([]);
    expect(result.errors).toEqual([]);
    await expectNoDelivery(result.popup);
  });
}

for (const scenario of [
  { name: "rate limit", options: { status: 429 }, code: "RATE_LIMITED" },
  { name: "HTML login response", options: { htmlResponse: true }, code: "READ_FAILED" },
] satisfies { name: string; options: Scenario; code: string }[]) {
  test(`production capture refuses ${scenario.name} without retrying`, async ({ extension }) => {
    const result = await openScenario(extension, scenario.options);
    await expect
      .poll(async () => (await observations(result.popup)).injections[0]?.results)
      .toEqual([{ ok: false, code: scenario.code }]);
    await expect(result.popup.getByRole("status")).not.toHaveText(/正在读取|已读取/);
    expect(result.apiRequests).toEqual([
      "/api/auth/session",
      `/backend-api/conversation/${conversationId}`,
    ]);
    expect((await observations(result.popup)).injections).toHaveLength(1);
    expect(result.unexpectedRequests).toEqual([]);
    expect(result.errors).toEqual([]);
    await expectNoDelivery(result.popup);
  });
}

test("production capture rejects a generating page before fetching", async ({ extension }) => {
  const result = await openScenario(extension, { generating: true });
  await expect(result.popup.getByRole("status")).toHaveText(/生成/);
  expect((await observations(result.popup)).injections[0]?.results).toEqual([
    { ok: false, code: "GENERATING" },
  ]);
  expect(result.apiRequests).toEqual([]);
  expect(result.unexpectedRequests).toEqual([]);
  await expectNoDelivery(result.popup);
});

test("production adapter refuses the visible alternate branch", async ({ extension }) => {
  const result = await openScenario(extension, { branchConflict: true, modernIds: true });
  await expect(result.popup.getByRole("status")).toHaveText(/分支/);
  expect((await observations(result.popup)).injections[0]?.results).toMatchObject([
    { ok: true, capture: { probe: { visibleMessageIds: ["user-1", "assistant-old"] } } },
  ]);
  expect((await observations(result.popup)).injections).toHaveLength(1);
  expect(result.unexpectedRequests).toEqual([]);
  await expectNoDelivery(result.popup);
});

test("production capture discards a response after the page changes route", async ({
  extension,
}) => {
  const result = await openScenario(extension, {
    beforeConversationReply: async (chatPage) => {
      await chatPage.evaluate(() => history.pushState({}, "", "/c/another-fixture"));
    },
  });
  await expect
    .poll(async () => (await observations(result.popup)).injections[0]?.results)
    .toEqual([{ ok: false, code: "PAGE_CHANGED" }]);
  await expect(result.popup.getByRole("status")).not.toHaveText(/正在读取|已读取/);
  expect((await observations(result.popup)).injections).toHaveLength(1);
  expect(result.apiRequests).toHaveLength(2);
  expect(result.unexpectedRequests).toEqual([]);
  await expectNoDelivery(result.popup);
});

test("production capture accepts a single chain without DOM message IDs", async ({ extension }) => {
  const result = await openScenario(extension, { noMessageIds: true });
  await expect(result.popup.getByRole("status")).toHaveText(
    "已读取 2 条消息 · 复制和导出将在下一步接入",
  );
  const observed = await observations(result.popup);
  expect(observed.injections.map((call) => call.args[1])).toEqual(["capture", "probe"]);
  expect(observed.injections[0]?.results).toMatchObject([
    { ok: true, capture: { probe: { visibleMessageIds: [] } } },
  ]);
  expect(result.apiRequests).toHaveLength(2);
  expect(result.unexpectedRequests).toEqual([]);
  await expectNoDelivery(result.popup);
});

test("production projection rejects a numeric parent instead of inventing a root", async ({
  extension,
}) => {
  const result = await openScenario(extension, { invalidParent: true });
  await expect
    .poll(async () => (await observations(result.popup)).injections[0]?.results)
    .toEqual([{ ok: false, code: "INVALID_DATA" }]);
  await expect(result.popup.getByRole("status")).toHaveText("会话数据格式无效，暂时无法读取");
  expect((await observations(result.popup)).injections).toHaveLength(1);
  expect(result.unexpectedRequests).toEqual([]);
  await expectNoDelivery(result.popup);
});

test("production capture rejects redirects without requesting another origin", async ({
  extension,
}) => {
  const result = await openScenario(extension, { redirect: true });
  await expect
    .poll(async () => (await observations(result.popup)).injections[0]?.results)
    .toEqual([{ ok: false, code: "READ_FAILED" }]);
  await expect(result.popup.getByRole("status")).toHaveText("无法读取这段对话，请稍后重试");
  expect(result.apiRequests).toEqual([
    "/api/auth/session",
    `/backend-api/conversation/${conversationId}`,
  ]);
  expect(result.unexpectedRequests).toEqual([]);
  await expectNoDelivery(result.popup);
});

async function changeSameLengthText(chatPage: Page) {
  await chatPage.evaluate(() => {
    const message = document.querySelector('[data-message-author-role="assistant"]');
    if (!message || message.textContent !== "合成助手消息")
      throw new Error("Expected synthetic assistant message was not found.");
    message.textContent = "改写助手消息";
  });
}

test("production capture detects equal-length edits while fetching", async ({ extension }) => {
  const result = await openScenario(extension, { beforeConversationReply: changeSameLengthText });
  await expect
    .poll(async () => (await observations(result.popup)).injections[0]?.results)
    .toEqual([{ ok: false, code: "PAGE_CHANGED" }]);
  await expect(result.popup.getByRole("status")).toHaveText("页面已变化，请重新读取对话");
  expect(result.apiRequests).toHaveLength(2);
  expect(result.unexpectedRequests).toEqual([]);
  await expectNoDelivery(result.popup);
});

test("production probe-only recheck rejects equal-length edits without fetching again", async ({
  extension,
}) => {
  const result = await openScenario(extension, { beforeProbe: changeSameLengthText });
  await expect(result.popup.getByRole("status")).toHaveText("页面已变化，请重新读取对话");
  const observed = await observations(result.popup);
  expect(observed.injections.map((call) => call.args[1])).toEqual(["capture", "probe"]);
  expect(observed.injections[0]?.results).toMatchObject([{ ok: true, capture: { probe: {} } }]);
  expect(observed.injections[1]?.results).toMatchObject([{ ok: true, probe: {} }]);
  expect(result.apiRequests).toEqual([
    "/api/auth/session",
    `/backend-api/conversation/${conversationId}`,
  ]);
  expect(result.unexpectedRequests).toEqual([]);
  await expectNoDelivery(result.popup);
});

test("production capture aborts an unfinished conversation fetch after twelve seconds", async ({
  extension,
}) => {
  test.setTimeout(20_000);
  const result = await openScenario(extension, { stallConversation: true });
  await expect
    .poll(async () => (await observations(result.popup)).injections[0]?.results, {
      timeout: 14_000,
      intervals: [100, 250],
    })
    .toEqual([{ ok: false, code: "TIMEOUT" }]);
  const elapsed = Date.now() - result.conversationRequestAt();
  expect(elapsed).toBeGreaterThanOrEqual(11_000);
  expect(elapsed).toBeLessThan(14_500);
  await expect(result.popup.getByRole("status")).toHaveText("读取超时，请重新打开扩展重试");
  expect(result.apiRequests).toHaveLength(2);
  expect((await observations(result.popup)).injections).toHaveLength(1);
  expect(result.unexpectedRequests).toEqual([]);
  await expectNoDelivery(result.popup);
});

test("production capture rejects a projection above the sixteen MiB budget", async ({
  extension,
}) => {
  const result = await openScenario(extension, { oversized: true });
  await expect
    .poll(async () => (await observations(result.popup)).injections[0]?.results)
    .toEqual([{ ok: false, code: "TOO_LARGE" }]);
  await expectNoDelivery(result.popup);
});
