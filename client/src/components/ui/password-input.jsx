import * as React from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { passwordChecks } from "@/lib/password"

/** Password input with a show/hide toggle. All props (id, aria-*) go to the real <input>. */
export const PasswordInput = React.forwardRef(({ className, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false)
    return (
        <div className="relative">
            <Input ref={ref} type={visible ? "text" : "password"} className={cn("pr-10", className)} {...props} />
            <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 text-muted-foreground hover:text-primary"
                aria-label={visible ? "Hide password" : "Show password"}
            >
                {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
        </div>
    )
})
PasswordInput.displayName = "PasswordInput"

export function PasswordStrength({ password }) {
    const checks = passwordChecks(password)
    const passed = checks.filter((c) => c.ok).length
    const label = passed <= 1 ? "Weak" : passed <= 3 ? "Fair" : "Strong"
    return (
        <div className="space-y-1.5" aria-live="polite">
            <div className="flex gap-1" aria-hidden="true">
                {checks.map((c, i) => (
                    <div key={i} className={cn("h-1.5 flex-1 rounded-full", i < passed ? (passed === 4 ? "bg-green-500" : "bg-gradient-primary") : "bg-muted")} />
                ))}
            </div>
            <p className="text-xs text-muted-foreground">
                Strength: <span className="font-medium">{password ? label : "—"}</span>
                {" · "}
                {checks.map((c) => (
                    <span key={c.label} className={cn("mr-2", c.ok ? "text-green-600" : "")}>{c.ok ? "✓" : "○"} {c.label}</span>
                ))}
            </p>
        </div>
    )
}
