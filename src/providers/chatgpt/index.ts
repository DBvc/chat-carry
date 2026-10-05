import { ExportError } from "../../core/model";
import type { ChatAdapter } from "../types";
import { assertCaptureCurrent, captureCurrentConversation } from "./capture";
import { chatgptInfo } from "./metadata";
import { normalizeConversation } from "./normalize";

function matches(url: URL): boolean {
  return url.origin === "https://chatgpt.com" && url.username === "" && url.password === "";
}

export const chatgptAdapter: ChatAdapter = {
  provider: chatgptInfo,
  matches,
  async read(context) {
    if (!matches(context.url)) {
      throw new ExportError("UNSUPPORTED_PAGE", "请打开受支持的已保存对话");
    }
    const capture = await captureCurrentConversation(context);
    const conversation = normalizeConversation(capture);
    return {
      conversation,
      assertCurrent: () => assertCaptureCurrent(context, capture.probe),
    };
  },
};
