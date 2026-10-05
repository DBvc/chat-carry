import { ExportError } from "../../core/model";
import type { Conversation } from "../../core/model";
import type { Capture } from "./capture";

// Implement using chatgptInfo from ./metadata. Current-node traversal,
// hidden-message filtering and citation cleanup stay inside this adapter.
// Set user text to format: "plain" and assistant Markdown to "markdown".
export function normalizeConversation(capture: Capture): Conversation {
  void capture;
  throw new ExportError("NOT_IMPLEMENTED", "会话校验与归一化尚未实现");
}
