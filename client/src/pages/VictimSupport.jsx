import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageShell from '@/components/PageShell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { ClipboardCheck, EyeOff, HeartHandshake, LineChart, Lock, ShieldCheck, UserCheck, Users } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import api from '@/lib/api'
import { homeFor } from '@/lib/roles'
import { UrgentSupportCard } from '@/components/victim-support/VSParts'
import { PROTOTYPE_NOTICE } from '@/components/victim-support/vsConstants'

const STEPS = [
    { icon: ShieldCheck, title: 'You give consent', text: 'Nothing is monitored until you read how your information is used and agree. You can withdraw at any time.' },
    { icon: ClipboardCheck, title: 'Short check-ins', text: 'Answer a few simple questions about how you are doing. Skip anything you prefer not to answer. You never have to describe what happened.' },
    { icon: LineChart, title: 'Transparent monitoring', text: 'A rule-based score shows how things are changing over time and exactly which answers contributed to it.' },
    { icon: HeartHandshake, title: 'A counselor reviews', text: 'When answers suggest you may need support, a trained counselor assigned to you reviews them and can build a support plan with you.' },
]

const PROMISES = [
    { icon: Lock, title: 'Separate and confidential', text: 'Kept apart from your general wellness data. Free-text comments are encrypted when stored.' },
    { icon: EyeOff, title: 'Your chats stay private', text: 'Conversations with the AI chat assistant are never shared with counselors or administrators.' },
    { icon: UserCheck, title: 'Human decisions', text: 'Alerts are reviewed by people. Lumina never contacts police or authorities automatically.' },
    { icon: Users, title: 'Anonymised statistics', text: 'Administrators see only pseudonymous case references and aggregate numbers, never your answers.' },
]

export default function VictimSupport() {
    const { user } = useAuth()
    const [consent, setConsent] = useState(undefined)

    useEffect(() => {
        if (user?.role !== 'user') return
        api.get('/victim-support/consent')
            .then(({ data }) => setConsent(data.data.consent))
            .catch(() => setConsent(null))
    }, [user])

    let cta
    if (!user) {
        cta = (
            <>
                <Button asChild size="lg"><Link to="/register">Create a free account</Link></Button>
                <Button asChild size="lg" variant="outline"><Link to="/login" state={{ from: '/victim-support/consent' }}>Sign in</Link></Button>
            </>
        )
    } else if (user.role !== 'user') {
        cta = <Button asChild size="lg"><Link to={homeFor(user)}>Go to your {user.role} dashboard</Link></Button>
    } else if (consent?.status === 'active') {
        cta = (
            <>
                <Button asChild size="lg"><Link to="/victim-support/check-in">Start a check-in</Link></Button>
                <Button asChild size="lg" variant="outline"><Link to="/victim-support/dashboard">View my monitoring</Link></Button>
            </>
        )
    } else {
        cta = <Button asChild size="lg"><Link to="/victim-support/consent">{consent?.status === 'withdrawn' ? 'Review consent again' : 'Read consent information'}</Link></Button>
    }

    return (
        <PageShell maxWidth="max-w-6xl">
            <section className="relative text-center py-8 md:py-14 overflow-hidden">
                <div className="absolute inset-0 pointer-events-none -z-10">
                    <div className="absolute top-0 left-10 w-72 h-72 bg-primary/20 rounded-full blur-[100px] animate-pulse" />
                    <div className="absolute bottom-0 right-10 w-72 h-72 bg-secondary/20 rounded-full blur-[100px] animate-pulse delay-1000" />
                </div>
                <div className="inline-flex items-center gap-2 bg-card border border-primary/20 rounded-full px-4 py-2 mb-6">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium gradient-text">Consent-based · Confidential</span>
                </div>
                <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-5 leading-tight">
                    Confidential <span className="gradient-text">Victim Support</span>
                </h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
                    A safe, private space for people affected by violence or atrocities to check in on their well-being over time
                    and get coordinated support from trained counselors — at your own pace, with your consent.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">{cta}</div>
                {consent?.status === 'active' && <p className="text-xs text-muted-foreground mt-3">Monitoring is active · Case reference {consent.caseRef}</p>}
            </section>

            <section className="mb-12">
                <h2 className="text-2xl font-bold text-foreground mb-6 text-center">How it works</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {STEPS.map((s, i) => (
                        <Card key={s.title} className="p-6 bg-card/50 backdrop-blur border-border hover:border-primary/50 transition-colors">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center text-white shrink-0"><s.icon className="w-5 h-5" /></div>
                                <span className="text-xs font-semibold text-primary">Step {i + 1}</span>
                            </div>
                            <h3 className="font-semibold text-foreground mb-1">{s.title}</h3>
                            <p className="text-sm text-muted-foreground">{s.text}</p>
                        </Card>
                    ))}
                </div>
            </section>

            <section className="mb-12">
                <h2 className="text-2xl font-bold text-foreground mb-6 text-center">Our privacy commitments</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                    {PROMISES.map((p) => (
                        <Card key={p.title} className="p-5 bg-card/50 backdrop-blur border-border flex gap-4">
                            <p.icon className="w-6 h-6 text-primary shrink-0 mt-0.5" aria-hidden="true" />
                            <div>
                                <h3 className="font-semibold text-foreground">{p.title}</h3>
                                <p className="text-sm text-muted-foreground">{p.text}</p>
                            </div>
                        </Card>
                    ))}
                </div>
                <Notice type="info" className="mt-4">{PROTOTYPE_NOTICE} It is not an emergency service.</Notice>
            </section>

            <UrgentSupportCard />
        </PageShell>
    )
}
