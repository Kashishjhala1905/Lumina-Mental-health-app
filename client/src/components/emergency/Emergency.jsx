import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Phone, AlertCircle, BookOpen, ExternalLink } from "lucide-react"

export default function EmergencyComponent() {
    const hotlines = [
        { name: "Jeevan Aastha Helpline (Suicide & Emotional Distress)", number: "1800-233-3330", available: "24/7" },
        { name: "Tele-MANAS — National Mental Health Helpline", text: "Call 14416 or 1-800-891-4416", available: "24/7" },
        {
            name: "International Association for Suicide Prevention",
            number: "Visit https://findahelpline.com/countries/in/topics/suicidal-thoughts",
            available: "24/7",
            link: true
        },
    ]

    const techniques = [
        {
            title: "5-4-3-2-1 Grounding",
            steps: [
                "Name 5 things you see",
                "4 things you can touch",
                "3 things you hear",
                "2 things you smell",
                "1 thing you taste",
            ],
        },
        {
            title: "Box Breathing",
            steps: [
                "Inhale for 4 counts",
                "Hold for 4 counts",
                "Exhale for 4 counts",
                "Hold for 4 counts",
                "Repeat 4-5 times",
            ],
        },
    ]

    return (
        <div className="space-y-8">
            <Card className="p-8 bg-destructive/10 border-destructive/30 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-destructive/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

                <div className="relative z-10 flex flex-col md:flex-row gap-6 items-start md:items-center">
                    <div className="p-4 rounded-full bg-destructive/20 text-destructive shrink-0">
                        <AlertCircle className="w-8 h-8" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold text-foreground mb-2">If you're in immediate danger</h2>
                        <p className="text-muted-foreground mb-6 md:mb-0">
                            Please call emergency services (112 in India) or go to your nearest emergency room immediately.
                        </p>
                    </div>
                    <Button asChild size="lg" className="bg-destructive hover:bg-destructive/90 text-white gap-2 shadow-lg shadow-destructive/20 w-full md:w-auto">
                        <a href="tel:112">
                            <Phone className="w-5 h-5" />
                            Call Emergency Services (112)
                        </a>
                    </Button>
                </div>
            </Card>

            <div>
                <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
                    <Phone className="w-6 h-6 text-primary" />
                    Crisis Hotlines
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {hotlines.map((hotline, i) => (
                        <Card key={i} className="p-6 border-border bg-card/50 backdrop-blur hover:border-primary/50 transition-colors group">
                            <h3 className="font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">{hotline.name}</h3>
                            <div className="flex items-center justify-between mt-4">
                                <p className="text-sm font-medium text-foreground">
                                    {hotline.link ? (
                                        <span className="flex items-center gap-1 text-primary">
                                            <a href="https://findahelpline.com/countries/in/topics/suicidal-thoughts"> Visit Website</a> <ExternalLink className="w-3 h-3" />
                                        </span>
                                    ) : (
                                        hotline.number || hotline.text
                                    )}
                                </p>
                                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded font-medium">{hotline.available}</span>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>

            <div>
                <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
                    <BookOpen className="w-6 h-6 text-primary" />
                    Quick Coping Techniques
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {techniques.map((technique, i) => (
                        <Card key={i} className="p-6 border-border bg-card/50 backdrop-blur hover:border-primary/50 transition-colors">
                            <h3 className="font-semibold text-foreground text-lg mb-4 pb-2 border-b border-border">{technique.title}</h3>
                            <ol className="space-y-3">
                                {technique.steps.map((step, idx) => (
                                    <li key={idx} className="text-sm text-foreground flex gap-3 items-center">
                                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary font-semibold text-xs flex items-center justify-center shrink-0">
                                            {idx + 1}
                                        </span>
                                        {step}
                                    </li>
                                ))}
                            </ol>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    )
}
