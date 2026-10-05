import { ExportError } from "../../core/model";
import type { ExportErrorCode } from "../../core/model";
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

// Chrome serializes this function. Every runtime dependency must stay inside it.
async function readPage(conversationId: string, mode: "capture" | "probe") {
  const record = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  const fail = (code: ExportErrorCode): never => {
    throw code;
  };
  const stringOrNull = (value: unknown) => (typeof value === "string" ? value : null);
  const routeId = () =>
    location.pathname.match(/^\/(?:g\/[A-Za-z0-9_-]+\/)?c\/([A-Za-z0-9_-]+)\/?$/)?.[1];
  const visible = (element: Element) =>
    !element.closest('[hidden], [aria-hidden="true"]') &&
    element.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true });
  const probe = (): PageProbe => {
    if (location.origin !== "https://chatgpt.com" || routeId() !== conversationId)
      fail("PAGE_CHANGED");
    const main = document.querySelector("main");
    if (!main) return fail("INCOMPLETE_CAPTURE");
    const ids: string[] = [];
    const fingerprints: string[] = [];
    for (const element of main.querySelectorAll(
      "[data-message-id], [data-chatgpt-search-message-ids]",
    )) {
      if (!visible(element)) continue;
      const rawIds =
        element.getAttribute("data-message-id") ??
        element.getAttribute("data-chatgpt-search-message-ids") ??
        "";
      for (const id of rawIds.split(/\s+/).filter(Boolean)) {
        if (!/^[A-Za-z0-9_-]+$/.test(id)) fail("INCOMPLETE_CAPTURE");
        if (!ids.includes(id)) ids.push(id);
      }
      // Detect edits, including equal-length edits, without retaining DOM text.
      const text = element.textContent ?? "";
      let hash = 2166136261;
      for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
      fingerprints.push(`${text.length}:${hash >>> 0}`);
    }
    const generating = [
      ...main.querySelectorAll(
        '[data-testid="stop-button"], [data-testid="stop-generating-button"], [data-is-streaming="true"], button[aria-label="Stop"], button[aria-label="Stop generating"], button[aria-label="停止生成"]',
      ),
    ].some(visible);
    if (generating) fail("GENERATING");
    return {
      conversationId,
      pathname: location.pathname,
      visibleMessageIds: ids,
      generating,
      signature: JSON.stringify([ids, fingerprints]),
    };
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    const before = probe();
    if (mode === "probe") return { ok: true, probe: before };
    timer = setTimeout(() => controller.abort(), 12_000);
    const json = async (pathname: string, token?: string): Promise<unknown> => {
      const response = await fetch(`https://chatgpt.com${pathname}`, {
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
        headers: token
          ? { Accept: "application/json", Authorization: `Bearer ${token}` }
          : { Accept: "application/json" },
      });
      if (response.status === 429) fail("RATE_LIMITED");
      if (!response.ok || !/^application\/json\b/i.test(response.headers.get("content-type") ?? ""))
        fail("READ_FAILED");
      return response.json() as Promise<unknown>;
    };
    const session = await json("/api/auth/session");
    if (!record(session) || typeof session.accessToken !== "string" || !session.accessToken)
      return fail("READ_FAILED");
    const data = await json(
      `/backend-api/conversation/${encodeURIComponent(conversationId)}`,
      session.accessToken,
    );
    if (!record(data) || !record(data.mapping)) return fail("INVALID_DATA");
    const selected = new Set<string>();
    let current = data.current_node;
    while (current !== null) {
      if (
        typeof current !== "string" ||
        !current ||
        selected.has(current) ||
        !Object.hasOwn(data.mapping, current)
      )
        return fail("INVALID_DATA");
      selected.add(current);
      const node: unknown = data.mapping[current];
      if (!record(node)) return fail("INVALID_DATA");
      current = node.parent;
    }
    const mapping: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [id, node] of Object.entries(data.mapping)) {
      if (
        !record(node) ||
        !(node.parent === null || (typeof node.parent === "string" && node.parent.length > 0)) ||
        !Array.isArray(node.children) ||
        !node.children.every((child: unknown) => typeof child === "string" && !!child)
      )
        return fail("INVALID_DATA");
      let message: unknown = null;
      if (node.message !== null) {
        if (!record(node.message)) return fail("INVALID_DATA");
        const source = node.message;
        if (source.metadata != null && !record(source.metadata)) return fail("INVALID_DATA");
        const hidden = record(source.metadata)
          ? source.metadata.is_visually_hidden_from_conversation
          : undefined;
        const preamble = record(source.metadata)
          ? source.metadata.is_thinking_preamble_message
          : undefined;
        if (
          (hidden != null && typeof hidden !== "boolean") ||
          (preamble != null && typeof preamble !== "boolean") ||
          (source.channel != null && typeof source.channel !== "string") ||
          (source.recipient != null && typeof source.recipient !== "string") ||
          (source.end_turn != null && typeof source.end_turn !== "boolean")
        )
          return fail("INVALID_DATA");
        const role = record(source.author) ? stringOrNull(source.author.role) : null;
        const includeBody =
          selected.has(id) &&
          hidden !== true &&
          preamble !== true &&
          !(
            role === "assistant" &&
            record(source.content) &&
            (source.content.content_type === "thoughts" ||
              source.content.content_type === "reasoning_recap")
          ) &&
          (role === "user" ||
            (role === "assistant" &&
              (source.channel == null || source.channel === "final") &&
              (source.recipient == null || source.recipient === "all")));
        const attachments = record(source.metadata) ? source.metadata.attachments : undefined;
        if (
          includeBody &&
          attachments != null &&
          (!Array.isArray(attachments) ||
            !attachments.every(
              (attachment: unknown) =>
                record(attachment) &&
                typeof attachment.id === "string" &&
                !!attachment.id &&
                typeof attachment.name === "string" &&
                !!attachment.name,
            ))
        )
          return fail("INVALID_DATA");
        const content = record(source.content) ? source.content : {};
        const parts =
          includeBody && Array.isArray(content.parts)
            ? content.parts.map((part: unknown) =>
                typeof part === "string"
                  ? part
                  : record(part)
                    ? { content_type: stringOrNull(part.content_type) }
                    : null,
              )
            : null;
        message = {
          id: stringOrNull(source.id),
          author: { role },
          // Hidden messages and alternate versions need identity/topology only.
          content:
            includeBody ||
            content.content_type === "thoughts" ||
            content.content_type === "reasoning_recap"
              ? { content_type: stringOrNull(content.content_type), parts }
              : null,
          status: stringOrNull(source.status),
          metadata: {
            is_visually_hidden_from_conversation: hidden === true || preamble === true,
            // Only presence is needed for a placeholder; names and resource IDs stay here.
            has_attachments: includeBody && Array.isArray(attachments) && attachments.length > 0,
          },
          channel: stringOrNull(source.channel),
          recipient: stringOrNull(source.recipient),
          end_turn: typeof source.end_turn === "boolean" ? source.end_turn : null,
        };
      }
      mapping[id] = {
        parent: node.parent,
        children: node.children,
        message,
      };
    }
    const payload = {
      title: stringOrNull(data.title),
      conversation_id: stringOrNull(data.conversation_id),
      current_node: stringOrNull(data.current_node),
      mapping,
    };
    if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > 16 * 1024 * 1024)
      fail("TOO_LARGE");
    const after = probe();
    if (before.pathname !== after.pathname || before.signature !== after.signature)
      fail("PAGE_CHANGED");
    return { ok: true, capture: { payload, probe: after } };
  } catch (error) {
    const codes: readonly unknown[] = [
      "PAGE_CHANGED",
      "INCOMPLETE_CAPTURE",
      "GENERATING",
      "RATE_LIMITED",
      "READ_FAILED",
      "INVALID_DATA",
      "TOO_LARGE",
    ];
    return {
      ok: false,
      code: controller.signal.aborted ? "TIMEOUT" : codes.includes(error) ? error : "READ_FAILED",
    };
  } finally {
    clearTimeout(timer);
  }
}

