import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import scenariosJson from "./fixtures/scenarios.json";
import { normalizeConversation } from "../src/providers/chatgpt/normalize";
import { renderMarkdown, renderText } from "../src/core/render";
import { safeFilename } from "../src/core/delivery";
import { ExportError } from "../src/core/model";
import type { ExportErrorCode } from "../src/core/model";
import type { Capture } from "../src/providers/chatgpt/capture";

interface Scenario {
  name: string;
  capture: Capture;
  expected: { messageIds?: string[]; errorCode?: ExportErrorCode };
}
const scenarios = scenariosJson as Scenario[];
function fixture(name: string): Scenario {
  const item = scenarios.find((entry) => entry.name === name);
  if (!item) throw new Error(`Fixture not found: ${name}`);
  return item;
}
function expected(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

describe("synthetic conversation contract (not a live API test)", () => {
  for (const scenario of scenarios) {
    it(scenario.name, () => {
      if (scenario.expected.errorCode) {
        let caught: unknown;
        try {
          normalizeConversation(scenario.capture);
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeInstanceOf(ExportError);
        if (!(caught instanceof ExportError)) throw new Error("Expected typed ExportError");
        expect(caught.code).toBe(scenario.expected.errorCode);
      } else {
        const result = normalizeConversation(scenario.capture);
        expect(result.messages.map((message) => message.id)).toEqual(scenario.expected.messageIds);
        expect(result.source.provider).toEqual({ id: "chatgpt", label: "ChatGPT" });
        expect(result.source.conversationId).toBe(scenario.capture.probe.conversationId);
        expect(result.coverage).toBe("complete");
        expect(
          result.messages.every((message) => ["plain", "markdown"].includes(message.format)),
        ).toBe(true);
      }
    });
  }
});

describe("hand-authored output expectations", () => {
  for (const [source, name] of [
    ["basic", "basic"],
    ["rich-text", "rich"],
  ]) {
    it(`${source}: Markdown`, () => {
      if (!source || !name) throw new Error("Invalid test definition");
      expect(renderMarkdown(normalizeConversation(fixture(source).capture))).toBe(
        expected(`expected-${name}.md`),
      );
    });
    it(`${source}: plain text`, () => {
      if (!source || !name) throw new Error("Invalid test definition");
      expect(renderText(normalizeConversation(fixture(source).capture))).toBe(
        expected(`expected-${name}.txt`),
      );
    });
  }
  it("keeps special citation syntax literal inside code", () => {
    const result = renderMarkdown(normalizeConversation(fixture("citation-outside-code").capture));
    expect(result).toContain("[引用见原对话]");
    expect(result).toContain("```text\nciteturn0search0\n```");
  });
  it("media produces an explicit warning, not an imaginary archive", () => {
    const result = normalizeConversation(fixture("media-placeholder").capture);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(renderMarkdown(result)).toContain("图片");
  });
});

describe("safe file names", () => {
  for (const title of ["中文与🧩", "../../secret", "CON", "a:b/c\\d?*", "x".repeat(500), ""]) {
    it(`safe title ${title.slice(0, 20)}`, () => {
      const name = safeFilename(title);
      expect(name).toMatch(/\.md$/);
      // Filename safety must reject literal control characters.
      // oxlint-disable-next-line no-control-regex
      expect(name).not.toMatch(/[\\/\u0000-\u001f<>:"|?*]/);
      expect(name).not.toMatch(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i);
      expect(name.length).toBeLessThanOrEqual(180);
    });
  }
});
