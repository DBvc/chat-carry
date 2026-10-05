import type { Conversation, ProviderInfo } from "../core/model";

export interface ReadContext {
  readonly tabId: number;
  readonly url: URL;
}

export interface PreparedConversation {
  readonly conversation: Conversation;
  // A popup-side closure over private identity/probe data. Never inject this
  // closure itself into the page; injected functions remain self-contained.
  assertCurrent(): Promise<void>;
}

export interface ChatAdapter {
  readonly provider: ProviderInfo;
  // Pure origin recognition. Unsupported routes are rejected during read.
  matches(url: URL): boolean;
  // Returns normalized data, never a token or a raw platform response.
  read(context: ReadContext): Promise<PreparedConversation>;
}