const messages = {
  UNSUPPORTED_PAGE: "请打开受支持的已保存对话",
  READ_FAILED: "无法读取这段对话，请稍后重试",
  TIMEOUT: "读取超时，请重新打开扩展重试",
  RATE_LIMITED: "请求过于频繁，请稍后重试",
  PAGE_CHANGED: "页面已变化，请重新读取对话",
  GENERATING: "回答仍在生成，请结束后重试",
  INCOMPLETE_CAPTURE: "无法确认当前页面的完整分支，请重新读取",
  INVALID_DATA: "会话数据格式无效，暂时无法读取",
  TOO_LARGE: "这段对话超过当前读取大小限制",
} satisfies Partial<Record<ExportErrorCode, string>>;

function failure(code: keyof typeof messages): ExportError {
  return new ExportError(code, messages[code]);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validProbe(value: unknown, id: string): value is PageProbe {
  return (
    record(value) &&
    value.conversationId === id &&
    typeof value.pathname === "string" &&
    Array.isArray(value.visibleMessageIds) &&
    value.visibleMessageIds.every((item: unknown) => typeof item === "string" && !!item) &&
    typeof value.generating === "boolean" &&
    typeof value.signature === "string" &&
    !!value.signature
  );
}
async function inject(
  context: ReadContext,
  mode: "capture" | "probe",
): Promise<Record<string, unknown>> {
  const id = context.url.pathname.match(/^\/(?:g\/[A-Za-z0-9_-]+\/)?c\/([A-Za-z0-9_-]+)\/?$/)?.[1];
  if (
    context.url.origin !== "https://chatgpt.com" ||
    context.url.username ||
    context.url.password ||
    !id ||
    !Number.isInteger(context.tabId) ||
    context.tabId < 0
  )
    throw failure("UNSUPPORTED_PAGE");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const results: unknown = await Promise.race([
      chrome.scripting.executeScript({
        target: { tabId: context.tabId, frameIds: [0] },
        world: "MAIN",
        func: readPage,
        args: [id, mode],
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(failure("TIMEOUT")), 15_000);
      }),
    ]);
    if (
      !Array.isArray(results) ||
      results.length !== 1 ||
      !record(results[0]) ||
      results[0].frameId !== 0 ||
      !record(results[0].result)
    )
      throw failure("READ_FAILED");
    const result = results[0].result;
    if (result.ok !== true) {
      const code = result.code;
      if (typeof code === "string" && Object.hasOwn(messages, code))
        throw failure(code as keyof typeof messages);
      throw failure("READ_FAILED");
    }
    const candidate =
      mode === "probe" ? result.probe : record(result.capture) ? result.capture.probe : null;
    if (!validProbe(candidate, id)) throw failure("READ_FAILED");
    if (candidate.generating) throw failure("GENERATING");
    if (candidate.pathname !== context.url.pathname) throw failure("PAGE_CHANGED");
    return result;
  } catch (error) {
    throw error instanceof ExportError ? error : failure("READ_FAILED");
  } finally {
    clearTimeout(timer);
  }
}

export async function captureCurrentConversation(context: ReadContext): Promise<Capture> {
  const result = await inject(context, "capture");
  const capture = result.capture;
  if (!record(capture) || !Object.hasOwn(capture, "payload")) throw failure("READ_FAILED");
  return { payload: capture.payload, probe: capture.probe as PageProbe };
}

export async function assertCaptureCurrent(context: ReadContext, probe: PageProbe): Promise<void> {
  const result = await inject(context, "probe");
  const current = result.probe as PageProbe;
  if (
    current.pathname !== probe.pathname ||
    current.signature !== probe.signature ||
    JSON.stringify(current.visibleMessageIds) !== JSON.stringify(probe.visibleMessageIds)
  )
    throw failure("PAGE_CHANGED");
}
