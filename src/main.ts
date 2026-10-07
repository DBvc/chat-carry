import "./popup.css";
import { assertExportable, ExportError } from "./core/model";
import { copyPlainText, downloadMarkdown, safeFilename } from "./core/delivery";
import { renderMarkdown, renderText } from "./core/render";
import { resolveAdapter } from "./providers";
import type { PreparedConversation } from "./providers/types";

const status = document.querySelector<HTMLElement>("#status")!;
const title = document.querySelector<HTMLElement>("#conversation-title")!;
const warning = document.querySelector<HTMLElement>("#warning")!;
const copy = document.querySelector<HTMLButtonElement>("#copy-button")!;
const download = document.querySelector<HTMLButtonElement>("#export-button")!;
const retry = document.querySelector<HTMLButtonElement>("#retry")!;
const manual = document.querySelector<HTMLElement>("#manual")!;
const textarea = document.querySelector<HTMLTextAreaElement>("#manual-text")!;
let requestId = 0;
let busy = false;
let ready:
  | { prepared: PreparedConversation; text: string; markdown: string; filename: string }
  | undefined;
let deadline: ReturnType<typeof setTimeout> | undefined;
let feedback: ReturnType<typeof setTimeout> | undefined;
let stopDownload = () => {};

function say(message: string, tone = ""): void {
  status.textContent = message;
  status.dataset.tone = tone;
}
function buttons(disabled: boolean): void {
  copy.disabled = download.disabled = disabled;
}
function fail(error: unknown): void {
  ready = undefined;
  busy = false;
  buttons(true);
  manual.hidden = true;
  textarea.value = "";
  warning.hidden = true;
  title.textContent = "当前对话暂不可用";
  title.title = "";
  retry.hidden = error instanceof ExportError && error.code === "UNSUPPORTED_PAGE";
  say(error instanceof ExportError ? error.message : "无法读取这段对话，请稍后重试", "error");
}
function begin(): number {
  clearTimeout(deadline);
  clearTimeout(feedback);
  stopDownload();
  copy.textContent = "复制纯文本";
  manual.hidden = true;
  textarea.value = "";
  retry.hidden = true;
  busy = true;
  buttons(true);
  return ++requestId;
}
window.addEventListener("pagehide", () => {
  requestId++;
  ready = undefined;
  clearTimeout(deadline);
  clearTimeout(feedback);
  stopDownload();
});

async function prepare(): Promise<void> {
  const request = begin();
  ready = undefined;
  warning.hidden = true;
  say("正在读取当前对话…");
  deadline = setTimeout(() => {
    if (request !== requestId) return;
    requestId++;
    fail(new ExportError("TIMEOUT", "读取超时，请重新打开扩展重试"));
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
    const conversation = prepared.conversation;
    if (conversation.source.provider.id !== adapter.provider.id)
      throw new ExportError("INVALID_DATA", "对话来源无法确认");
    assertExportable(conversation);
    const text = renderText(conversation);
    const markdown = renderMarkdown(conversation);
    await prepared.assertCurrent();
    if (request !== requestId) return;
    ready = { prepared, text, markdown, filename: safeFilename(conversation.title) };
    title.textContent = conversation.title || "对话";
    title.title = conversation.title;
    warning.textContent = conversation.warnings.join("；");
    warning.hidden = conversation.warnings.length === 0;
    say(`${conversation.source.provider.label} · 已读取 ${conversation.messages.length} 条消息`);
    buttons(false);
  } catch (error) {
    if (request === requestId) fail(error);
  } finally {
    if (request === requestId) {
      clearTimeout(deadline);
      busy = false;
    }
  }
}

function watchDownload(id: number, request: number): void {
  let stopped = false;
  const stop = () => {
    stopped = true;
    chrome.downloads.onChanged.removeListener(listener);
    clearTimeout(timer);
  };
  const update = (state?: string, error?: string) => {
    if (stopped || request !== requestId) return;
    if (state === "complete") {
      say("Markdown 已下载", "success");
      stop();
    } else if (state === "interrupted") {
      say(error === "USER_CANCELED" ? "下载已取消，可重新导出" : "下载中断，可重新导出", "warning");
      stop();
    }
  };
  const listener = (change: chrome.downloads.DownloadDelta) => {
    if (change.id === id) update(change.state?.current, change.error?.current);
  };
  chrome.downloads.onChanged.addListener(listener);
  // Observation is popup-local and bounded; the browser owns the actual download.
  const timer = setTimeout(stop, 60_000);
  stopDownload = stop;
  chrome.downloads
    .search({ id })
    .then((items) => {
      const item = items.find((entry) => entry.id === id);
      if (item) update(item.state, item.error);
    })
    .catch(() => {
      /* The onChanged listener can still confirm this download. */
    });
}

async function deliver(kind: "copy" | "download"): Promise<void> {
  if (busy || !ready) return;
  const snapshot = ready;
  const button = kind === "copy" ? copy : download;
  const restoreFocus = document.activeElement === button;
  const request = begin();
  let checked = false;
  const manualCopy = () => {
    manual.hidden = false;
    textarea.value = snapshot.text;
    textarea.focus();
    textarea.select();
    say("浏览器未允许复制，请手动复制", "warning");
  };
  deadline = setTimeout(() => {
    if (request !== requestId) return;
    requestId++;
    busy = false;
    if (!checked) fail(new ExportError("TIMEOUT", "页面校验超时，请重新读取"));
    else {
      buttons(false);
      if (kind === "copy") manualCopy();
      else say("下载尚未确认，请检查浏览器下载列表后重试", "warning");
    }
  }, 15_000);
  try {
    await snapshot.prepared.assertCurrent();
    if (request !== requestId) return;
    checked = true;
    if (kind === "copy") {
      await copyPlainText(snapshot.text);
      if (request !== requestId) return;
      copy.textContent = "已复制";
      say("纯文本已复制", "success");
      feedback = setTimeout(() => {
        copy.textContent = "复制纯文本";
      }, 1800);
    } else {
      const id = await downloadMarkdown(snapshot.markdown, snapshot.filename);
      if (request !== requestId) return;
      say("已交给浏览器下载");
      watchDownload(id, request);
    }
  } catch (error) {
    if (request !== requestId) return;
    if (!checked) fail(error);
    else if (kind === "copy") manualCopy();
    else say("浏览器未能开始下载，可重新导出", "error");
  } finally {
    if (request === requestId) {
      clearTimeout(deadline);
      busy = false;
      buttons(!ready);
      if (restoreFocus && document.activeElement === document.body && ready) button.focus();
    }
  }
}

retry.addEventListener("click", () => {
  prepare().catch(fail);
});
copy.addEventListener("click", () => {
  deliver("copy").catch(fail);
});
download.addEventListener("click", () => {
  deliver("download").catch(fail);
});
prepare().catch(fail);
