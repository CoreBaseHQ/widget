import type { ChatMessage } from "../types";
import { parseBlocks, sanitizeStream } from "../lib/blocks";
import { renderMarkdown } from "../lib/markdown";
import { Chart } from "./Chart";
import { Table } from "./Table";

export function Message({
  message,
  streaming,
}: {
  message: ChatMessage;
  streaming?: boolean;
}) {
  // Sanitize at render time so the stored stream stays raw (a fence split
  // across chunks reassembles correctly before being parsed). Keeps internal
  // tool calls / source markers out of what the end user sees.
  const blocks = parseBlocks(sanitizeStream(message.content));
  const hasContent = blocks.length > 0;

  return (
    <div className={`cb-message cb-${message.role}`}>
      <div className="cb-bubble">
        {blocks.map((block, i) => {
          if (block.type === "chart") {
            return <Chart key={i} raw={block.raw} streaming={streaming} />;
          }
          if (block.type === "table") {
            return <Table key={i} raw={block.raw} streaming={streaming} />;
          }
          return block.content.trim() ? (
            <div
              key={i}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(block.content) }}
            />
          ) : null;
        })}

        {message.error ? (
          <div className="cb-bubble-error">{message.error}</div>
        ) : (
          // No content yet and no error; the turn is still pending.
          !hasContent && (
            <div className="cb-loading">
              <span></span>
              <span></span>
              <span></span>
            </div>
          )
        )}
      </div>
    </div>
  );
}
