import { afterEach, expect, it, vi } from "vitest";

const { read, assertCurrent } = vi.hoisted(() => ({ read: vi.fn(), assertCurrent: vi.fn() }));
vi.mock("../src/providers", () => ({
  resolveAdapter: () => ({ provider: { id: "synthetic" }, read }),
}));

function setup() {
  vi.useFakeTimers();
  vi.resetModules();
  const status = { textContent: "" };
  const title = { textContent: "" };
  let close = () => {};
  vi.stubGlobal("document", { querySelector: (id: string) => (id === "#status" ? status : title) });
  vi.stubGlobal("window", {
    addEventListener: (_: string, callback: () => void) => {
      close = callback;
    },
  });
  const query = vi.fn().mockResolvedValue([{ id: 7, url: "https://chatgpt.com/c/synthetic" }]);
  vi.stubGlobal("chrome", { tabs: { query } });
  assertCurrent.mockReset().mockResolvedValue(undefined);
  read.mockReset().mockResolvedValue({
    conversation: {
      source: { provider: { id: "synthetic", label: "Synthetic" }, conversationId: "synthetic" },
      title: "Synthetic",
      coverage: "complete",
      messages: [{ body: "Synthetic" }],
    },
    assertCurrent,
  });
  return { status, title, query, close: () => close() };
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
      conversation: {
        source: { provider: { id: "synthetic", label: "Synthetic" }, conversationId: "synthetic" },
        title: "Synthetic",
        coverage: "complete",
        messages: [{ body: "Synthetic" }],
      },
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
