// Stream sanitisation + segmentation. The assistant stream can carry internal
// markers (tool calls, source citations) that must never reach the end user,
// plus `chart` / `table` fenced JSON blocks we render as visuals instead of
// raw code. This module strips the former and splits the rest into ordered
// segments the Message component renders.

const stripSources = (text: string): string => {
  const marker = "<!--corebase-sources";
  const index = text.indexOf(marker);
  return index === -1 ? text : text.slice(0, index).trimEnd();
};

// The server suppresses tool-call fences for widget requests, but strip them
// here too as defense-in-depth: tool calls carry internal tool names and
// arguments (e.g. SQL) that must never surface to an end user. Removes both
// completed ```tool_call ... ``` blocks and a trailing partial fence still
// streaming in, so nothing flashes mid-stream.
const stripToolCalls = (text: string): string => {
  let out = text.replace(/```tool_call\b[\s\S]*?```/g, "");
  const partial = out.indexOf("```tool_call");
  if (partial !== -1) {
    out = out.slice(0, partial);
  }
  return out.trimEnd();
};

export const sanitizeStream = (text: string): string =>
  stripToolCalls(stripSources(text));

export type Block =
  | { type: "text"; content: string }
  | { type: "chart"; raw: string }
  | { type: "table"; raw: string };

// Split a (sanitised) message into ordered text / chart / table segments.
// Handles a trailing unterminated fence (still streaming) by emitting it as a
// block too, so the renderer can show a "preparing…" placeholder.
export const parseBlocks = (text: string): Block[] => {
  const blocks: Block[] = [];
  const fence = /```(chart|table)[ \t]*\r?\n([\s\S]*?)```/g;

  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(text))) {
    if (match.index > last) {
      const before = text.slice(last, match.index);
      if (before.trim()) blocks.push({ type: "text", content: before });
    }
    blocks.push({ type: match[1] as "chart" | "table", raw: match[2].trim() });
    last = fence.lastIndex;
  }

  const rest = text.slice(last);
  const open = rest.match(/```(chart|table)[ \t]*\r?\n([\s\S]*)$/);
  if (open) {
    const before = rest.slice(0, open.index);
    if (before.trim()) blocks.push({ type: "text", content: before });
    blocks.push({ type: open[1] as "chart" | "table", raw: open[2] });
  } else if (rest.trim()) {
    blocks.push({ type: "text", content: rest });
  }

  return blocks;
};
