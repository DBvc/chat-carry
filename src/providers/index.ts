import { chatgptAdapter } from "./chatgpt";
import type { ChatAdapter } from "./types";

// One explicit, local list. No auto-discovery, third-party code, plugin SDK,
// placeholder platforms, feature flags or remote configuration.
const adapters: readonly ChatAdapter[] = [chatgptAdapter];

export function resolveAdapter(url: URL): ChatAdapter | undefined {
  return adapters.find((adapter) => adapter.matches(url));
}
