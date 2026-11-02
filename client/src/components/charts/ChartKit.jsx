// Shared chart building blocks (Recharts) following the Lumina data-viz rules:
// - Categorical series use the validated brand pair (purple #a855f7, pink #ec4899): max 2 series per chart.
//   Validated with the dataviz palette script on light (#ffffff) and dark (#0f172a / #111827) surfaces.
// - Monitoring categories use the reserved status palette and always carry a text label.
// - Thin marks (2px lines, <=24px bars with 4px rounded data-ends), hairline solid grid, hover tooltips,
//   and a table view for every chart so no value is gated behind hover or color.
import { useId, useState } from "react"
import {
    ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ReferenceArea, BarChart, Bar, Cell, LabelList,
} from "recharts"
import { Table2, LineChart as LineIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useChartTheme, formatDay, CATEGORY_BANDS, CATEGORY_STYLE } from "./chartUtils"

/** Card wrapper with title, optional subtitle and a chart ⇄ table toggle. */
export function ChartCard({ title, subtitle, table, children, className, height = 260, empty, emptyText = "No data yet." }) {
    const [showTable, setShowTable] = useState(false)
    const headingId = useId()
    return (
        <Card className={cn("p-5 bg-card/50 backdrop-blur border-border", className)} role="figure" aria-labelledby={headingId}>
            <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                    <h3 id={headingId} className="font-semibold text-foreground">{title}</h3>
                    {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
                </div>
                {table && !empty && (
                    <button
                        type="button"
                        onClick={() => setShowTable((v) => !v)}
                        className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-primary hover:border-primary/40"
                        aria-pressed={showTable}
                    >
                        {showTable ? <><LineIcon className="w-3.5 h-3.5" /> Chart</> : <><Table2 className="w-3.5 h-3.5" /> Table</>}
                    </button>
                )}
            </div>
            {empty ? (
                <div className="grid place-items-center text-sm text-muted-foreground border border-dashed border-border rounded-lg" style={{ height }}>
                    {emptyText}
                </div>
            ) : showTable ? (
                <div className="overflow-auto" style={{ maxHeight: height + 40 }}>{table}</div>
            ) : (
                <div style={{ height }}>{children}</div>
            )}
        </Card>
    )
}

/** Simple accessible data table used as every chart's table view. */
export function DataTable({ columns, rows }) {
    return (
        <table className="w-full text-sm">
            <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                    {columns.map((c) => <th key={c.key} scope="col" className="py-2 pr-3 font-medium">{c.label}</th>)}
                </tr>
            </thead>
            <tbody>
                {rows.map((r, i) => (
                    <tr key={i} className="border-b border-border/60 last:border-0">
                        {columns.map((c) => (
                            <td key={c.key} className="py-1.5 pr-3 tabular-nums">{c.render ? c.render(r) : (r[c.key] ?? "—")}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter, theme }) {
    if (!active || !payload?.length) return null
    return (
        <div className="rounded-lg px-3 py-2 text-xs shadow-sm" style={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, color: theme.text }}>
            <div className="font-semibold mb-1">{labelFormatter ? labelFormatter(label, payload) : label}</div>
            {payload.map((p) => (
                <div key={p.dataKey} className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: p.color || p.payload?.fill }} aria-hidden="true" />
                    <span>{p.name}:</span>
                    <span className="font-semibold">{valueFormatter ? valueFormatter(p.value, p) : (p.value ?? "skipped")}</span>
                </div>
            ))}
        </div>
    )
}

const axisProps = (theme) => ({
    stroke: theme.axis,
    tick: { fill: theme.muted, fontSize: 11 },
    tickLine: false,
})

/**
 * Two-series trend on a 1-5 scale (the pair is validated; never pass more than 2 series).
 * series: [{ key, name }]
 */
export function ScaleTrendChart({ data, series, yLabel, height = 240 }) {
    const theme = useChartTheme()
    const pts = data.map((d) => ({ ...d, label: formatDay(d.date) }))
    return (
        <ResponsiveContainer width="100%" height={height}>
            <LineChart data={pts} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps(theme)} minTickGap={16} />
                <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} {...axisProps(theme)} allowDecimals={false} label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", offset: 24, fill: theme.muted, fontSize: 11 } : undefined} />
                <Tooltip cursor={{ stroke: theme.axis, strokeWidth: 1 }} content={<ChartTooltip theme={theme} valueFormatter={(v) => (v == null ? "skipped" : `${v}/5`)} />} />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: theme.muted }} />
                {series.slice(0, 2).map((s, i) => (
                    <Line
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        name={s.name}
                        stroke={theme.series[i]}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        dot={{ r: 4, fill: theme.series[i], stroke: theme.surface, strokeWidth: 2 }}
                        activeDot={{ r: 6, fill: theme.series[i], stroke: theme.surface, strokeWidth: 2 }}
                        connectNulls
                        isAnimationActive={false}
                    />
                ))}
            </LineChart>
        </ResponsiveContainer>
    )
}

