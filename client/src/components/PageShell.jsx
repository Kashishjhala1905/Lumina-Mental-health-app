import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { cn } from '@/lib/utils'

/** Standard Lumina page layout (same structure as the existing pages). */
export default function PageShell({ title, highlight, subtitle, actions, children, maxWidth = 'max-w-7xl', className }) {
    return (
        <div className="flex flex-col min-h-screen bg-background">
            <Navbar />
            <main id="main-content" className={cn('flex-1 px-4 sm:px-6 lg:px-8 py-10 md:py-12 mx-auto w-full', maxWidth, className)}>
                {(title || highlight) && (
                    <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                        <div>
                            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
                                {title} {highlight && <span className="gradient-text">{highlight}</span>}
                            </h1>
                            {subtitle && <p className="text-muted-foreground mt-2 max-w-3xl">{subtitle}</p>}
                        </div>
                        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
                    </div>
                )}
                {children}
            </main>
            <Footer />
        </div>
    )
}
