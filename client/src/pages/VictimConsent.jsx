import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PageShell from '@/components/PageShell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { Notice, LoadingState } from '@/components/ui/notice'
import { Badge } from '@/components/ui/badge'
import { Bot, Database, Eye, FileCheck2, Scale, ShieldCheck, Trash2 } from 'lucide-react'
import api, { errorMessage } from '@/lib/api'
import { VSNav, UrgentSupportCard } from '@/components/victim-support/VSParts'
import { PROTOTYPE_NOTICE } from '@/components/victim-support/vsConstants'

const SECTIONS = [
    {
        icon: Database,
        title: 'What we collect',
        points: [
            'Your answers to short well-being check-ins (emotional state, stress, anxiety, sleep, daily functioning, sense of safety, support available, and whether you want help).',
            'Any optional comment you choose to write. You never need to describe a traumatic incident.',
            'The date and time of each check-in, and an optional district you may provide for anonymous statistics.',
        ],
    },
    {
        icon: Scale,
        title: 'How it is used',
        points: [
            'A transparent, rule-based monitoring score is calculated from your answers and how they change over time.',
            'If you allow it, an AI model analyses your optional comment to help counselors understand support needs. AI never decides your monitoring category.',
            'Configured rules can raise an alert for human review, for example if you report feeling unsafe or ask for counselor contact.',
        ],
    },
    {
        icon: Eye,
        title: 'Who can access it',
        points: [
            'You can see all of your own check-ins and results.',
            'Only the trained counselor assigned to your case can see your answers, comments, name and email, in order to support you.',
            'Administrators see only a pseudonymous case reference (for example VS-4K7Q2M) and aggregate statistics, never your answers.',
            'Your general AI chat conversations are never shared with counselors or administrators.',
        ],
    },
    {
        icon: Trash2,
        title: 'Your choices & data retention',
        points: [
            'You can withdraw consent at any time. Monitoring, AI processing and reminders stop immediately.',
            'When withdrawing, you choose to keep your past records read-only or to delete them. Kept records are deleted automatically after the retention period.',
            'You can download a copy of your data at any time from your dashboard.',
        ],
    },
]

const ACKS = [
    { key: 'dataCollection', label: 'I understand what information is collected.' },
    { key: 'dataUsage', label: 'I understand how my information is used, including rule-based scoring and optional AI analysis.' },
    { key: 'authorizedAccess', label: 'I agree that my assigned counselor can view my check-ins to support me.' },
    { key: 'notEmergencyService', label: 'I understand Lumina is not an emergency service and will not contact authorities on my behalf.' },
    { key: 'prototypeNotice', label: 'I understand the monitoring score is a prototype indicator, not a medical diagnosis.' },
]