/** Monitoring score (0-100) over time, drawn over labelled category bands. Single series → no legend. */
export function ScoreTrendChart({ data, height = 260 }) {
    const theme = useChartTheme()
    const pts = data.filter((d) => d.score != null).map((d) => ({ ...d, label: formatDay(d.date) }))
    return (
        <ResponsiveContainer width="100%" height={height}>
            <LineChart data={pts} margin={{ top: 8, right: 72, bottom: 0, left: -16 }}>
                {CATEGORY_BANDS.map((b) => (
                    <ReferenceArea
                        key={b.name}
                        y1={b.y1}
                        y2={b.y2}
                        fill={CATEGORY_STYLE[b.name].color}
                        fillOpacity={0.08}
                        stroke="none"
                        ifOverflow="hidden"
                        label={{ value: CATEGORY_STYLE[b.name].short, position: "right", fill: theme.muted, fontSize: 11 }}
                    />
                ))}
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps(theme)} minTickGap={16} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 70, 100]} {...axisProps(theme)} />
                <Tooltip
                    cursor={{ stroke: theme.axis, strokeWidth: 1 }}
                    content={<ChartTooltip theme={theme} valueFormatter={(v, p) => `${v}/100 · ${p.payload.category || ""}`} />}
                />
                <Line
                    type="monotone"
                    dataKey="score"
                    name="Monitoring score"
                    stroke={theme.series[0]}
                    strokeWidth={2}
                    dot={{ r: 4, fill: theme.series[0], stroke: theme.surface, strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: theme.series[0], stroke: theme.surface, strokeWidth: 2 }}
                    isAnimationActive={false}
                />
            </LineChart>
        </ResponsiveContainer>
    )
}

/** Single-series column chart (e.g. check-ins per month). One hue for every column. */
export function ColumnChart({ data, xKey, yKey, name, xFormatter = (v) => v, height = 240 }) {
    const theme = useChartTheme()
    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey={xKey} tickFormatter={xFormatter} {...axisProps(theme)} />
                <YAxis allowDecimals={false} {...axisProps(theme)} />
                <Tooltip cursor={{ fill: theme.grid, opacity: 0.5 }} content={<ChartTooltip theme={theme} labelFormatter={xFormatter} />} />
                <Bar dataKey={yKey} name={name} fill={theme.series[0]} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    <LabelList dataKey={yKey} position="top" fill={theme.muted} fontSize={11} />
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    )
}

/**
 * Horizontal bars, one per category, value at the tip.
 * colorFor(row) may return a status color (for concern categories); otherwise the single series hue.
 */
export function HBarChart({ data, labelKey = "label", valueKey = "value", name = "Count", colorFor, height }) {
    const theme = useChartTheme()
    const h = height || Math.max(120, data.length * 40 + 20)
    return (
        <ResponsiveContainer width="100%" height={h}>
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 8 }}>
                <CartesianGrid stroke={theme.grid} horizontal={false} />
                <XAxis type="number" allowDecimals={false} {...axisProps(theme)} />
                <YAxis type="category" dataKey={labelKey} width={150} {...axisProps(theme)} />
                <Tooltip cursor={{ fill: theme.grid, opacity: 0.5 }} content={<ChartTooltip theme={theme} />} />
                <Bar dataKey={valueKey} name={name} maxBarSize={24} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    {data.map((row, i) => <Cell key={i} fill={colorFor ? colorFor(row) : theme.series[0]} />)}
                    <LabelList dataKey={valueKey} position="right" fill={theme.muted} fontSize={11} />
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    )
}

/** KPI stat tile: label · value · optional hint. */
export function StatTile({ label, value, hint, icon: Icon, accent = false }) {
    return (
        <Card className="p-5 bg-card/50 backdrop-blur border-border">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className={cn("text-3xl font-semibold mt-1", accent ? "gradient-text" : "text-foreground")}>{value ?? "—"}</p>
                    {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
                </div>
                {Icon && <div className="p-2.5 rounded-xl bg-primary/10 shrink-0"><Icon className="w-5 h-5 text-primary" aria-hidden="true" /></div>}
            </div>
        </Card>
    )
}

/** Single-series trend (e.g. wellbeing score 0-100). One brand hue, no legend. */
export function ValueTrendChart({ data, dataKey = "value", name = "Value", domain = [0, 100], ticks, height = 240, suffix = "" }) {
    const theme = useChartTheme()
    const pts = data.filter((d) => d[dataKey] != null).map((d) => ({ ...d, label: formatDay(d.date) }))
    return (
        <ResponsiveContainer width="100%" height={height}>
            <LineChart data={pts} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps(theme)} minTickGap={16} />
                <YAxis domain={domain} ticks={ticks} {...axisProps(theme)} />
                <Tooltip cursor={{ stroke: theme.axis, strokeWidth: 1 }} content={<ChartTooltip theme={theme} valueFormatter={(v) => `${v}${suffix}`} />} />
                <Line type="monotone" dataKey={dataKey} name={name} stroke={theme.series[0]} strokeWidth={2} dot={{ r: 4, fill: theme.series[0], stroke: theme.surface, strokeWidth: 2 }} activeDot={{ r: 6, fill: theme.series[0], stroke: theme.surface, strokeWidth: 2 }} isAnimationActive={false} />
            </LineChart>
        </ResponsiveContainer>
    )
}
