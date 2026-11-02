import * as React from "react"
import { cn } from "@/lib/utils"

/** Label + control + hint/error, wired up for accessibility (aria-describedby / aria-invalid). */
export function Field({ id, label, error, hint, required, children, className }) {
    const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined
    const control = React.isValidElement(children)
        ? React.cloneElement(children, {
            id,
            "aria-invalid": error ? true : undefined,
            "aria-describedby": describedBy,
            className: cn(children.props.className, error && "border-destructive focus-visible:ring-destructive/50"),
        })
        : children
    return (
        <div className={cn("space-y-2", className)}>
            {label && (
                <label htmlFor={id} className="text-sm font-medium leading-none">
                    {label}
                    {required && <span className="text-destructive" aria-hidden="true"> *</span>}
                </label>
            )}
            {control}
            {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
            {error && <p id={`${id}-error`} className="text-xs text-destructive">{error}</p>}
        </div>
    )
}

export const Select = React.forwardRef(({ className, children, ...props }, ref) => (
    <select
        ref={ref}
        className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className
        )}
        {...props}
    >
        {children}
    </select>
))
Select.displayName = "Select"
