import { markdown } from "../../core/markdown";
import { assertExportable, ExportError } from "../../core/model";
import type { Conversation, Message } from "../../core/model";
import type { Capture } from "./capture";
import { chatgptInfo } from "./metadata";

interface ChatMessage {
  id: string;
  role: string;
  visible: boolean;
  content: unknown;
  status: unknown;
  endTurn: unknown;
  hasAttachments: boolean;
}

interface ChatNode {
  key: string;
  parent: string | null;
  children: string[];
  message: ChatMessage | null;
}

function invalid(): never {
  throw new ExportError("INVALID_DATA", "会话记录结构不完整，请刷新后重试");
}

function unsupported(): never {
  throw new ExportError("CONTENT_UNSUPPORTED", "这段对话含暂不支持的正文，请查看原对话");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function messageIdentity(value: unknown): ChatMessage | null {
  if (value === null) return null;
  if (!isRecord(value) || !nonemptyString(value.id) || !isRecord(value.author)) invalid();
  const role = value.author.role;
  if (
    typeof role !== "string" ||
    !["user", "assistant", "system", "developer", "tool"].includes(role)
  ) {
    invalid();
  }
  if (value.metadata != null && !isRecord(value.metadata)) invalid();
  const hidden = isRecord(value.metadata)
    ? value.metadata.is_visually_hidden_from_conversation
    : undefined;
  if (hidden != null && typeof hidden !== "boolean") invalid();
  const hasAttachments = isRecord(value.metadata) ? value.metadata.has_attachments : undefined;
  if (hasAttachments != null && typeof hasAttachments !== "boolean") invalid();
  if (value.channel != null && typeof value.channel !== "string") invalid();
  if (value.recipient != null && typeof value.recipient !== "string") invalid();
  const visible =
    hidden !== true &&
    !(
      role === "assistant" &&
      isRecord(value.content) &&
      (value.content.content_type === "thoughts" ||
        value.content.content_type === "reasoning_recap")
    ) &&
    (role === "user" ||
      (role === "assistant" &&
        (value.channel == null || value.channel === "final") &&
        (value.recipient == null || value.recipient === "all")));
  return {
    id: value.id,
    role,
    visible,
    content: value.content,
    status: value.status,
    endTurn: value.end_turn,
    hasAttachments: hasAttachments === true,
  };
}

// Mark code occurrences with temporary ordinary-text labels only while lexing.
// Applying replacements to the original source keeps CRLF, indentation and fences
// byte-for-byte intact, including code inside lists and blockquotes. No HTML is rendered.
function cleanReferences(body: string, warnings: Set<string>): string {
  const privateSyntax = /\uE200[^\uE200\uE201]*\uE201|[\uE200-\uE202]/g;
  if (!privateSyntax.test(body)) return body;
  privateSyntax.lastIndex = 0;
  let prefix = "CHATCARRYREFERENCE";
  while (body.includes(prefix)) prefix += "X";
  let occurrence = 0;
  const labeled = body.replace(privateSyntax, (raw) => `${prefix}${occurrence++}END${raw}`);
  const codeOccurrences = new Set<number>();
  const labels = new RegExp(`${prefix}(\\d+)END`, "g");
  try {
    const pending = [markdown.parse(labeled, {})];
    while (pending.length)
      for (const token of pending.pop()!) {
        if (token.children) pending.push(token.children);
        if (["code_inline", "code_block", "fence"].includes(token.type)) {
          for (const label of token.content.matchAll(labels)) {
            codeOccurrences.add(Number(label[1]));
          }
        }
      }
  } catch {
    unsupported();
  }
  occurrence = 0;
  return body.replace(privateSyntax, (raw) => {
    if (codeOccurrences.has(occurrence++)) return raw;
    const kind = /^\uE200([^\uE202\uE201]+)\uE202[^\uE200\uE201]*\uE201$/.exec(raw)?.[1];
    if (
      kind === "cite" ||
      kind === "filecite" ||
      kind === "memcite" ||
      raw === "\uE200memcite\uE201"
    ) {
      warnings.add("部分引用请查看原对话");
      return kind === "filecite" ? "[文件引用见原对话]" : "[引用见原对话]";
    }
    if (kind && ["navlist", "i", "image", "entity"].includes(kind)) {
      warnings.add("含交互卡片，仅保留文字和占位说明");
      return "[交互卡片未包含在导出中]";
    }
    return unsupported();
  });
}

function normalizeContent(
  value: unknown,
  warnings: Set<string>,
  format: Message["format"],
): string {
  if (!isRecord(value) || !Array.isArray(value.parts)) unsupported();
  if (value.content_type !== "text" && value.content_type !== "multimodal_text") unsupported();
  const parts: string[] = [];
  for (const part of value.parts) {
    if (typeof part === "string") {
      parts.push(part);
      continue;
    }
    if (value.content_type !== "multimodal_text" || !isRecord(part)) unsupported();
    let placeholder: string;
    switch (part.content_type) {
      case "image_asset_pointer":
        placeholder = "[图片未包含在导出中]";
        break;
      case "file":
        placeholder = "[附件未包含在导出中]";
        break;
      case "audio_asset_pointer":
        placeholder = "[音频未包含在导出中]";
        break;
      default:
        return unsupported();
    }
    warnings.add("含图片/附件/音频，仅保留文字和占位说明");
    parts.push(`\n${placeholder}\n`);
  }
  const body = parts.join("");
  return format === "markdown" ? cleanReferences(body, warnings) : body;
}

export function normalizeConversation(capture: Capture): Conversation {
  if (capture.probe.generating) {
    throw new ExportError("GENERATING", "回答仍在生成，结束后重试");
  }
  const payload = capture.payload;
  if (
    !isRecord(payload) ||
    typeof payload.title !== "string" ||
    !nonemptyString(payload.conversation_id) ||
    !nonemptyString(payload.current_node) ||
    !isRecord(payload.mapping)
  ) {
    invalid();
  }
  if (payload.conversation_id !== capture.probe.conversationId) {
    throw new ExportError("PAGE_CHANGED", "当前对话已变化，请重新读取");
  }
  const mapping = payload.mapping;
  const nodes = new Map<string, ChatNode>();
  const messageKeys = new Map<string, string>();
  function readNode(key: string): ChatNode {
    const existing = nodes.get(key);
    if (existing) return existing;
    if (!Object.hasOwn(mapping, key)) invalid();
    const raw = mapping[key];
    if (
      !isRecord(raw) ||
      !(raw.parent === null || nonemptyString(raw.parent)) ||
      !Array.isArray(raw.children) ||
      !raw.children.every(nonemptyString) ||
      new Set(raw.children).size !== raw.children.length
    ) {
      invalid();
    }
    const message = messageIdentity(raw.message);
    if (message) {
      if (messageKeys.has(message.id)) invalid();
      messageKeys.set(message.id, key);
    }
    const node = { key, parent: raw.parent, children: raw.children, message };
    nodes.set(key, node);
    return node;
  }

  // Only this parent chain supplies exported messages. Never sort by timestamps.
  const reversePath: ChatNode[] = [];
  const selectedKeys = new Set<string>();
  let current: string | null = payload.current_node;
  while (current !== null) {
    if (selectedKeys.has(current)) invalid();
    selectedKeys.add(current);
    const node = readNode(current);
    reversePath.push(node);
    current = node.parent;
  }
  const path = reversePath.reverse();
  const pathIndex = new Map(path.map((node, index) => [node.key, index]));
  const visiblePathIndex = new Map<string, number>();
  for (const [index, node] of path.entries()) {
    if (node.message?.visible) visiblePathIndex.set(node.message.id, index);
    const previous = path[index - 1];
    if (previous && !previous.children.includes(node.key)) invalid();
  }

  // Other subtrees are inspected only for identity and topology, never for body
  // export. A hidden-only/tool-only fork is not a regenerated visible answer.
  const inspected = new Set(selectedKeys);
  const genuineForks: number[] = [];
  for (const [index, node] of path.entries()) {
    for (const childKey of node.children) {
      const child = readNode(childKey);
      if (child.parent !== node.key) invalid();
      const selectedIndex = pathIndex.get(childKey);
      if (selectedIndex !== undefined) {
        if (selectedIndex !== index + 1) invalid();
        continue;
      }
      let hasVisibleAlternative = false;
      const pending = [child];
      while (pending.length > 0) {
        const alternative = pending.pop();
        if (!alternative || inspected.has(alternative.key)) invalid();
        inspected.add(alternative.key);
        hasVisibleAlternative ||= alternative.message?.visible === true;
        for (const descendantKey of alternative.children) {
          const descendant = readNode(descendantKey);
          if (descendant.parent !== alternative.key) invalid();
          pending.push(descendant);
        }
      }
      if (hasVisibleAlternative) genuineForks.push(index);
    }
  }
  if (inspected.size !== Object.keys(mapping).length) invalid();

  let latestVisibleIndex = -1;
  for (const id of capture.probe.visibleMessageIds) {
    const index = visiblePathIndex.get(id);
    if (index === undefined || index <= latestVisibleIndex) {
      throw new ExportError("BRANCH_MISMATCH", "页面与已保存的分支不同，请回到最新消息后重试");
    }
    latestVisibleIndex = index;
  }
  if (genuineForks.some((index) => latestVisibleIndex <= index)) {
    throw new ExportError("INCOMPLETE_CAPTURE", "无法确认当前分支，请回到最新消息或刷新后重试");
  }

  const warnings = new Set<string>();
  const messages: Message[] = [];
  const lastAssistant = path.findLast(
    (node) => node.message?.visible && node.message.role === "assistant",
  )?.message;
  for (const { key, message } of path) {
    if (!message) continue;
    if (
      (message.visible || key === payload.current_node) &&
      ["user", "assistant"].includes(message.role) &&
      message.status === "in_progress"
    ) {
      throw new ExportError("GENERATING", "回答仍在生成，结束后重试");
    }
    if (!message.visible) continue;
    if (
      message.status !== "finished_successfully" ||
      (message === lastAssistant && message.endTurn != null && message.endTurn !== true)
    ) {
      throw new ExportError("INCOMPLETE_CAPTURE", "无法确认回答已完整保存，请稍后重试");
    }
    const format = message.role === "user" ? "plain" : "markdown";
    let body = normalizeContent(message.content, warnings, format);
    if (message.hasAttachments) {
      body += "\n[附件未包含在导出中]\n";
      warnings.add("含图片/附件/音频，仅保留文字和占位说明");
    }
    messages.push({
      id: message.id,
      role: message.role === "user" ? "user" : "assistant",
      body,
      format,
    });
  }
  const conversation: Conversation = {
    source: { provider: chatgptInfo, conversationId: payload.conversation_id },
    title: payload.title,
    messages,
    coverage: "complete",
    warnings: [...warnings],
  };
  assertExportable(conversation);
  return conversation;
}