export default function VictimConsent() {
    const navigate = useNavigate()
    const [consent, setConsent] = useState(undefined)
    const [loadError, setLoadError] = useState('')
    const [acks, setAcks] = useState({})
    const [allowAi, setAllowAi] = useState(true)
    const [district, setDistrict] = useState('')
    const [enableReminders, setEnableReminders] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        api.get('/victim-support/consent')
            .then(({ data }) => {
                setConsent(data.data.consent)
                if (data.data.consent) {
                    setAllowAi(data.data.consent.allowAiAnalysis)
                    setDistrict(data.data.consent.district || '')
                }
            })
            .catch((err) => { setLoadError(errorMessage(err)); setConsent(null) })
    }, [])

    const allAcknowledged = ACKS.every((a) => acks[a.key])

    const submit = async (e) => {
        e.preventDefault()
        if (!allAcknowledged) { setError('Please read and confirm each statement to continue.'); return }
        setSaving(true)
        setError('')
        try {
            await api.post('/victim-support/consent', {
                acknowledgements: acks,
                allowAiAnalysis: allowAi,
                district: district.trim(),
                enableReminders,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            })
            navigate('/victim-support/check-in', { replace: true, state: { justConsented: true } })
        } catch (err) {
            setError(errorMessage(err))
            setSaving(false)
        }
    }

    if (consent === undefined) return <PageShell maxWidth="max-w-4xl"><LoadingState label="Loading consent status..." /></PageShell>

    const active = consent?.status === 'active'

    return (
        <PageShell title="Consent &" highlight="Privacy" subtitle="Please read how the Confidential Victim Support module works before deciding. Taking part is completely voluntary." maxWidth="max-w-4xl">
            {active && <VSNav active="consent" />}
            {loadError && <Notice type="error" className="mb-4">{loadError}</Notice>}

            {active && (
                <Card className="p-5 mb-6 bg-card/50 backdrop-blur border-primary/30">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <p className="font-semibold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> Monitoring is active <Badge tone="green">Consent given</Badge></p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Case reference {consent.caseRef} · consent version {consent.consentVersion} · given {new Date(consent.grantedAt).toLocaleDateString()}
                                {' · '}AI analysis of comments {consent.allowAiAnalysis ? 'allowed' : 'turned off'}
                            </p>
                        </div>
                        <Button asChild variant="outline"><Link to="/victim-support/dashboard?tab=settings">Manage or withdraw consent</Link></Button>
                    </div>
                </Card>
            )}
            {consent?.status === 'withdrawn' && (
                <Notice type="warning" className="mb-6" title="You withdrew consent">
                    Monitoring stopped on {new Date(consent.withdrawnAt).toLocaleDateString()}.
                    {consent.dataDeletedAt ? ' Your records were deleted.' : ' Your past records are kept read-only.'} You can give consent again below if you wish.
                </Notice>
            )}

            <div className="grid md:grid-cols-2 gap-4 mb-6">
                {SECTIONS.map((s) => (
                    <Card key={s.title} className="p-5 bg-card/50 backdrop-blur border-border">
                        <h2 className="font-semibold text-foreground flex items-center gap-2 mb-3"><s.icon className="w-5 h-5 text-primary" aria-hidden="true" /> {s.title}</h2>
                        <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
                            {s.points.map((p) => <li key={p}>{p}</li>)}
                        </ul>
                    </Card>
                ))}
            </div>
            <Notice type="info" className="mb-6">{PROTOTYPE_NOTICE}</Notice>

            {!active && (
                <Card className="p-6 bg-card/50 backdrop-blur border-border mb-8">
                    <form onSubmit={submit} className="space-y-5" noValidate>
                        <fieldset className="space-y-3">
                            <legend className="font-semibold text-foreground flex items-center gap-2 mb-2"><FileCheck2 className="w-5 h-5 text-primary" /> Your consent</legend>
                            {ACKS.map((a) => (
                                <label key={a.key} className="flex items-start gap-3 text-sm cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="mt-0.5 h-4 w-4 rounded border-primary/30 text-primary focus:ring-primary"
                                        checked={!!acks[a.key]}
                                        onChange={(e) => setAcks({ ...acks, [a.key]: e.target.checked })}
                                    />
                                    <span>{a.label}</span>
                                </label>
                            ))}
                        </fieldset>

                        <fieldset className="space-y-3 border-t border-border pt-5">
                            <legend className="font-semibold text-foreground mb-2">Optional settings</legend>
                            <label className="flex items-start gap-3 text-sm cursor-pointer">
                                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={allowAi} onChange={(e) => setAllowAi(e.target.checked)} />
                                <span><span className="font-medium inline-flex items-center gap-1"><Bot className="w-4 h-4" /> Allow AI analysis of my optional comments</span><span className="block text-xs text-muted-foreground">If off, comments are only read by your counselor. Your monitoring score works either way.</span></span>
                            </label>
                            <label className="flex items-start gap-3 text-sm cursor-pointer">
                                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={enableReminders} onChange={(e) => setEnableReminders(e.target.checked)} />
                                <span><span className="font-medium">Send me gentle in-app check-in reminders</span><span className="block text-xs text-muted-foreground">Every 3 days by default. You can change or turn this off any time.</span></span>
                            </label>
                            <Field id="district" label="District (optional)" hint="Used only for anonymous, aggregated statistics. Leave blank if you prefer.">
                                <Input value={district} onChange={(e) => setDistrict(e.target.value)} maxLength={80} placeholder="e.g. Indore" />
                            </Field>
                        </fieldset>

                        {error && <Notice type="error">{error}</Notice>}
                        <div className="flex flex-wrap gap-3">
                            <Button type="submit" disabled={saving || !allAcknowledged}>{saving ? 'Saving...' : 'I agree – start monitoring'}</Button>
                            <Button asChild variant="outline"><Link to="/victim-support">Not now</Link></Button>
                        </div>
                    </form>
                </Card>
            )}

            <UrgentSupportCard />
        </PageShell>
    )
}
