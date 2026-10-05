import { ExportError } from "../../core/model";
import type { ReadContext } from "../types";

// Private to the ChatGPT adapter. Do not promote platform probes or payloads
// into the shared Conversation or adapter contract.
export interface PageProbe {
  conversationId: string;
  pathname: string;
  visibleMessageIds: string[];
  generating: boolean;
  signature: string;
}

export interface Capture {
  // Allowlisted projection, not the original API response.
  payload: unknown;
  probe: PageProbe;
}

export async function captureCurrentConversation(context: ReadContext): Promise<Capture> {
  void context;
  await Promise.resolve();
  throw new ExportError("NOT_IMPLEMENTED", "会话读取尚未实现");
}

// Revalidate the same tab, origin, route and selected branch before delivery.
export async function assertCaptureCurrent(context: ReadContext, probe: PageProbe): Promise<void> {
  void context;
  void probe;
  await Promise.resolve();
  throw new ExportError("NOT_IMPLEMENTED", "页面状态复核尚未实现");
}
