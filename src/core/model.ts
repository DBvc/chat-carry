export type ExportErrorCode =
  | "UNSUPPORTED_PAGE"
  | "READ_FAILED"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "PAGE_CHANGED"
  | "BRANCH_MISMATCH"
  | "GENERATING"
  | "INVALID_DATA"
  | "CONTENT_UNSUPPORTED"
  | "EMPTY_CONVERSATION"
  | "INCOMPLETE_CAPTURE"
  | "TOO_LARGE";

export class ExportError extends Error {
  constructor(
    public readonly code: ExportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExportError";
  }
}

export interface ProviderInfo {
  readonly id: string;
  readonly label: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  body: string;
  // Describes actual recovered content, independently of the message role.
  format: "plain" | "markdown";
}

export interface Conversation {
  source: {
    provider: ProviderInfo;
    conversationId: string;
  };
  title: string;
  messages: Message[];
  // Complete means the supported text of the selected conversation path,
  // not all attachments, alternatives or hidden platform data.
  coverage: "complete" | "partial" | "unknown";
  warnings: string[];
}

// The v0.1 UI only delivers complete supported-text snapshots.
// Adapters validate unknown input before constructing this typed model.
export function assertExportable(conversation: Conversation): void {
  if (conversation.coverage !== "complete") {
    throw new ExportError("INCOMPLETE_CAPTURE", "无法确认正文完整性，请重新读取");
  }
  if (
    !conversation.source.provider.id.trim() ||
    !conversation.source.provider.label.trim() ||
    !conversation.source.conversationId.trim()
  ) {
    throw new ExportError("INVALID_DATA", "对话来源信息无效");
  }
  if (!conversation.messages.some((message) => message.body.trim().length > 0)) {
    throw new ExportError("EMPTY_CONVERSATION", "这段对话没有可导出的正文");
  }
}

export function assertOutput(text: string): void {
  if (!text.trim()) throw new ExportError("EMPTY_CONVERSATION", "这段对话没有可导出的正文");
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength > 4 * 1024 * 1024)
    throw new ExportError("TOO_LARGE", "导出内容超过 4 MiB 上限，无法完整导出");
  if (new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) !== text)
    throw new ExportError("INVALID_DATA", "正文包含无效字符，无法完整导出");
}
