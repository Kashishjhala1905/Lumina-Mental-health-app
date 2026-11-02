import { cn } from "@/lib/utils"

const TONES = {
    neutral: "bg-muted text-muted-foreground border-border",
    primary: "bg-primary/10 text-primary border-primary/30",
    green: "bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-300",
    amber: "bg-amber-500/10 text-amber-700 border-amber-500/40 dark:text-amber-300",
    orange: "bg-orange-500/15 text-orange-700 border-orange-500/40 dark:text-orange-300",
    red: "bg-red-500/15 text-red-700 border-red-500/40 dark:text-red-300",
    blue: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300",
}

export function Badge({ tone = "neutral", className, children, ...props }) {
    return (
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone] || TONES.neutral, className)} {...props}>
            {children}
        </span>
    )
}
