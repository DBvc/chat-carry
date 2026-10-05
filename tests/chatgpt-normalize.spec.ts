import { describe, expect, it } from "vitest";
import scenariosJson from "./fixtures/scenarios.json";
import { ExportError } from "../src/core/model";
import type { ExportErrorCode } from "../src/core/model";
import type { Capture } from "../src/providers/chatgpt/capture";
import { normalizeConversation } from "../src/providers/chatgpt/normalize";

interface TestMessage {
  id: string;
  author: { role: string };
  content: unknown;
  status?: unknown;
  metadata: { is_visually_hidden_from_conversation?: unknown };
  channel?: unknown;
  recipient?: unknown;
  end_turn?: unknown;
}
interface TestNode {
  parent: string | null;
  children: string[];
  message: TestMessage | null;
}
interface TestPayload {
  title: string;
  conversation_id: string;
  current_node: string;
  mapping: Record<string, TestNode>;
}

function message(id: string, role = "assistant", body = "正文"): TestMessage {
  return {
    id,
    author: { role },
    content: { content_type: "text", parts: [body] },
    status: "finished_successfully",
    metadata: {},
    ...(role === "assistant" ? { channel: "final", recipient: "all", end_turn: true } : {}),
  };
}

function sample(): Capture & { payload: TestPayload } {
  return {
    payload: {
      title: "合成测试",
      conversation_id: "fixture-conversation",
      current_node: "answer-key",
      mapping: {
        root: { parent: null, children: ["question-key"], message: null },
        "question-key": {
          parent: "root",
          children: ["answer-key"],
          message: message("question-id", "user"),
        },
        "answer-key": {
          parent: "question-key",
          children: [],
          message: message("answer-id"),
        },
      },
    },
    probe: {
      conversationId: "fixture-conversation",
      pathname: "/c/fixture-conversation",
      visibleMessageIds: ["question-id", "answer-id"],
      generating: false,
      signature: "synthetic-stable",
    },
  };
}

function node(capture: Capture & { payload: TestPayload }, key: string): TestNode {
  const value = capture.payload.mapping[key];
  if (!value) throw new Error("Missing synthetic node");
  return value;
}

function answer(capture: Capture & { payload: TestPayload }): TestMessage {
  const value = node(capture, "answer-key").message;
  if (!value) throw new Error("Missing synthetic message");
  return value;
}

function branch(): Capture & { payload: TestPayload } {
  const capture = sample();
  node(capture, "question-key").children.push("alternate-key");
  capture.payload.mapping["alternate-key"] = {
    parent: "question-key",
    children: [],
    message: message("alternate-id"),
  };
  return capture;
}

function expectCode(capture: Capture, code: ExportErrorCode): void {
  let caught: unknown;
  try {
    normalizeConversation(capture);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ExportError);
  if (!(caught instanceof ExportError)) throw new Error("Expected typed failure");
  expect(caught.code).toBe(code);
}

describe("ChatGPT normalization using unchanged synthetic fixtures", () => {
  for (const scenario of scenariosJson) {
    it(scenario.name, () => {
      if ("errorCode" in scenario.expected) {
        expectCode(scenario.capture, scenario.expected.errorCode as ExportErrorCode);
      } else {
        const result = normalizeConversation(scenario.capture);
        expect(result.messages.map((item) => item.id)).toEqual(scenario.expected.messageIds);
        expect(result.source).toEqual({
          provider: { id: "chatgpt", label: "ChatGPT" },
          conversationId: scenario.capture.probe.conversationId,
        });
        expect(result.coverage).toBe("complete");
      }
    });
  }
});

