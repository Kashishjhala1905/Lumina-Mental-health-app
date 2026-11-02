import { Link } from "react-router-dom"
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Bot, Minus, Phone, ShieldAlert, Sparkles } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CATEGORY_STYLE, HELPLINES, PROTOTYPE_NOTICE } from "./vsConstants"
import { cn } from "@/lib/utils"

const CATEGORY_ICON = {
    "Low Concern": "●",
    "Moderate Concern": "▲",
    "High Concern": "◆",
    "Urgent Support Needed": "■",
}

/** Monitoring category with a status colour + a shape + the text label (never colour alone). */
export function CategoryBadge({ category, className }) {
    if (!category) return <Badge className={className}>No data</Badge>
    const style = CATEGORY_STYLE[category]
    return (
        <Badge tone={style?.tone || "neutral"} className={className}>
            <span aria-hidden="true">{CATEGORY_ICON[category]}</span> {category}
        </Badge>
    )
}

function TrendIndicator({ trend }) {
    if (!trend || trend.direction === "baseline") return <span className="text-xs text-muted-foreground">Baseline (first check-in)</span>
    const map = {
        worsening: { Icon: ArrowUpRight, text: "Higher concern than recent check-ins" },
        improving: { Icon: ArrowDownRight, text: "Lower concern than recent check-ins" },
        stable: { Icon: Minus, text: "Similar to recent check-ins" },
    }
    const { Icon, text } = map[trend.direction] || map.stable
    return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {text} ({trend.delta > 0 ? "+" : ""}{trend.delta} vs. average of {trend.basedOnCheckins})
        </span>
    )
}

/**
 * Explainable distress monitoring card: score, category, previous category, contributing factors,
 * explanation, recommended action, timestamp, rule version and the prototype disclaimer.
 */
