import { afterEach, describe, expect, it, vi } from "vitest";
import { assertCaptureCurrent, captureCurrentConversation } from "../src/providers/chatgpt/capture";

const context = { tabId: 7, url: new URL("https://chatgpt.com/c/synthetic-conversation") };
const probe = {
  conversationId: "synthetic-conversation",
  pathname: "/c/synthetic-conversation",
  visibleMessageIds: ["synthetic-message"],
  generating: false,
  signature: "synthetic-signature",
};

function inject(result: unknown) {
  const executeScript = vi.fn().mockResolvedValue(result);
  vi.stubGlobal("chrome", { scripting: { executeScript } });
  return executeScript;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("capture boundary", () => {
  it.each([
    "https://chatgpt.com/",
    "https://chatgpt.com/share/synthetic",
    "https://chatgpt.com/c/synthetic/other",
    "https://chatgpt.com/c/%2e%2e",
    "https://chatgpt.com.evil.test/c/synthetic",
    "https://chatgpt.com:444/c/synthetic",
    "https://user@chatgpt.com/c/synthetic",
  ])("rejects unsupported route before injection: %s", async (url) => {
    const execute = inject([]);
    await expect(
      captureCurrentConversation({ ...context, url: new URL(url) }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_PAGE" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("injects only the top frame in MAIN and returns a valid envelope", async () => {
    const capture = { payload: {}, probe };
    const execute = inject([{ frameId: 0, result: { ok: true, capture } }]);
    await expect(captureCurrentConversation(context)).resolves.toEqual(capture);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 7, frameIds: [0] },
        world: "MAIN",
        args: ["synthetic-conversation", "capture"],
      }),
    );
  });

  it.each(
    [
      [],
      [{ frameId: 1, result: { ok: true } }],
      [{ frameId: 0, result: { ok: true, capture: { payload: {}, probe: {} } } }],
      [{ frameId: 0, result: { ok: false, code: "secret server error" } }],
    ].map((response) => ({ response })),
  )("rejects malformed script responses", async ({ response }) => {
    inject(response);
    await expect(captureCurrentConversation(context)).rejects.toMatchObject({
      code: "READ_FAILED",
    });
  });

  it("does not expose native errors", async () => {
    const execute = inject([]);
    execute.mockRejectedValue(new Error("private token body"));
    await expect(captureCurrentConversation(context)).rejects.toMatchObject({
      code: "READ_FAILED",
      message: "无法读取这段对话，请稍后重试",
    });
  });

  it("times out a script that never settles", async () => {
    vi.useFakeTimers();
    const execute = inject([]);
    execute.mockReturnValue(new Promise(() => {}));
    const assertion = expect(captureCurrentConversation(context)).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("revalidates with the same tab and probe-only mode", async () => {
    const execute = inject([{ frameId: 0, result: { ok: true, probe } }]);
    await expect(assertCaptureCurrent(context, probe)).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 7, frameIds: [0] },
        args: ["synthetic-conversation", "probe"],
      }),
    );
  });

  it("rejects a changed snapshot", async () => {
    inject([{ frameId: 0, result: { ok: true, probe: { ...probe, signature: "changed" } } }]);
    await expect(assertCaptureCurrent(context, probe)).rejects.toMatchObject({
      code: "PAGE_CHANGED",
    });
  });
});