describe("selected-path proof", () => {
  it("accepts null root, distinct mapping keys and a single path without DOM IDs", () => {
    const capture = sample();
    capture.probe.visibleMessageIds = [];
    expect(normalizeConversation(capture).messages.map((item) => item.id)).toEqual([
      "question-id",
      "answer-id",
    ]);
  });

  it("rejects only a shared ancestor as evidence of a regenerated version", () => {
    const capture = branch();
    capture.probe.visibleMessageIds = ["question-id"];
    expectCode(capture, "INCOMPLETE_CAPTURE");
  });

  it("rejects a branch with no visible IDs", () => {
    const capture = branch();
    capture.probe.visibleMessageIds = [];
    expectCode(capture, "INCOMPLETE_CAPTURE");
  });

  it("accepts a selected ID that distinguishes the regenerated version", () => {
    const capture = branch();
    capture.probe.visibleMessageIds = ["answer-id"];
    expect(normalizeConversation(capture).messages.map((item) => item.id)).toEqual([
      "question-id",
      "answer-id",
    ]);
  });

  it("rejects an ID from the other version and an unknown visible ID", () => {
    for (const id of ["alternate-id", "unrecognized-id"]) {
      const capture = branch();
      capture.probe.visibleMessageIds = [id];
      expectCode(capture, "BRANCH_MISMATCH");
    }
  });

  it("requires evidence past every genuine fork", () => {
    const capture = branch();
    node(capture, "answer-key").children = ["next-user", "other-user"];
    capture.payload.mapping["next-user"] = {
      parent: "answer-key",
      children: [],
      message: message("next-user-id", "user"),
    };
    capture.payload.mapping["other-user"] = {
      parent: "answer-key",
      children: [],
      message: message("other-user-id", "user"),
    };
    capture.payload.current_node = "next-user";
    capture.probe.visibleMessageIds = ["answer-id"];
    expectCode(capture, "INCOMPLETE_CAPTURE");
    capture.probe.visibleMessageIds = ["next-user-id"];
    expect(normalizeConversation(capture).messages.at(-1)?.id).toBe("next-user-id");
  });

  it("ignores hidden, analysis and tool-only side paths", () => {
    for (const internal of [
      { ...message("internal"), channel: "analysis" },
      { ...message("internal"), metadata: { is_visually_hidden_from_conversation: true } },
      message("internal", "tool"),
    ]) {
      const capture = branch();
      node(capture, "alternate-key").message = internal;
      capture.probe.visibleMessageIds = [];
      expect(normalizeConversation(capture).messages).toHaveLength(2);
    }
  });

  it("finds visible versions behind internal side-path nodes", () => {
    const capture = branch();
    node(capture, "alternate-key").message = { ...message("internal"), channel: "analysis" };
    node(capture, "alternate-key").children = ["other-answer"];
    capture.payload.mapping["other-answer"] = {
      parent: "alternate-key",
      children: [],
      message: message("other-answer-id"),
    };
    capture.probe.visibleMessageIds = ["question-id"];
    expectCode(capture, "INCOMPLETE_CAPTURE");
  });

  it("rejects duplicate message IDs even across regenerated versions", () => {
    const capture = branch();
    node(capture, "alternate-key").message = message("answer-id");
    expectCode(capture, "INVALID_DATA");
  });

  it("rejects duplicate IDs on the selected path", () => {
    const capture = sample();
    answer(capture).id = "question-id";
    expectCode(capture, "INVALID_DATA");
  });

  it("rejects repeated or reversed page IDs", () => {
    for (const ids of [
      ["answer-id", "answer-id"],
      ["answer-id", "question-id"],
    ]) {
      const capture = sample();
      capture.probe.visibleMessageIds = ids;
      expectCode(capture, "BRANCH_MISMATCH");
    }
  });

  it("rejects source ID changes", () => {
    const capture = sample();
    capture.payload.conversation_id = "different-conversation";
    expectCode(capture, "PAGE_CHANGED");
  });

  it("rejects missing, cyclic and inconsistent parent links", () => {
    const missing = sample();
    node(missing, "question-key").parent = "missing";
    expectCode(missing, "INVALID_DATA");
    const cycle = sample();
    node(cycle, "question-key").parent = "answer-key";
    expectCode(cycle, "INVALID_DATA");
    const inconsistent = sample();
    node(inconsistent, "question-key").children = [];
    expectCode(inconsistent, "INVALID_DATA");
  });
});

