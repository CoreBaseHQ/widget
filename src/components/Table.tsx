import type { TableData } from "../types";

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

export function Table({ raw, streaming }: { raw: string; streaming?: boolean }) {
  let parsed: TableData | null = null;
  try {
    parsed = JSON.parse(raw) as TableData;
  } catch {
    parsed = null;
  }

  if (
    !parsed ||
    !Array.isArray(parsed.columns) ||
    !Array.isArray(parsed.rows) ||
    parsed.columns.length === 0
  ) {
    return streaming ? (
      <div className="cb-block-loading">Preparing table…</div>
    ) : (
      <div className="cb-block-error">Invalid table data.</div>
    );
  }

  const { title, columns, rows } = parsed;

  return (
    <div className="cb-block">
      {title && <div className="cb-block-title">{title}</div>}
      <div className="cb-table-scroll">
        <table className="cb-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label ?? c.key}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key}>{cell(row[c.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
