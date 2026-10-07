import type { Token } from "markdown-it";
import { markdown } from "./markdown";
import { assertExportable, assertOutput, ExportError } from "./model";
import type { Conversation } from "./model";

function line(text: string): string {
  return text.replace(/[\r\n]+/g, " ").trim();
}

function heading(text: string): string {
  return line(text).replace(/[\\`*_{}[\]()#+.!<>|~&-]/g, "\\$&");
}

function inline(tokens: Token[]): string {
  const parts: string[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    switch (token.type) {
      case "text":
      case "text_special":
      case "html_inline":
      case "code_inline":
      case "raw_math":
        parts.push(token.content);
        break;
      case "softbreak":
      case "hardbreak":
        parts.push("\n");
        break;
      case "em_open":
      case "em_close":
      case "strong_open":
      case "strong_close":
      case "s_open":
      case "s_close":
        break;
      case "link_open": {
        let end = index + 1;
        while (end < tokens.length && tokens[end]!.type !== "link_close") end++;
        if (end === tokens.length) unsupported();
        const label = inline(tokens.slice(index + 1, end));
        const url = token.attrGet("href") ?? "";
        parts.push(
          label === url || markdown.normalizeLink(label) === url ? label : `${label} (${url})`,
        );
        index = end;
        break;
      }
      case "image": {
        const label = inline(token.children ?? []);
        parts.push(`[图片未包含在纯文本中${label ? `：${label}` : ""}]`);
        break;
      }
      default:
        unsupported();
    }
  }
  return parts.join("");
}

function unsupported(): never {
  throw new ExportError("CONTENT_UNSUPPORTED", "正文含暂不支持的格式，无法完整转换");
}

function blocks(tokens: Token[]): string {
  let index = 0;
  function read(close = "", separator = "\n\n"): string {
    const parts: string[] = [];
    while (index < tokens.length) {
      const token = tokens[index++]!;
      if (token.type === close) return parts.join(separator);
      switch (token.type) {
        case "inline":
          parts.push(inline(token.children ?? []));
          break;
        case "raw_math":
          parts.push(token.content);
          break;
        case "fence":
        case "code_block":
        case "html_block":
          parts.push(token.content.replace(/\n$/, ""));
          break;
        case "hr":
          parts.push("────────");
          break;
        case "heading_open":
        case "paragraph_open":
        case "blockquote_open":
          parts.push(read(token.type.replace("_open", "_close")));
          break;
        case "bullet_list_open":
        case "ordered_list_open": {
          const items: string[] = [];
          let number = Number(token.attrGet("start") ?? 1);
          let loose = false;
          const listClose = token.type.replace("_open", "_close");
          while (index < tokens.length && tokens[index]!.type !== listClose) {
            if (tokens[index++]!.type !== "list_item_open") unsupported();
            const first = tokens[index];
            loose ||= first?.type === "paragraph_open" && !first.hidden;
            const task =
              first?.type === "paragraph_open" && tokens[index + 1]?.type === "inline"
                ? /^\[([ xX])\]\s+/.exec(tokens[index + 1]!.content)
                : null;
            const body = read("list_item_close", "\n");
            const ordinal = number++;
            const prefix = task
              ? task[1] === " "
                ? "[ ] "
                : "[x] "
              : token.type === "ordered_list_open"
                ? `${ordinal}. `
                : "• ";
            const content = task ? body.replace(/^\[[ xX]\]\s+/, "") : body;
            items.push(prefix + content.replace(/\n/g, "\n  "));
          }
          if (tokens[index++]?.type !== listClose) unsupported();
          parts.push(items.join(loose ? "\n\n" : "\n"));
          break;
        }
        case "table_open":
          parts.push(read("table_close", "\n"));
          break;
        case "thead_open":
        case "tbody_open":
          parts.push(read(token.type.replace("_open", "_close"), "\n"));
          break;
        case "tr_open":
          parts.push(read("tr_close", "\t"));
          break;
        case "th_open":
        case "td_open":
          parts.push(read(token.type.replace("_open", "_close"), ""));
          break;
        default:
          unsupported();
      }
    }
    if (close) unsupported();
    return parts.join(separator);
  }
  return read();
}

function finish(parts: string[]): string {
  const joined = parts.join("\n\n");
  const output = joined.endsWith("\n") ? joined : joined + "\n";
  assertOutput(output);
  return output;
}

export function renderMarkdown(conversation: Conversation): string {
  assertExportable(conversation);
  const parts = [`# ${heading(conversation.title) || "对话"}`];
  if (conversation.warnings.length)
    parts.push(conversation.warnings.map((warning) => warning.replace(/^/gm, "> ")).join("\n"));
  for (const message of conversation.messages) {
    parts.push(
      `## ${message.role === "user" ? "你" : heading(conversation.source.provider.label)}`,
    );
    parts.push(message.body);
  }
  return finish(parts);
}

export function renderText(conversation: Conversation): string {
  assertExportable(conversation);
  const parts = [line(conversation.title) || "对话"];
  if (conversation.warnings.length) parts.push(conversation.warnings.join("\n"));
  for (const message of conversation.messages) {
    if (message.body.trim()) assertOutput(message.body);
    const body =
      message.format === "plain" ? message.body : blocks(markdown.parse(message.body, {}));
    parts.push(
      `${message.role === "user" ? "你" : line(conversation.source.provider.label)}：\n${body}`,
    );
  }
  return finish(parts);
}