describe("content and completion", () => {
  it("preserves known and unknown reference syntax literally in plain user text", () => {
    const capture = sample();
    const body = "请逐字解释：citeturn0search0 与 future_private_tokenid\r\n";
    node(capture, "question-key").message!.content = { content_type: "text", parts: [body] };
    const result = normalizeConversation(capture);
    expect(result.messages[0]).toMatchObject({ format: "plain", body });
    expect(result.warnings).toEqual([]);
  });

  it("retains plain user text, raw Markdown, whitespace and the order of all text parts", () => {
    const capture = sample();
    const body = "  a_b * #\r\n\n```ts\n  x();  \n```\n";
    answer(capture).content = { content_type: "text", parts: [body, "接着", "继续"] };
    const result = normalizeConversation(capture);
    expect(result.messages[0]?.format).toBe("plain");
    expect(result.messages[1]).toMatchObject({ format: "markdown", body: body + "接着继续" });
  });

  it("only accepts complete supported user and final assistant messages", () => {
    for (const status of ["finished_partial", "unknown-status", undefined, null]) {
      const capture = sample();
      answer(capture).status = status;
      expectCode(capture, "INCOMPLETE_CAPTURE");
    }
    const capture = sample();
    answer(capture).end_turn = false;
    expectCode(capture, "INCOMPLETE_CAPTURE");
  });

  it("accepts absent assistant channel and recipient", () => {
    const capture = sample();
    delete answer(capture).channel;
    delete answer(capture).recipient;
    expect(normalizeConversation(capture).messages).toHaveLength(2);
  });

  it("does not inspect or export excluded internal content", () => {
    const capture = sample();
    answer(capture).channel = "analysis";
    answer(capture).content = { content_type: "hidden_unknown_type" };
    capture.probe.visibleMessageIds = ["question-id"];
    expect(normalizeConversation(capture).messages.map((item) => item.id)).toEqual(["question-id"]);
  });

  it("rejects unknown and malformed body structures instead of silently losing them", () => {
    for (const content of [
      null,
      "text",
      {},
      { content_type: "text", parts: ["known", { text: "lost" }] },
      { content_type: "text", parts: [42] },
      { content_type: "multimodal_text", parts: [{ content_type: "future_media", text: "lost" }] },
      { content_type: "future_panel", text: "lost" },
    ]) {
      const capture = sample();
      answer(capture).content = content;
      expectCode(capture, "CONTENT_UNSUPPORTED");
    }
  });

  it("keeps known image, file and audio placeholders and a deduplicated warning", () => {
    const capture = sample();
    answer(capture).content = {
      content_type: "multimodal_text",
      parts: [
        "之前",
        { content_type: "image_asset_pointer", asset_pointer: "opaque" },
        { content_type: "file", name: "sample.pdf" },
        { content_type: "audio_asset_pointer", asset_pointer: "opaque-audio" },
        "之后",
      ],
    };
    const result = normalizeConversation(capture);
    expect(result.coverage).toBe("complete");
    expect(result.messages[1]?.body).toContain("[图片未包含在导出中]");
    expect(result.messages[1]?.body).toContain("[附件未包含在导出中]");
    expect(result.messages[1]?.body).toContain("[音频未包含在导出中]");
    expect(result.messages[1]?.body).not.toContain("opaque");
    expect(result.warnings).toHaveLength(1);
  });

  it("preserves every code byte while cleaning citations in ordinary text", () => {
    const capture = sample();
    const citation = "citeturn0search0";
    const code = [
      `\`\`${citation}\`\``,
      `\`\`\`\`text\r\n  ${citation}\r\n\`\`\`\``,
      `~~~text\n${citation}\n~~~`,
      `    ${citation}\n    keep  spaces`,
      `> \`\`\`text\n> ${citation}\n> \`\`\``,
      `- item\n\n  \`\`\`text\n  ${citation}\n  \`\`\``,
    ].join("\n\n");
    answer(capture).content = {
      content_type: "text",
      parts: [`引用 ${citation}\n\n${code}\n\nfilecitefile0`],
    };
    const result = normalizeConversation(capture);
    expect(result.messages[1]?.body).toBe(`引用 [引用见原对话]\n\n${code}\n\n[文件引用见原对话]`);
    expect(result.warnings).toEqual(["部分引用请查看原对话"]);
  });

  it("preserves unrecognized token syntax inside code", () => {
    const capture = sample();
    const body = "`future_private_tokenunknown`\n\n```text\nunfinished\n```";
    answer(capture).content = { content_type: "text", parts: [body] };
    const result = normalizeConversation(capture);
    expect(result.messages[1]?.body).toBe(body);
    expect(result.warnings).toEqual([]);
  });

  it("replaces standalone memory citations while preserving literal code examples", () => {
    const capture = sample();
    const marker = "\uE200memcite\uE201";
    answer(capture).content = {
      content_type: "text",
      parts: [`正文 ${marker}\n\n\`${marker}\`\n\n\`\`\`text\n${marker}\n\`\`\``],
    };
    const result = normalizeConversation(capture);
    expect(result.messages[1]?.body).toBe(
      `正文 [引用见原对话]\n\n\`${marker}\`\n\n\`\`\`text\n${marker}\n\`\`\``,
    );
    expect(result.warnings).toEqual(["部分引用请查看原对话"]);
  });

  it("uses an explicit card placeholder and rejects unrecognized private tokens", () => {
    const capture = sample();
    answer(capture).content = { content_type: "text", parts: ["navlistsource"] };
    expect(normalizeConversation(capture).messages[1]?.body).toContain("[交互卡片未包含在导出中]");
    answer(capture).content = { content_type: "text", parts: ["future_private_tokenunknown"] };
    expectCode(capture, "CONTENT_UNSUPPORTED");
  });

  it("rejects a conversation without any readable body", () => {
    const capture = sample();
    for (const item of Object.values(capture.payload.mapping)) {
      if (item.message) item.message.content = { content_type: "text", parts: [" \n "] };
    }
    expectCode(capture, "EMPTY_CONVERSATION");
  });

  it("ignores historical internal generation status but rejects an active internal leaf", () => {
    const capture = structuredClone(
      scenariosJson.find((item) => item.name === "exclude-internal")!.capture,
    ) as Capture & { payload: TestPayload };
    const internal = Object.entries(capture.payload.mapping).find(
      ([, node]) => node.message?.channel === "analysis",
    )!;
    internal[1].message!.status = "in_progress";
    expect(normalizeConversation(capture).messages.map((item) => item.role)).toEqual([
      "user",
      "assistant",
    ]);
    const active = sample();
    answer(active).channel = "analysis";
    answer(active).status = "in_progress";
    active.probe.visibleMessageIds = ["question-id"];
    expectCode(active, "GENERATING");
  });

  it("accepts a completed intermediate assistant turn followed by a finished final reply", () => {
    const capture = sample();
    answer(capture).end_turn = false;
    capture.payload.mapping["answer-key"]!.children = ["final-key"];
    capture.payload.mapping["final-key"] = {
      parent: "answer-key",
      children: [],
      message: message("final-id"),
    };
    capture.payload.current_node = "final-key";
    capture.probe.visibleMessageIds.push("final-id");
    expect(normalizeConversation(capture).messages.map((item) => item.id)).toEqual([
      "question-id",
      "answer-id",
      "final-id",
    ]);
  });

  it.each(["thoughts", "reasoning_recap"])(
    "excludes internal %s without relying on a channel field",
    (contentType) => {
      const capture = sample();
      capture.payload.mapping["question-key"]!.children = ["thoughts-key"];
      capture.payload.mapping["answer-key"]!.parent = "thoughts-key";
      capture.payload.mapping["thoughts-key"] = {
        parent: "question-key",
        children: ["answer-key"],
        message: {
          ...message("thoughts-id"),
          channel: null,
          content: {
            content_type: contentType,
            thoughts: [{ summary: "PRIVATE_SYNTHETIC_REASONING" }],
          },
        },
      };
      const result = normalizeConversation(capture);
      expect(result.messages.map((item) => item.id)).toEqual(["question-id", "answer-id"]);
      expect(JSON.stringify(result)).not.toContain("PRIVATE_SYNTHETIC_REASONING");
    },
  );
});
