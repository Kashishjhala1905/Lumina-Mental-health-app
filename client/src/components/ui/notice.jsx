import { AlertCircle, CheckCircle2, Info, Loader2, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

const STYLES = {
    error: { box: "border-destructive/30 bg-destructive/10 text-destructive", Icon: AlertCircle },
    success: { box: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300", Icon: CheckCircle2 },
    info: { box: "border-primary/30 bg-primary/10 text-primary", Icon: Info },
    warning: { box: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300", Icon: AlertTriangle },
}

/** Inline status message (errors, success, info). Announced to screen readers. */
export function Notice({ type = "info", children, className, title }) {
    if (!children && !title) return null
    const { box, Icon } = STYLES[type] || STYLES.info
    return (
        <div role={type === "error" ? "alert" : "status"} className={cn("flex gap-2 rounded-md border px-3 py-2 text-sm", box, className)}>
            <Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="space-y-0.5">
                {title && <p className="font-semibold">{title}</p>}
                {children && <div>{children}</div>}
            </div>
        </div>
    )
}

export function LoadingState({ label = "Loading...", className }) {
    return (
        <div className={cn("flex items-center justify-center gap-2 py-12 text-muted-foreground", className)} role="status" aria-live="polite">
            <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
            <span>{label}</span>
        </div>
    )
}

export function EmptyState({ icon = Info, title, children, action, className }) {
    const Icon = icon
    return (
        <div className={cn("text-center py-10 px-4 text-muted-foreground", className)}>
            <Icon className="w-10 h-10 mx-auto mb-3 opacity-30" aria-hidden="true" />
            {title && <p className="font-medium text-foreground">{title}</p>}
            {children && <div className="text-sm mt-1">{children}</div>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    )
}
