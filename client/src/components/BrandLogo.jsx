import { cn } from "@/lib/utils"

// The official Lumina logo (client/public/logo.png, 275×192, opaque white background).
// Shown unmodified on a small white rounded tile so it looks deliberate on light AND dark backgrounds.
// Height drives the size; width follows the image's own aspect ratio (object-contain, never stretched).
const LOGO_SRC = `${import.meta.env.BASE_URL}logo.png`

const SIZES = {
    sm: "h-8",   // footer
    md: "h-9",   // navbar (same height as the previous brand mark)
    lg: "h-14",  // authentication pages
}

export default function BrandLogo({ size = "md", className, alt = "Lumina logo" }) {
    return (
        <span
            className={cn(
                "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-black/5 dark:ring-white/10 shadow-sm",
                SIZES[size] || SIZES.md,
                className
            )}
            // Inline style (not the bg-white class) so the global dark-mode overrides keep it white
            style={{ backgroundColor: "#ffffff" }}
        >
            <img
                src={LOGO_SRC}
                alt={alt}
                width={275}
                height={192}
                decoding="async"
                className="h-full w-auto max-w-none object-contain"
            />
        </span>
    )
}
