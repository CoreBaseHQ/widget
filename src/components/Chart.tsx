import type { ChartData } from "../types";

// Lightweight hand-rolled SVG charts — no charting dependency, so the widget
// stays small. Mirrors the panel's `chart` block JSON shape:
//   { type, title, data, xKey, series:[{key,label}], colors }

const PALETTE = [
  "#3b82f6",
  "#22c55e",
  "#f97316",
  "#a855f7",
  "#ef4444",
  "#06b6d4",
  "#eab308",
  "#ec4899",
  "#14b8a6",
  "#8b5cf6",
];

const W = 320;
const H = 188;
const PAD = { left: 32, right: 12, top: 12, bottom: 26 };
const PLOT_L = PAD.left;
const PLOT_R = W - PAD.right;
const PLOT_T = PAD.top;
const PLOT_B = H - PAD.bottom;
const PLOT_W = PLOT_R - PLOT_L;
const PLOT_H = PLOT_B - PLOT_T;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmt = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n * 100) / 100}`;
};

const truncate = (s: string, n = 7): string =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

const polar = (cx: number, cy: number, r: number, a: number) => ({
  x: cx + r * Math.cos(a),
  y: cy + r * Math.sin(a),
});

export function Chart({ raw, streaming }: { raw: string; streaming?: boolean }) {
  let parsed: ChartData | null = null;
  try {
    parsed = JSON.parse(raw) as ChartData;
  } catch {
    parsed = null;
  }

  if (!parsed || !Array.isArray(parsed.data) || parsed.data.length === 0) {
    return streaming ? (
      <div className="cb-block-loading">Preparing chart…</div>
    ) : (
      <div className="cb-block-error">Invalid chart data.</div>
    );
  }

  const { type = "bar", title, data } = parsed;
  const first = data[0] ?? {};

  const xKey =
    parsed.xKey ??
    Object.keys(first).find((k) => typeof first[k] === "string") ??
    "name";

  const series: { key: string; label?: string }[] =
    parsed.series ??
    Object.keys(first)
      .filter((k) => k !== xKey && typeof first[k] === "number")
      .map((k) => ({ key: k }));

  const colors = series.map(
    (_s, i) => parsed!.colors?.[i] ?? PALETTE[i % PALETTE.length],
  );

  const labels = data.map((d) => String(d[xKey] ?? ""));

  let svg;

  if (type === "pie") {
    const valueKey = series[0]?.key ?? "value";
    const values = data.map((d) => num(d[valueKey]));
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const cx = PLOT_L + PLOT_W / 2;
    const cy = PLOT_T + PLOT_H / 2;
    const r = Math.min(PLOT_W, PLOT_H) / 2 - 2;
    let a = -Math.PI / 2;
    svg = (
      <svg viewBox={`0 0 ${W} ${H}`} className="cb-chart-svg">
        {values.map((v, i) => {
          const a0 = a;
          const a1 = a + (v / total) * Math.PI * 2;
          a = a1;
          const p0 = polar(cx, cy, r, a0);
          const p1 = polar(cx, cy, r, a1);
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const d = `M${cx},${cy} L${p0.x},${p0.y} A${r},${r} 0 ${large} 1 ${p1.x},${p1.y} Z`;
          return (
            <path key={i} d={d} fill={PALETTE[i % PALETTE.length]} stroke="#0d0f14" strokeWidth={1}>
              <title>{`${labels[i]}: ${fmt(v)}`}</title>
            </path>
          );
        })}
      </svg>
    );
  } else {
    const allValues = data.flatMap((d) => series.map((s) => num(d[s.key])));
    const max = Math.max(1, ...allValues);
    const yOf = (v: number) => PLOT_B - (v / max) * PLOT_H;
    const bandW = PLOT_W / data.length;
    const cxOf = (i: number) => PLOT_L + bandW * i + bandW / 2;

    const gridY = [0, max / 2, max];

    svg = (
      <svg viewBox={`0 0 ${W} ${H}`} className="cb-chart-svg">
        {/* gridlines + y labels */}
        {gridY.map((g, i) => (
          <g key={`g${i}`}>
            <line
              x1={PLOT_L}
              x2={PLOT_R}
              y1={yOf(g)}
              y2={yOf(g)}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="3 3"
            />
            <text x={PLOT_L - 4} y={yOf(g) + 3} className="cb-chart-axis" text-anchor="end">
              {fmt(g)}
            </text>
          </g>
        ))}

        {/* x labels */}
        {labels.map((l, i) =>
          data.length <= 8 || i % Math.ceil(data.length / 8) === 0 ? (
            <text key={`x${i}`} x={cxOf(i)} y={H - 9} className="cb-chart-axis" text-anchor="middle">
              {truncate(l)}
            </text>
          ) : null,
        )}

        {/* series */}
        {type === "bar"
          ? data.map((d, i) => {
              const groupW = bandW * 0.7;
              const barW = groupW / series.length;
              const x0 = PLOT_L + bandW * i + (bandW - groupW) / 2;
              return series.map((s, j) => {
                const v = num(d[s.key]);
                const h = (v / max) * PLOT_H;
                return (
                  <rect
                    key={`${i}-${j}`}
                    x={x0 + j * barW}
                    y={PLOT_B - h}
                    width={Math.max(1, barW - 1)}
                    height={h}
                    rx={1}
                    fill={colors[j]}
                  >
                    <title>{`${labels[i]} · ${s.label ?? s.key}: ${fmt(v)}`}</title>
                  </rect>
                );
              });
            })
          : series.map((s, j) => {
              const pts = data
                .map((d, i) => `${cxOf(i)},${yOf(num(d[s.key]))}`)
                .join(" ");
              return (
                <g key={j}>
                  {type === "area" && (
                    <polygon
                      points={`${pts} ${cxOf(data.length - 1)},${PLOT_B} ${cxOf(0)},${PLOT_B}`}
                      fill={colors[j]}
                      opacity={0.14}
                    />
                  )}
                  <polyline points={pts} fill="none" stroke={colors[j]} strokeWidth={2} />
                </g>
              );
            })}
      </svg>
    );
  }

  const legend =
    type === "pie"
      ? labels.map((l, i) => ({ label: l, color: PALETTE[i % PALETTE.length] }))
      : series.map((s, i) => ({ label: s.label ?? s.key, color: colors[i] }));

  return (
    <div className="cb-block">
      {title && <div className="cb-block-title">{title}</div>}
      <div className="cb-chart">{svg}</div>
      {legend.length > 1 && (
        <div className="cb-legend">
          {legend.map((it, i) => (
            <span key={i} className="cb-legend-item">
              <span className="cb-legend-dot" style={{ background: it.color }} />
              {truncate(it.label, 14)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
