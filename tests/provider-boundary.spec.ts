import { describe, expect, it } from "vitest";
import { resolveAdapter } from "../src/providers";
import { assertExportable, ExportError } from "../src/core/model";
import type { Conversation } from "../src/core/model";
import { renderMarkdown, renderText } from "../src/core/render";

// A normalized fixture, not a second runtime adapter or a claimed integration.
function sample(): Conversation {
  return {
    source: {
      provider: { id: "fixture-ai", label: "Fixture AI" },
      conversationId: "fixture-thread",
    },
    title: "跨平台契约",
    coverage: "complete",
    messages: [
      { id: "u1", role: "user", body: "保留 a_b 与 *", format: "plain" },
      { id: "a1", role: "assistant", body: "**保留原样** a_b", format: "plain" },
      { id: "a2", role: "assistant", body: "**结构化正文**", format: "markdown" },
    ],
    warnings: [],
  };
}

describe("explicit platform selection", () => {
  it("recognizes ChatGPT origins without selecting a source in the UI", () => {
    expect(resolveAdapter(new URL("https://chatgpt.com/c/test"))?.provider.id).toBe("chatgpt");
    // Home recognition is not permission to export a non-conversation route.
    expect(resolveAdapter(new URL("https://chatgpt.com/"))?.provider.id).toBe("chatgpt");
  });
  for (const url of [
    "https://chat.deepseek.com/a/chat/s/test",
    "https://claude.ai/chat/test",
    "https://grok.com/c/test",
    "https://gemini.google.com/app/test",
    "https://chatgpt.com.evil.example/c/test",
    "https://chatgpt.com@evil.example/c/test",
    "https://evil.example/?next=https://chatgpt.com/c/test",
    "http://chatgpt.com/c/test",
    "https://user:pass@chatgpt.com/c/test",
    "https://chatgpt.com:8443/c/test",
  ]) {
    it(`does not route an unsupported origin: ${url}`, () => {
      expect(resolveAdapter(new URL(url))).toBeUndefined();
    });
  }
});

describe("provider-neutral output", () => {
  it("uses the supplied provider label instead of a ChatGPT constant", () => {
    for (const output of [renderMarkdown(sample()), renderText(sample())]) {
      expect(output).toContain("Fixture AI");
      expect(output).not.toContain("ChatGPT");
      expect(output).not.toContain("fixture-thread");
    }
  });
  it("treats plain content as literal regardless of assistant role", () => {
    const text = renderText(sample());
    expect(text).toContain("保留 a_b 与 *");
    expect(text).toContain("**保留原样** a_b");
    expect(text).toContain("结构化正文");
    expect(text).not.toContain("**结构化正文**");
  });
  for (const coverage of ["partial", "unknown"] as const) {
    it(`blocks ${coverage} snapshots without silent success`, () => {
      const value = { ...sample(), coverage };
      try {
        assertExportable(value);
        throw new Error("Expected INCOMPLETE_CAPTURE");
      } catch (error) {
        expect(error).toBeInstanceOf(ExportError);
        if (!(error instanceof ExportError)) throw error;
        expect(error.code).toBe("INCOMPLETE_CAPTURE");
      }
      expect(() => renderMarkdown(value)).toThrow(ExportError);
      expect(() => renderText(value)).toThrow(ExportError);
    });
  }
  it("does not equate a media warning with missing supported text", () => {
    const value = sample();
    value.warnings.push("图片未包含在导出中");
    expect(() => assertExportable(value)).not.toThrow();
  });
});
