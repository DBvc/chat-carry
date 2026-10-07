import { afterEach, describe, expect, it, vi } from "vitest";
import { renderMarkdown, renderText } from "../src/core/render";
import { copyPlainText, downloadMarkdown, safeFilename } from "../src/core/delivery";
import type { Conversation } from "../src/core/model";
import { markdown } from "../src/core/markdown";

function sample(body: string, format: "plain" | "markdown" = "markdown"): Conversation {
  return {
    source: { provider: { id: "fixture", label: "Fixture AI" }, conversationId: "private-id" },
    title: "中文 🧩",
    coverage: "complete",
    warnings: [],
    messages: [{ id: "message", role: "assistant", body, format }],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("output content", () => {
  it("rejects unknown parser tokens instead of silently dropping text", () => {
    const token = markdown.parse("must survive", {})[1]!;
    token.type = "future-block";
    vi.spyOn(markdown, "parse").mockReturnValueOnce([token]);
    expect(() => renderText(sample("must survive"))).toThrowError(
      expect.objectContaining({ code: "CONTENT_UNSUPPORTED" }),
    );
  });
  it("keeps Markdown and plain source bytes and escapes only headings", () => {
    const body = "```ts\r\n  const x = `a_b`;  \r\n```\r\n";
    const conversation = sample(body);
    conversation.title = "# title\n<img> [link]";
    expect(renderMarkdown(conversation)).toContain(body);
    expect(renderMarkdown(conversation).startsWith("# \\# title \\<img\\> \\[link\\]\n")).toBe(
      true,
    );
    expect(renderText(sample("  a_b * #\r\n", "plain"))).toContain("  a_b * #\r\n");
    expect(renderMarkdown(conversation)).not.toContain("private-id");
  });

  it("renders lists, tasks, links, tables, literal HTML and code without executing anything", () => {
    const body =
      "- outer\n  - inner\n- [x] done\n- [ ] todo\n\n3. third\n4. fourth\n\n[x](https://example.test/) <https://example.test/>\n\n| A | B |\n| - | - |\n| **C** | `D` |\n\n<img src=x onerror=alert(1)>\n\n`  a_b  `\n\n```ts\n  x();  \n\n  y();\n```\n\n$x^2$";
    const text = renderText(sample(body));
    for (const expected of [
      "• outer\n  • inner",
      "[x] done",
      "[ ] todo",
      "3. third\n4. fourth",
      "x (https://example.test/)",
      "A\tB\nC\tD",
      "<img src=x onerror=alert(1)>",
      "  a_b  ",
      "  x();  \n\n  y();",
      "$x^2$",
    ])
      expect(text).toContain(expected);
  });

  it("places warnings in both outputs and gives Markdown images an honest text placeholder", () => {
    const conversation = sample("![diagram](https://example.test/image.png)");
    conversation.warnings = ["附件未导出\n请查看原对话"];
    expect(renderMarkdown(conversation)).toContain("> 附件未导出\n> 请查看原对话");
    expect(renderText(conversation)).toContain("附件未导出\n请查看原对话");
    expect(renderText(conversation)).toContain("[图片未包含在纯文本中：diagram]");
  });

  it("recognizes task syntax before formatting and keeps ordered list numbers", () => {
    const source = "- `[x] code`\n- \\[x] literal\n- **[x]** bold\n\n3. [x] done\n4. next";
    expect(renderText(sample(source))).toBe(
      "中文 🧩\n\nFixture AI：\n• [x] code\n• [x] literal\n• [x] bold\n\n[x] done\n4. next\n",
    );
  });

  it.each([
    [String.raw`\(a_i + b_i\)`, String.raw`\(a_i + b_i\)`],
    [String.raw`\[\frac{1}{2}\]`, String.raw`\[\frac{1}{2}\]`],
    [String.raw`$\left\{x \mid x>0\right\}$`, String.raw`$\left\{x \mid x>0\right\}$`],
    [
      String.raw`$$\begin{pmatrix}a & b \\ c & d\end{pmatrix}$$`,
      String.raw`$$\begin{pmatrix}a & b \\ c & d\end{pmatrix}$$`,
    ],
    [String.raw`*before \(a*b\) after*`, String.raw`before \(a*b\) after`],
    [String.raw`**before $a**b$ after**`, String.raw`before $a**b$ after`],
    [String.raw`~~before \(a~~b\) after~~`, String.raw`before \(a~~b\) after`],
    [
      String.raw`\(\text{` +
        "`" +
        String.raw`} + x\) and ` +
        "`literal \\(`" +
        String.raw` then \(a*b\)`,
      String.raw`\(\text{` + "`" + String.raw`} + x\) and literal \( then \(a*b\)`,
    ],
    [
      String.raw`\(\text{` + "`" + String.raw`} + x\) then \(a*b\) and ` + "`code`",
      String.raw`\(\text{` + "`" + String.raw`} + x\) then \(a*b\) and code`,
    ],
    ["`\\(` then " + String.raw`\(a*b\)`, String.raw`\( then \(a*b\)`],
    [String.raw`[url](https://example.test/\(x\))`, "url (https://example.test/(x))"],
    [String.raw`<https://example.test/\(x\)>`, String.raw`https://example.test/\(x\)`],
    [String.raw`[\(a*b\)](https://example.test/)`, String.raw`\(a*b\) (https://example.test/)`],
    [
      String.raw`[\(unclosed](https://example.test/) tail \)`,
      "(unclosed (https://example.test/) tail )",
    ],
    ["\\[\n- \\alpha\n\n*x* + _y_\n\\]", "\\[\n- \\alpha\n\n*x* + _y_\n\\]"],
    ["$$\n- \\alpha\n\n*x* + _y_\n$$", "$$\n- \\alpha\n\n*x* + _y_\n$$"],
    ["> \\[\n> a_b\n> \\]", "\\[\na_b\n\\]"],
    [String.raw`价格 $5 **和** $10，\$20。`, "价格 $5 和 $10，$20。"],
    [
      String.raw`<span title="\(a*b\)">literal</span>`,
      String.raw`<span title="\(a*b\)">literal</span>`,
    ],
    [
      "| A | B |\n| - | - |\n| " + String.raw`\(a*b\)` + " | x |",
      "A\tB\n" + String.raw`\(a*b\)` + "\tx",
    ],
    [
      "| A | B |\n| - | - |\n| " + String.raw`$\left|x\right|$` + " | x |",
      "A\tB\n" + String.raw`$\left|x\right|$` + "\tx",
    ],
    [
      "| A | B |\n| - | - |\n| " + String.raw`$\left\|x\right\|$` + " | x |",
      "A\tB\n" + String.raw`$\left\|x\right\|$` + "\tx",
    ],
  ])("preserves math without changing surrounding Markdown: %s", (source, expected) => {
    expect(renderText(sample(source))).toBe(`中文 🧩\n\nFixture AI：\n${expected}\n`);
    expect(renderMarkdown(sample(source))).toContain(source);
    expect(renderText(sample(source, "plain"))).toBe(`中文 🧩\n\nFixture AI：\n${source}\n`);
  });

  it("does not repeatedly scan a long sequence of unclosed math delimiters", () => {
    const source = String.raw`\(`.repeat(128_000);
    const started = performance.now();
    expect(renderText(sample(source))).toBe(`中文 🧩\n\nFixture AI：\n${"(".repeat(128_000)}\n`);
    // The rejected implementation took over 18 seconds on this input.
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("rejects excessive block nesting instead of silently dropping body or trailing text", () => {
    const lists = (count: number) =>
      Array.from({ length: count }, (_, i) => "  ".repeat(i) + "- MUST_SURVIVE").join("\n");
    for (const body of [
      "> ".repeat(100) + "MUST_SURVIVE",
      lists(50),
      "> ".repeat(98) + "- MUST_SURVIVE",
    ])
      expect(() => renderText(sample(`${body}\n\nsuffix`))).toThrowError(
        expect.objectContaining({ code: "CONTENT_UNSUPPORTED" }),
      );
    for (const body of ["> ".repeat(99) + "MUST_SURVIVE", lists(49)]) {
      const text = renderText(sample(`${body}\n\nsuffix`));
      expect(text).toContain("MUST_SURVIVE");
      expect(text).toContain("suffix");
    }
  });

  it("bounds repeated rejected display blocks without hiding later valid math", () => {
    for (const source of [
      "\\[\n".repeat(16_384) + "\\] tail",
      "- \\[\n\n" + "  \\[\n\n".repeat(8_192) + "\\]",
    ]) {
      const started = performance.now();
      const text = renderText(sample(source + "\n\n\\[a_b\\]"));
      expect(text).toContain("\\[a_b\\]");
      expect(performance.now() - started).toBeLessThan(2_000);
    }
  });

  it("uses completed reference definitions before recovering formula table cells", () => {
    const table = "| A | B |\n| - | - |\n| [$x][ref] | $y$ |";
    for (const source of [table + "\n\n[ref]: /url", "[ref]: /url\n\n" + table])
      expect(renderText(sample(source))).toBe("中文 🧩\n\nFixture AI：\nA\tB\n$x (/url)\t$y$\n");
  });

  it("keeps table escapes outside math consistent with rows without math", () => {
    for (const first of ["x", "$x$", String.raw`$\|x\|$`]) {
      const source =
        "| A | B | C |\n| - | - | - |\n| " + first + ' | `a\\|b` | <span title="a\\|b">x</span> |';
      expect(renderText(sample(source))).toBe(
        `中文 🧩\n\nFixture AI：\nA\tB\tC\n${first}\ta|b\t<span title="a|b">x</span>\n`,
      );
    }
  });

  it("rejects outputs beyond the UTF-8 budget without truncating", () => {
    const conversation = sample("中".repeat(1_398_102), "plain");
    expect(() => renderText(conversation)).toThrowError(
      expect.objectContaining({ code: "TOO_LARGE" }),
    );
    expect(() => renderMarkdown(conversation)).toThrowError(
      expect.objectContaining({ code: "TOO_LARGE" }),
    );
  });
});

describe("delivery boundaries", () => {
  it("only writes validated nonempty text and propagates clipboard rejection", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await copyPlainText("中文 🧩");
    expect(writeText).toHaveBeenCalledExactlyOnceWith("中文 🧩");
    writeText.mockClear();
    for (const text of ["", " \n", "broken \ud800", "x".repeat(4 * 1024 * 1024 + 1)]) {
      await expect(copyPlainText(text)).rejects.toThrow();
    }
    expect(writeText).not.toHaveBeenCalled();
    writeText.mockRejectedValue(new Error("Denied"));
    await expect(copyPlainText("keep this text")).rejects.toThrow();
  });

  it("downloads well-formed UTF-8 at exactly 4 MiB using a safe unique filename", async () => {
    const download = vi.fn().mockResolvedValue(7);
    vi.stubGlobal("chrome", { downloads: { download } });
    const text = "中文🧩\\\n" + "x".repeat(4 * 1024 * 1024 - 12);
    expect(new TextEncoder().encode(text).byteLength).toBe(4 * 1024 * 1024);
    expect(await downloadMarkdown(text, "../../CON.exe")).toBe(7);
    const options = download.mock.calls[0]![0] as chrome.downloads.DownloadOptions;
    expect(decodeURIComponent(options.url.split(",")[1]!)).toBe(text);
    expect(options.filename).toMatch(/\.md$/);
    expect(options.filename).not.toMatch(/[\\/]/);
    expect(options.conflictAction).toBe("uniquify");
    expect(options).not.toHaveProperty("saveAs");
    download.mockClear();
    await expect(downloadMarkdown(text + "x", "test.md")).rejects.toThrowError(
      expect.objectContaining({ code: "TOO_LARGE" }),
    );
    expect(download).not.toHaveBeenCalled();
  });

  it("preserves Unicode filenames within both character and filesystem byte limits", () => {
    for (const title of [
      "🧩".repeat(180),
      "中".repeat(180),
      "CON.txt",
      "LPT1 ",
      "...",
      "a\u0085b",
    ]) {
      const result = safeFilename(title);
      expect(result.length).toBeLessThanOrEqual(180);
      expect(new TextEncoder().encode(result).length).toBeLessThanOrEqual(180);
      expect(() => encodeURIComponent(result)).not.toThrow();
      expect(result).not.toMatch(/^(CON|LPT1)(?:\.|$)/i);
    }
    expect(safeFilename(" ... ")).toBe("conversation.md");
    expect(safeFilename("中文 🧩.md")).toBe("中文 🧩.md");
  });
});
