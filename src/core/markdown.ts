import MarkdownIt from "markdown-it";
import type { StateBlock, StateInline } from "markdown-it";
import { ExportError } from "./model";

export const markdown = new MarkdownIt({ html: true, linkify: true });

// Remember failed searches within each parser scope. Repeated unmatched openers
// must not rescan the rest of a multi-megabyte message at every position.
const missing = new WeakMap<
  object,
  Map<string, { start: number; end: number; scopeEnd: number }>
>();

function searchKey(state: StateInline | StateBlock, close: string): string {
  return "blkIndent" in state ? `${close}:${state.blkIndent}:${state.level}` : close;
}

function mathEnd(state: StateInline | StateBlock, start: number, max: number): number {
  const source = state.src;
  const pair = source.slice(start, start + 2);
  const close = pair === "\\(" ? "\\)" : pair === "\\[" ? "\\]" : pair === "$$" ? "$$" : "$";
  const width = close.length;
  if (close === "$" && (source[start] !== "$" || /[\s$]/.test(source[start + 1] ?? " "))) return -1;
  const key = searchKey(state, close);
  let ranges = missing.get(state);
  if (!ranges) missing.set(state, (ranges = new Map()));
  const failed = ranges.get(key);
  if (failed && start >= failed.start && start < failed.end && max <= failed.scopeEnd) return -1;
  const scope = source.slice(0, max);
  const delimiters = /\\[\s\S]|\$\$?|\n/g;
  delimiters.lastIndex = start + width;
  let end = max;
  for (let match = delimiters.exec(scope); match; match = delimiters.exec(scope)) {
    if (close === "$" && match[0] === "\n") {
      end = match.index;
      break;
    }
    if (match[0] !== close) continue;
    if (
      close === "$" &&
      (/\s/.test(source[match.index - 1]!) || /[\d$]/.test(source[match.index + 1] ?? ""))
    )
      continue;
    return match.index + width;
  }
  ranges.set(key, { start, end, scopeEnd: max });
  return -1;
}

markdown.inline.ruler.before("escape", "raw_math", (state, silent) => {
  // Link discovery determines its label boundary before math inside that label.
  if (silent || !/^(?:\\[([]|\$)/.test(state.src.slice(state.pos, state.pos + 2))) return false;
  const end = mathEnd(state, state.pos, state.posMax);
  if (end < 0) return false;
  const token = state.push("raw_math", "", 0);
  token.content = state.src.slice(state.pos, end);
  token.meta = { start: state.pos, end };
  state.pos = end;
  return true;
});

markdown.block.ruler.before(
  "table",
  "raw_math",
  (state, first, maxLine, silent) => {
    const start = state.bMarks[first]! + state.tShift[first]!;
    if (
      state.sCount[first]! - state.blkIndent >= 4 ||
      !["\\[", "$$"].includes(state.src.slice(start, start + 2))
    )
      return false;
    const end = mathEnd(state, start, state.eMarks[maxLine - 1]!);
    if (end < 0) return false;
    const reject = (boundary: number) => {
      const close = state.src.slice(start, start + 2) === "\\[" ? "\\]" : "$$";
      missing.get(state)!.set(searchKey(state, close), {
        start,
        end: boundary,
        scopeEnd: state.eMarks[maxLine - 1]!,
      });
      return false;
    };
    let last = first;
    while (state.eMarks[last]! < end) {
      last++;
      if (state.sCount[last]! < state.blkIndent && !state.isEmpty(last))
        return reject(state.bMarks[last]!);
    }
    if (state.src.slice(end, state.eMarks[last]).trim()) return reject(end - 2);
    if (silent) return true;
    const token = state.push("raw_math", "", 0);
    token.block = true;
    token.content = state.getLines(first, last + 1, state.blkIndent, false);
    token.map = [first, last + 1];
    state.line = last + 1;
    return true;
  },
  { alt: ["paragraph", "reference", "blockquote", "list"] },
);

// Native block recursion silently discards remaining input at maxNesting.
markdown.core.ruler.after("block", "nesting_limit", (state) => {
  for (const token of state.tokens)
    if (
      token.level + 1 >= markdown.options.maxNesting &&
      ["blockquote_open", "list_item_open"].includes(token.type)
    )
      throw new ExportError("CONTENT_UNSUPPORTED", "正文嵌套过深，无法完整转换");
});

// Reuse the pinned parser's code-span rule, keeping our source-whitespace policy.
const backticks = markdown.inline.ruler.__rules__.find((rule) => rule.name === "backticks")!.fn;
markdown.inline.ruler.at("backticks", (state, silent) => {
  const start = state.pos;
  const count = state.tokens.length;
  const matched = backticks(state, silent);
  const token = state.tokens.at(-1);
  if (!silent && state.tokens.length > count && token?.type === "code_inline") {
    token.content = state.src.slice(start + token.markup.length, state.pos - token.markup.length);
  }
  return matched;
});

// Tables split cells before inline parsing. Keep math pipes in their source cell
// instead of letting the standard table rule discard the resulting extra cells.
const table = markdown.block.ruler.__rules__.find((rule) => rule.name === "table")!.fn;
markdown.block.ruler.at(
  "table",
  (state, first, maxLine, silent) => {
    const before = state.tokens.length;
    if (!table(state, first, maxLine, silent)) return false;
    if (silent) return true;
    for (let index = before; index < state.tokens.length; index++) {
      const row = state.tokens[index]!;
      if (row.type !== "tr_open" || !row.map) continue;
      const line = row.map[0];
      const source = state.src.slice(state.bMarks[line]! + state.tShift[line]!, state.eMarks[line]);
      if (/\\[([]|\$/.test(source)) row.meta = { source };
    }
    return true;
  },
  { alt: ["paragraph", "reference"] },
);

// Forward reference definitions are complete only after block parsing.
markdown.core.ruler.before("inline", "math_table_cells", (state) => {
  for (let index = 0; index < state.tokens.length; index++) {
    const row = state.tokens[index]!;
    const source = row.meta?.source;
    if (row.type !== "tr_open" || typeof source !== "string") continue;
    const math = (markdown.parseInline(source, state.env)[0]?.children ?? [])
      .filter((token) => token.type === "raw_math")
      .map((token) => token.meta as { start: number; end: number });
    if (!math.length) continue;
    const cells: string[] = [];
    let start = 0;
    let formula = 0;
    let current = "";
    for (let pos = 0; pos < source.length; pos++) {
      if (pos === math[formula]?.start) {
        pos = math[formula++]!.end - 1;
      } else if (source[pos] === "|") {
        if (source[pos - 1] === "\\") {
          current += source.slice(start, pos - 1);
          start = pos;
        } else {
          cells.push((current + source.slice(start, pos)).trim());
          current = "";
          start = pos + 1;
        }
      }
    }
    cells.push((current + source.slice(start)).trim());
    if (cells[0] === "") cells.shift();
    if (cells.at(-1) === "") cells.pop();
    let cell = 0;
    while (state.tokens[++index]?.type !== "tr_close") {
      const token = state.tokens[index]!;
      if (token.type === "inline") token.content = cells[cell++] ?? "";
    }
    if (cells.length > cell)
      throw new ExportError("CONTENT_UNSUPPORTED", "表格列数不一致，无法完整转换");
  }
});
