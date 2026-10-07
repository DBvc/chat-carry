import { afterEach, expect, it, vi } from "vitest";
import { ExportError } from "../src/core/model";

const { read, assertCurrent } = vi.hoisted(() => ({ read: vi.fn(), assertCurrent: vi.fn() }));
vi.mock("../src/providers", () => ({
  resolveAdapter: () => ({ provider: { id: "synthetic" }, read }),
}));

function conversation() {
  return {
    source: { provider: { id: "synthetic", label: "Synthetic" }, conversationId: "synthetic" },
    title: "Synthetic",
    coverage: "complete",
    messages: [{ id: "synthetic", role: "user", body: "Synthetic", format: "plain" }],
    warnings: [],
  };
}

function setup() {
  vi.useFakeTimers();
  vi.resetModules();
  class Element extends EventTarget {
    textContent = "";
    title = "";
    value = "";
    disabled = false;
    hidden = true;
    dataset: Record<string, string> = {};
    focus() {
      dom.activeElement = this;
    }
    select = vi.fn();
    click() {
      if (!this.disabled) this.dispatchEvent(new Event("click"));
    }
  }
  const elements = Object.fromEntries(
    [
      "status",
      "conversation-title",
      "warning",
      "copy-button",
      "export-button",
      "retry",
      "manual",
      "manual-text",
    ].map((id) => [id, new Element()]),
  );
  const status = elements.status!;
  const title = elements["conversation-title"]!;
  const body = new Element();
  const dom = { body, activeElement: body, querySelector: (id: string) => elements[id.slice(1)] };
  let close = () => {};
  vi.stubGlobal("document", dom);
  vi.stubGlobal("window", {
    addEventListener: (_: string, callback: () => void) => {
      close = callback;
    },
  });
  const query = vi.fn().mockResolvedValue([{ id: 7, url: "https://chatgpt.com/c/synthetic" }]);
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const download = vi.fn().mockResolvedValue(7);
  const search = vi.fn().mockResolvedValue([{ id: 7, state: "in_progress" }]);
  const listeners = new Set<(delta: chrome.downloads.DownloadDelta) => void>();
  vi.stubGlobal("chrome", {
    tabs: { query },
    downloads: {
      download,
      search,
      onChanged: {
        addListener: (fn: (delta: chrome.downloads.DownloadDelta) => void) => listeners.add(fn),
        removeListener: (fn: (delta: chrome.downloads.DownloadDelta) => void) =>
          listeners.delete(fn),
      },
    },
  });
  assertCurrent.mockReset().mockResolvedValue(undefined);
  read.mockReset().mockResolvedValue({
    conversation: conversation(),
    assertCurrent,
  });
  return {
    status,
    title,
    query,
    elements,
    writeText,
    download,
    search,
    listeners,
    close: () => close(),
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("caps the whole popup preparation even when tab query never settles", async () => {
  const { status, query } = setup();
  query.mockReturnValue(new Promise(() => {}));
  await import("../src/main");
  await vi.advanceTimersByTimeAsync(15_000);
  expect(status.textContent).toBe("读取超时，请重新打开扩展重试");
  expect(read).not.toHaveBeenCalled();
});

it("does not reset the budget for the final probe or display a late result", async () => {
  const { status } = setup();
  let finish = () => {};
  assertCurrent.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  read.mockImplementationOnce(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    return {
      conversation: conversation(),
      assertCurrent,
    };
  });
  await import("../src/main");
  await vi.advanceTimersByTimeAsync(15_000);
  expect(status.textContent).toBe("读取超时，请重新打开扩展重试");
  finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(status.textContent).toBe("读取超时，请重新打开扩展重试");
});

it("discards a prepared snapshot when the popup has closed", async () => {
  const { status, close } = setup();
  let finish = () => {};
  assertCurrent.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await import("../src/main");
  await vi.advanceTimersByTimeAsync(0);
  close();
  finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(status.textContent).not.toContain("已读取");
  expect(vi.getTimerCount()).toBe(0);
});

it("prepares once, rechecks on every click and preserves copy focus", async () => {
  const app = setup();
  await import("../src/main");
  await vi.advanceTimersByTimeAsync(0);
  expect(app.writeText).not.toHaveBeenCalled();
  expect(app.download).not.toHaveBeenCalled();
  app.elements["copy-button"]!.focus();
  app.elements["copy-button"]!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(read).toHaveBeenCalledTimes(1);
  expect(assertCurrent).toHaveBeenCalledTimes(2);
  expect(app.writeText).toHaveBeenCalledExactlyOnceWith("Synthetic\n\n你：\nSynthetic\n");
  expect(app.status.textContent).toBe("纯文本已复制");
  expect(document.activeElement).toBe(app.elements["copy-button"]);
});

it("offers the identical prepared text after clipboard failure and keeps download available", async () => {
  const app = setup();
  app.writeText.mockRejectedValue(new Error("permission denied"));
  await import("../src/main");
  await vi.advanceTimersByTimeAsync(0);
  app.elements["copy-button"]!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(app.elements.manual!.hidden).toBe(false);
  expect(app.elements["manual-text"]!.value).toBe(app.writeText.mock.calls[0]![0]);
  expect(app.elements["manual-text"]!.select).toHaveBeenCalledOnce();
  expect(app.elements["export-button"]!.disabled).toBe(false);
  expect(app.status.textContent).not.toContain("已复制");
});

it("rejects changed pages before any delivery", async () => {
  const app = setup();
  await import("../src/main");
  await vi.advanceTimersByTimeAsync(0);
  assertCurrent.mockRejectedValueOnce(
    new ExportError("PAGE_CHANGED", "页面已变化，请重新读取对话"),
  );
  app.elements["copy-button"]!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(app.writeText).not.toHaveBeenCalled();
  expect(app.download).not.toHaveBeenCalled();
  expect(app.elements["copy-button"]!.disabled).toBe(true);
  expect(app.elements.retry!.hidden).toBe(false);
});

it("discards a late old read after timeout and retry", async () => {
  const app = setup();
  let finish!: (value: unknown) => void;
  read.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await import("../src/main");
  await vi.advanceTimersByTimeAsync(15_000);
  app.elements.retry!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(app.title.textContent).toBe("Synthetic");
  finish({ conversation: { ...conversation(), title: "stale result" }, assertCurrent });
  await vi.advanceTimersByTimeAsync(0);
  expect(app.title.textContent).toBe("Synthetic");
});

it("reports download start separately, handles only its ID and removes listeners", async () => {
  const app = setup();
  await import("../src/main");
  await vi.advanceTimersByTimeAsync(0);
  app.elements["export-button"]!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(app.status.textContent).toBe("已交给浏览器下载");
  expect(app.search).toHaveBeenCalledExactlyOnceWith({ id: 7 });
  for (const fn of app.listeners) fn({ id: 99, state: { current: "complete" } });
  expect(app.status.textContent).toBe("已交给浏览器下载");
  for (const fn of app.listeners)
    fn({ id: 7, state: { current: "interrupted" }, error: { current: "USER_CANCELED" } });
  expect(app.status.textContent).toBe("下载已取消，可重新导出");
  expect(app.listeners.size).toBe(0);
  app.search.mockResolvedValue([{ id: 7, state: "complete" }]);
  app.elements["export-button"]!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(app.status.textContent).toBe("Markdown 已下载");
  expect(app.listeners.size).toBe(0);
});

it("does not dispatch delivery after closing during the click-time probe", async () => {
  const app = setup();
  await import("../src/main");
  await vi.advanceTimersByTimeAsync(0);
  let finish!: () => void;
  assertCurrent.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  app.elements["export-button"]!.click();
  app.close();
  finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(app.download).not.toHaveBeenCalled();
  expect(app.writeText).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("leaves browser-owned downloads running when closing the popup", async () => {
  const app = setup();
  await import("../src/main");
  await vi.advanceTimersByTimeAsync(0);
  app.elements["export-button"]!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(app.listeners.size).toBe(1);
  app.close();
  expect(app.listeners.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
