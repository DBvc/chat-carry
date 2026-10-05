import "./popup.css";
import { assertExportable, ExportError } from "./core/model";
import { resolveAdapter } from "./providers";

const status = document.querySelector<HTMLElement>("#status")!;
const title = document.querySelector<HTMLElement>("#conversation-title")!;
let requestId = 0;
window.addEventListener("pagehide", () => {
  requestId++;
});

async function prepare(): Promise<void> {
  const request = ++requestId;
  status.textContent = "正在读取当前对话…";
  const timer = setTimeout(() => {
    if (request !== requestId) return;
    requestId++;
    title.textContent = "当前对话暂不可用";
    status.textContent = "读取超时，请重新打开扩展重试";
  }, 15_000);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (request !== requestId) return;
    const url = tab?.url ? new URL(tab.url) : undefined;
    const adapter = url ? resolveAdapter(url) : undefined;
    if (!adapter || !url || tab?.id === undefined)
      throw new ExportError("UNSUPPORTED_PAGE", "请打开受支持的已保存对话");
    const prepared = await adapter.read({ tabId: tab.id, url });
    if (request !== requestId) return;
    if (prepared.conversation.source.provider.id !== adapter.provider.id)
      throw new ExportError("INVALID_DATA", "对话来源无法确认");
    assertExportable(prepared.conversation);
    await prepared.assertCurrent();
    if (request !== requestId) return;
    title.textContent = prepared.conversation.title;
    status.textContent = `已读取 ${prepared.conversation.messages.length} 条消息 · 复制和导出将在下一步接入`;
    // Delivery remains disabled until both renderers and delivery are implemented.
  } catch (error) {
    if (request !== requestId) return;
    title.textContent = "当前对话暂不可用";
    status.textContent =
      error instanceof ExportError ? error.message : "无法读取这段对话，请稍后重试";
  } finally {
    clearTimeout(timer);
  }
}

prepare().catch(() => {
  status.textContent = "无法读取这段对话，请稍后重试";
});
