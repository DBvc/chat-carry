import { ExportError } from "./model";
import type { Conversation } from "./model";

// No provider imports or hard-coded assistant name. Read
// conversation.source.provider.label, and render by message.format, not role.
// Call assertExportable before producing either format.

export function renderMarkdown(conversation: Conversation): string {
  void conversation;
  throw new ExportError("NOT_IMPLEMENTED", "Markdown 渲染尚未实现");
}

export function renderText(conversation: Conversation): string {
  void conversation;
  throw new ExportError("NOT_IMPLEMENTED", "纯文本渲染尚未实现");
}
