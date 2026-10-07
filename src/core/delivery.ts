import { assertOutput, ExportError } from "./model";

// Provider-neutral fallback filename: conversation.md.
export function safeFilename(title: string): string {
  let base = title
    // Filesystem names cannot contain controls, path syntax or lone surrogates.
    // oxlint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f<>:"/\\|?*]/g, "")
    .replace(/[\uD800-\uDFFF]/gu, "")
    .trim()
    .replace(/\.md$/i, "")
    .replace(/^\.+|[. ]+$/g, "");
  if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:[. ]|$)/i.test(base)) base = "_" + base;
  let name = "";
  let bytes = 0;
  for (const character of base) {
    const size = new TextEncoder().encode(character).length;
    if (bytes + size > 177) break;
    name += character;
    bytes += size;
  }
  return `${name.replace(/[. ]+$/g, "") || "conversation"}.md`;
}

export async function copyPlainText(text: string): Promise<void> {
  assertOutput(text);
  await navigator.clipboard.writeText(text);
}

export async function downloadMarkdown(text: string, filename: string): Promise<number> {
  assertOutput(text);
  const id = await chrome.downloads.download({
    url: `data:text/markdown;charset=utf-8,${encodeURIComponent(text)}`,
    filename: safeFilename(filename),
    conflictAction: "uniquify",
  });
  if (!Number.isInteger(id) || id < 0)
    throw new ExportError("READ_FAILED", "浏览器未能开始下载，请重试");
  return id;
}