export function DistressExplanationCard({ assessment, title = "Latest monitoring result", audience = "user", className }) {
    if (!assessment) return null
    const factors = (assessment.factors || []).filter((f) => f.points > 0 || f.key === "crisisLanguage")
    const ai = assessment.ai || {}
    return (
        <Card className={cn("p-6 bg-card/50 backdrop-blur border-border", className)}>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                <div>
                    <h3 className="font-semibold text-foreground text-lg">{title}</h3>
                    <p className="text-xs text-muted-foreground">
                        {new Date(assessment.createdAt).toLocaleString()} · Rule version {assessment.ruleVersion}
                        {assessment.isSynthetic && " · Synthetic demo data"}
                    </p>
                </div>
                <div className="text-left sm:text-right">
                    <p className="text-4xl font-semibold text-foreground leading-none">{assessment.score}<span className="text-base text-muted-foreground">/100</span></p>
                    <div className="mt-2 flex sm:justify-end"><CategoryBadge category={assessment.category} /></div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-sm">
                <span className="text-muted-foreground">Previous: {assessment.previousCategory ? <CategoryBadge category={assessment.previousCategory} /> : "—"}</span>
                <TrendIndicator trend={assessment.trend} />
            </div>

            <div className="grid md:grid-cols-2 gap-5">
                <div>
                    <h4 className="text-sm font-semibold mb-2">Contributing factors</h4>
                    {factors.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No elevated factors were reported.</p>
                    ) : (
                        <ul className="space-y-1.5">
                            {factors.map((f) => (
                                <li key={f.key} className="flex items-start justify-between gap-3 text-sm">
                                    <span>
                                        <span className="font-medium">{f.label}</span>
                                        {f.detail && <span className="block text-xs text-muted-foreground">{f.detail}</span>}
                                    </span>
                                    <span className="tabular-nums text-muted-foreground shrink-0">{f.points > 0 ? `+${f.points}` : "override"}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {assessment.overridesApplied?.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-3"><span className="font-medium">Rule override:</span> {assessment.overridesApplied.join("; ")}</p>
                    )}
                </div>
                <div className="space-y-3">
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                        <h4 className="text-sm font-semibold mb-1 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-primary" aria-hidden="true" /> Recommended next step</h4>
                        <p className="text-sm">{assessment.recommendedAction}</p>
                    </div>
                    <details className="text-sm">
                        <summary className="cursor-pointer text-primary">How was this calculated?</summary>
                        <p className="mt-2 text-muted-foreground">{assessment.explanation}</p>
                    </details>
                    {audience === "user" && ai.status === "completed" && (ai.emotionalIndicators?.length > 0 || ai.summary) && (
                        <div className="text-xs text-muted-foreground border-t border-border pt-2">
                            <span className="font-medium inline-flex items-center gap-1"><Bot className="w-3.5 h-3.5" aria-hidden="true" /> AI note on your comment (advisory only):</span>{" "}
                            {ai.summary || ai.emotionalIndicators.join(", ")}
                        </div>
                    )}
                </div>
            </div>
            <p className="text-xs text-muted-foreground mt-5 border-t border-border pt-3">{PROTOTYPE_NOTICE}</p>
        </Card>
    )
}

/** Urgent support resources – static, always available (independent of AI or the server). */
export function UrgentSupportCard({ prominent = false, className }) {
    return (
        <Card className={cn("p-6 border-border", prominent ? "bg-destructive/10 border-destructive/40" : "bg-card/50 backdrop-blur", className)} role="region" aria-label="Urgent support helplines">
            <div className="flex items-start gap-3 mb-4">
                <div className={cn("p-2.5 rounded-full shrink-0", prominent ? "bg-destructive/20 text-destructive" : "bg-primary/10 text-primary")}>
                    {prominent ? <ShieldAlert className="w-5 h-5" aria-hidden="true" /> : <Phone className="w-5 h-5" aria-hidden="true" />}
                </div>
                <div>
                    <h3 className="font-semibold text-foreground">{prominent ? "If you are in danger or need help now" : "Urgent support"}</h3>
                    <p className="text-sm text-muted-foreground">
                        {prominent
                            ? "Please call 112 if you are in immediate danger. You can also reach these free helplines at any time."
                            : "Free helplines you can call at any time. Lumina does not contact these services on your behalf."}
                    </p>
                </div>
            </div>
            <ul className="grid sm:grid-cols-2 gap-2">
                {HELPLINES.map((h) => (
                    <li key={h.name} className="rounded-lg border border-border px-3 py-2 hover:border-primary/50 transition-colors">
                        <a href={`tel:${h.tel}`} className="flex items-center justify-between gap-3">
                            <span className="text-sm">
                                <span className="font-medium block">{h.name}</span>
                                <span className="text-xs text-muted-foreground">{h.note}</span>
                            </span>
                            <span className="font-semibold tabular-nums text-primary shrink-0">{h.number}</span>
                        </a>
                        <a href={h.source} target="_blank" rel="noopener noreferrer" className="text-[11px] text-muted-foreground hover:text-primary hover:underline">
                            Official source: {h.source.replace(/^https?:\/\//, '')}
                        </a>
                    </li>
                ))}
            </ul>
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> Lumina is not connected to these services and never contacts them on your behalf. More options on the <Link to="/emergency" className="text-primary hover:underline">Emergency page</Link>.
            </p>
        </Card>
    )
}

/** Sub-navigation for the user's Victim Support area. */
export function VSNav({ active }) {
    const items = [
        { to: "/victim-support/dashboard", key: "dashboard", label: "My monitoring" },
        { to: "/victim-support/check-in", key: "check-in", label: "New check-in" },
        { to: "/victim-support/consent", key: "consent", label: "Consent & privacy" },
    ]
    return (
        <nav aria-label="Victim support" className="flex flex-wrap gap-2 mb-6">
            {items.map((i) => (
                <Link
                    key={i.key}
                    to={i.to}
                    aria-current={active === i.key ? "page" : undefined}
                    className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium border transition-all",
                        active === i.key ? "bg-gradient-primary text-white border-transparent" : "border-border hover:border-primary/50"
                    )}
                >
                    {i.label}
                </Link>
            ))}
        </nav>
    )
}
