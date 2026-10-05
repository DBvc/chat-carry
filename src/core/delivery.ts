import { ExportError } from "./model";

// Provider-neutral fallback filename: conversation.md.
export function safeFilename(title: string): string {
  void title;
  throw new ExportError("NOT_IMPLEMENTED", "文件名处理尚未实现");
}

export async function copyPlainText(text: string): Promise<void> {
  void text;
  await Promise.resolve();
  throw new ExportError("NOT_IMPLEMENTED", "剪贴板交付尚未实现");
}

export async function downloadMarkdown(text: string, filename: string): Promise<number> {
  void text;
  void filename;
  await Promise.resolve();
  throw new ExportError("NOT_IMPLEMENTED", "Markdown 下载尚未实现");
}
