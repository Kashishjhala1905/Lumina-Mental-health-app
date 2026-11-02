import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageShell from '@/components/PageShell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, Select } from '@/components/ui/field'
import { Notice, LoadingState, EmptyState } from '@/components/ui/notice'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Activity, BellRing, ClipboardList, Download, HeartHandshake, ListChecks, ShieldCheck } from 'lucide-react'
import api, { errorMessage } from '@/lib/api'
import { ChartCard, DataTable, ScaleTrendChart, ScoreTrendChart, StatTile } from '@/components/charts/ChartKit'
import { formatDay } from '@/components/charts/chartUtils'
import { CategoryBadge, DistressExplanationCard, UrgentSupportCard, VSNav } from '@/components/victim-support/VSParts'
import UserReferrals from '@/components/victim-support/UserReferrals'
import { ALERT_STATUS_TONE, ANSWER_LABELS, FREQUENCY_LABELS, PLAN_STATUS_TONE } from '@/components/victim-support/vsConstants'

const TABS = ['overview', 'history', 'plan', 'settings']

function scaleTable(rows, keys) {
    return (
        <DataTable
            columns={[{ key: 'date', label: 'Date', render: (r) => new Date(r.date).toLocaleDateString() }, ...keys.map(([key, label]) => ({ key, label, render: (r) => (r[key] == null ? 'skipped' : `${r[key]}/5`) }))]}
            rows={rows}
        />
    )
}

function Overview({ data }) {
    const { summary, trends, alerts, consent, reminder } = data
    const latest = summary.latestAssessment
    return (
        <div className="space-y-6">
            {summary.hasSyntheticData && <Notice type="info">Some records shown here are synthetic demo data.</Notice>}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatTile label="Check-ins" value={summary.totalCheckins} icon={ClipboardList} hint={consent.lastCheckinAt ? `Last: ${new Date(consent.lastCheckinAt).toLocaleDateString()}` : 'None yet'} />
                <StatTile label="Latest score" value={latest ? `${latest.score}/100` : '—'} icon={Activity} hint={latest?.category || 'No check-ins yet'} />
                <StatTile label="Counselor contact requests" value={summary.supportRequests} icon={HeartHandshake} hint="In your recent check-ins" />
                <StatTile label="Next reminder" value={reminder?.enabled && reminder.nextReminderAt ? formatDay(reminder.nextReminderAt) : 'Off'} icon={BellRing} hint={reminder?.enabled ? FREQUENCY_LABELS[reminder.frequency] : 'Turn on in Settings'} />
            </div>

            {summary.openAlert && (
                <Notice type="warning" title={`Your check-in is with a counselor · ${summary.openAlert.status}`}>
                    Reference {summary.openAlert.alertRef}. Reasons: {summary.openAlert.reasons.join('; ')}.
                    {summary.openAlert.status === 'Contact Initiated' && ' Your counselor is reaching out to you.'}
                </Notice>
            )}

            {!latest ? (
                <Card className="bg-card/50 backdrop-blur border-border">
                    <EmptyState icon={ClipboardList} title="No check-ins yet" action={consent.status === 'active' && <Button asChild><Link to="/victim-support/check-in">Start your first check-in</Link></Button>}>
                        Your trends and monitoring results will appear here after your first check-in.
                    </EmptyState>
                </Card>
            ) : (
                <>
                    <DistressExplanationCard assessment={latest} />
                    <ChartCard
                        title="Monitoring score over time"
                        subtitle="0-100, higher means more concern. Shaded bands show the monitoring categories."
                        table={<DataTable columns={[{ key: 'date', label: 'Date', render: (r) => new Date(r.date).toLocaleString() }, { key: 'score', label: 'Score' }, { key: 'category', label: 'Category' }]} rows={trends} />}
                        empty={trends.length === 0}
                    >
                        <ScoreTrendChart data={trends} />
                    </ChartCard>
                    <div className="grid lg:grid-cols-2 gap-6">
                        <ChartCard title="Emotional state & sleep" subtitle="1-5, higher is better" table={scaleTable(trends, [['emotionalState', 'Emotional state'], ['sleepQuality', 'Sleep quality']])}>
                            <ScaleTrendChart data={trends} series={[{ key: 'emotionalState', name: 'Emotional state' }, { key: 'sleepQuality', name: 'Sleep quality' }]} />
                        </ChartCard>
                        <ChartCard title="Stress & anxiety" subtitle="1-5, higher is more intense" table={scaleTable(trends, [['stressLevel', 'Stress'], ['anxietyLevel', 'Anxiety']])}>
                            <ScaleTrendChart data={trends} series={[{ key: 'stressLevel', name: 'Stress' }, { key: 'anxietyLevel', name: 'Anxiety' }]} />
                        </ChartCard>
                    </div>
                </>
            )}

            <Card className="p-5 bg-card/50 backdrop-blur border-border">
                <h3 className="font-semibold text-foreground mb-3">Support requests & alerts</h3>
                {alerts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No check-ins have been flagged for counselor review.</p>
                ) : (
                    <ul className="divide-y divide-border">
                        {alerts.map((a) => (
                            <li key={a.alertRef} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                    <p className="text-sm font-medium">{a.alertRef} · {new Date(a.createdAt).toLocaleDateString()}</p>
                                    <p className="text-xs text-muted-foreground">{a.reasons.join('; ')}</p>
                                </div>
                                <div className="flex gap-2 items-center">
                                    <CategoryBadge category={a.category} />
                                    <Badge tone={ALERT_STATUS_TONE[a.status]}>{a.status}</Badge>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
            <UrgentSupportCard />
        </div>
    )
}

function History() {
    const [page, setPage] = useState(1)
    const [state, setState] = useState({ loading: true, error: '', rows: [], pagination: null })

    useEffect(() => {
        let cancelled = false
        setState((s) => ({ ...s, loading: true, error: '' }))
        api.get(`/victim-support/checkins?page=${page}&limit=8`)
            .then(({ data }) => { if (!cancelled) setState({ loading: false, error: '', rows: data.data, pagination: data.pagination }) })
            .catch((err) => { if (!cancelled) setState((s) => ({ ...s, loading: false, error: errorMessage(err) })) })
        return () => { cancelled = true }
    }, [page])

    if (state.error) return <Notice type="error">{state.error}</Notice>
    if (!state.pagination && state.loading) return <LoadingState label="Loading check-in history..." />
    if (!state.rows.length) return <Card className="bg-card/50 backdrop-blur border-border"><EmptyState icon={ListChecks} title="No check-ins yet" /></Card>

    return (
        <div className={state.loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            <div className="space-y-3">
                {state.rows.map((c) => (
                    <details key={c._id} className="group rounded-xl border border-border bg-card/50 backdrop-blur">
                        <summary className="cursor-pointer list-none p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <p className="font-medium text-sm">{new Date(c.createdAt).toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground">
                                    Emotional {c.emotionalState}/5 · Stress {c.stressLevel}/5 · Anxiety {c.anxietyLevel}/5
                                    {c.requestCounselorContact && ' · Requested counselor contact'}
                                    {c.isSynthetic && ' · Synthetic'}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {c.assessment && <span className="text-sm tabular-nums text-muted-foreground">{c.assessment.score}/100</span>}
                                <CategoryBadge category={c.assessment?.category} />
                                <span className="text-xs text-primary group-open:hidden">Details</span>
                            </div>
                        </summary>
                        <div className="px-4 pb-4 space-y-3 text-sm">
                            <dl className="grid sm:grid-cols-3 gap-x-4 gap-y-1">
                                <div><dt className="text-xs text-muted-foreground">Sleep quality</dt><dd>{c.sleepQuality ? `${c.sleepQuality}/5` : 'Skipped'}</dd></div>
                                <div><dt className="text-xs text-muted-foreground">Daily functioning</dt><dd>{c.dailyFunctioning ? `${c.dailyFunctioning}/5` : 'Skipped'}</dd></div>
                                <div><dt className="text-xs text-muted-foreground">Safety</dt><dd>{ANSWER_LABELS[c.safetyConcern] || 'Skipped'}</dd></div>
                                <div><dt className="text-xs text-muted-foreground">Support available</dt><dd>{ANSWER_LABELS[c.socialSupport] || 'Skipped'}</dd></div>
                                <div><dt className="text-xs text-muted-foreground">Needs professional help</dt><dd>{ANSWER_LABELS[c.needsProfessionalHelp] || 'Skipped'}</dd></div>
                            </dl>
                            {c.comments && <p className="rounded-lg bg-muted/50 p-3 whitespace-pre-wrap">{c.comments}</p>}
                            {c.assessment && <DistressExplanationCard assessment={c.assessment} title="Monitoring result for this check-in" />}
                        </div>
                    </details>
                ))}
            </div>
            {state.pagination.pages > 1 && (
                <div className="flex items-center justify-between mt-4 text-sm">
                    <Button variant="outline" size="sm" disabled={page <= 1 || state.loading} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                    <span className="text-muted-foreground">Page {state.pagination.page} of {state.pagination.pages} · {state.pagination.total} check-ins</span>
                    <Button variant="outline" size="sm" disabled={page >= state.pagination.pages || state.loading} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
            )}
        </div>
    )
}

function SupportPlans({ plans }) {
    if (!plans.length) {
        return (
            <Card className="bg-card/50 backdrop-blur border-border">
                <EmptyState icon={HeartHandshake} title="No support plan yet">
                    When your counselor creates a support plan with you, it will appear here.
                </EmptyState>
            </Card>
        )
    }
    return (
        <div className="space-y-6">
            {plans.map((p) => (
                <Card key={p._id} className="p-6 bg-card/50 backdrop-blur border-border">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-3">
                        <div>
                            <h3 className="font-semibold text-lg text-foreground">{p.title}</h3>
                            <p className="text-xs text-muted-foreground">By {p.counselorName || 'your counselor'} · updated {new Date(p.updatedAt).toLocaleDateString()}</p>
                        </div>
                        <Badge tone={p.status === 'active' ? 'primary' : 'green'} className="capitalize">{p.status}</Badge>
                    </div>
                    {p.summary && <p className="text-sm text-muted-foreground mb-4">{p.summary}</p>}
                    <ul className="space-y-3">
                        {p.items.map((i) => (
                            <li key={i._id} className="rounded-lg border border-border p-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div>
                                        <p className="font-medium text-sm">{i.title}</p>
                                        <p className="text-xs text-muted-foreground">{i.category}</p>
                                    </div>
                                    <Badge tone={PLAN_STATUS_TONE[i.status]}>{i.status}{i.status === 'Completed' && i.externallyConfirmed ? ' · confirmed' : ''}</Badge>
                                </div>
                                {i.description && <p className="text-sm mt-2">{i.description}</p>}
                                {i.referral && <p className="text-xs text-muted-foreground mt-1">Referred to: {i.referral.organization}{i.referral.contactInfo ? ` (${i.referral.contactInfo})` : ''}</p>}
                                {i.followUpDate && <p className="text-xs text-muted-foreground mt-1">Follow-up: {new Date(i.followUpDate).toLocaleDateString()}</p>}
                            </li>
                        ))}
                    </ul>
                    <p className="text-xs text-muted-foreground mt-4">Referrals to outside services are marked complete only after delivery has been confirmed.</p>
                </Card>
            ))}
        </div>
    )
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const REMINDER_TONE = { scheduled: 'primary', sent: 'green', failed: 'red', skipped: 'neutral' }
const browserTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'

function Settings({ data, reload }) {
    const consent = data.consent
    const active = consent.status === 'active'
    const [rem, setRem] = useState(null)
    const [recentReminders, setRecentReminders] = useState([])
    const [emailAvailable, setEmailAvailable] = useState(false)
    const [remState, setRemState] = useState({ saving: false, msg: '', err: '' })
    const [prefs, setPrefs] = useState({ allowAiAnalysis: consent.allowAiAnalysis, district: consent.district || '' })
    const [prefState, setPrefState] = useState({ saving: false, msg: '', err: '' })
    const [withdrawChoice, setWithdrawChoice] = useState('')
    const [withdrawState, setWithdrawState] = useState({ saving: false, msg: '', err: '' })
    const [deleteText, setDeleteText] = useState('')
    const [deleteState, setDeleteState] = useState({ saving: false, msg: '', err: '' })

    useEffect(() => {
        api.get('/victim-support/reminders')
            .then(({ data: r }) => {
                setRem({ ...r.data, timezone: r.data.timezone || browserTz() })
                setRecentReminders(r.recent || [])
                setEmailAvailable(r.emailAvailable)
            })
            .catch((err) => setRemState({ saving: false, msg: '', err: errorMessage(err) }))
    }, [])

    const saveReminders = async (e) => {
        e.preventDefault()
        setRemState({ saving: true, msg: '', err: '' })
        try {
            const { data: r } = await api.put('/victim-support/reminders', {
                enabled: rem.enabled, frequency: rem.frequency, preferredHour: Number(rem.preferredHour), timezone: rem.timezone,
                channels: { inApp: rem.channels.inApp, email: emailAvailable ? rem.channels.email : false },
            })
            setRem(r.data)
            setRemState({ saving: false, msg: r.message, err: '' })
            reload()
        } catch (err) {
            setRemState({ saving: false, msg: '', err: errorMessage(err) })
        }
    }

    const savePrefs = async (e) => {
        e.preventDefault()
        setPrefState({ saving: true, msg: '', err: '' })
        try {
            const { data: r } = await api.patch('/victim-support/consent/preferences', prefs)
            setPrefState({ saving: false, msg: r.message, err: '' })
            reload()
        } catch (err) {
            setPrefState({ saving: false, msg: '', err: errorMessage(err) })
        }
    }

    const withdraw = async () => {
        if (!withdrawChoice) { setWithdrawState({ saving: false, msg: '', err: 'Please choose what should happen to your existing data.' }); return }
        if (!window.confirm(withdrawChoice === 'delete' ? 'Withdraw consent and permanently delete your victim-support data?' : 'Withdraw consent and stop monitoring?')) return
        setWithdrawState({ saving: true, msg: '', err: '' })
        try {
            const { data: r } = await api.post('/victim-support/consent/withdraw', { dataChoice: withdrawChoice })
            setWithdrawState({ saving: false, msg: r.message, err: '' })
            reload()
        } catch (err) {
            setWithdrawState({ saving: false, msg: '', err: errorMessage(err) })
        }
    }

    const exportData = async () => {
        try {
            const { data: r } = await api.get('/victim-support/export')
            const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `lumina-victim-support-${consent.caseRef}.json`
            a.click()
            URL.revokeObjectURL(url)
        } catch (err) {
            window.alert(errorMessage(err))
        }
    }

    const deleteData = async () => {
        setDeleteState({ saving: true, msg: '', err: '' })
        try {
            const { data: r } = await api.delete('/victim-support/data', { data: { confirm: deleteText } })
            setDeleteState({ saving: false, msg: r.message, err: '' })
            setDeleteText('')
            reload()
        } catch (err) {
            setDeleteState({ saving: false, msg: '', err: errorMessage(err) })
        }
    }

    return (
        <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-6 bg-card/50 backdrop-blur border-border">
                <h3 className="font-semibold text-foreground mb-1 flex items-center gap-2"><BellRing className="w-5 h-5 text-primary" /> Check-in reminders</h3>
                <p className="text-xs text-muted-foreground mb-4">Reminders are gentle in-app notifications. They stop automatically if you withdraw consent.</p>
                {!rem ? <LoadingState /> : (
                    <form onSubmit={saveReminders} className="space-y-4">
                        <label className="flex items-center gap-3 text-sm">
                            <input type="checkbox" className="h-4 w-4" checked={rem.enabled} disabled={!active} onChange={(e) => setRem({ ...rem, enabled: e.target.checked })} />
                            Remind me to check in
                        </label>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <Field id="rem-frequency" label="How often">
                                <Select value={rem.frequency} onChange={(e) => setRem({ ...rem, frequency: e.target.value })} disabled={!rem.enabled}>
                                    {Object.entries(FREQUENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </Select>
                            </Field>
                            <Field id="rem-hour" label="Preferred time">
                                <Select value={rem.preferredHour} onChange={(e) => setRem({ ...rem, preferredHour: e.target.value })} disabled={!rem.enabled}>
                                    {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                                </Select>
                            </Field>
                        </div>
                        <Field id="rem-tz" label="Timezone" hint={`Your device reports ${browserTz()}.`}>
                            <Input value={rem.timezone} onChange={(e) => setRem({ ...rem, timezone: e.target.value })} disabled={!rem.enabled} />
                        </Field>
                        <label className="flex items-center gap-3 text-sm">
                            <input type="checkbox" className="h-4 w-4" checked={rem.channels.inApp} onChange={(e) => setRem({ ...rem, channels: { ...rem.channels, inApp: e.target.checked } })} disabled={!rem.enabled} />
                            In-app notification
                        </label>
                        <label className={`flex items-center gap-3 text-sm ${emailAvailable ? '' : 'opacity-60'}`}>
                            <input type="checkbox" className="h-4 w-4" checked={!!rem.channels.email} disabled={!emailAvailable || !rem.enabled} onChange={(e) => setRem({ ...rem, channels: { ...rem.channels, email: e.target.checked } })} />
                            Email (discreet wording){!emailAvailable && ' – not configured on this server'}
                        </label>
                        {rem.enabled && rem.nextReminderAt && <p className="text-xs text-muted-foreground">Next reminder: {new Date(rem.nextReminderAt).toLocaleString()}</p>}
                        {rem.pausedReason === 'consent_withdrawn' && <Notice type="info">Reminders were paused because consent was withdrawn.</Notice>}
                        {recentReminders.length > 0 && (
                            <details className="text-sm">
                                <summary className="cursor-pointer text-primary">Recent reminders ({recentReminders.length})</summary>
                                <ul className="mt-2 space-y-1">
                                    {recentReminders.map((e) => (
                                        <li key={e._id} className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-border/60 pb-1">
                                            <span>{new Date(e.scheduledFor).toLocaleString()}</span>
                                            <span className="flex gap-1">
                                                <Badge tone={REMINDER_TONE[e.status]}>{e.status}{e.skipReason ? ` · ${e.skipReason.replace(/_/g, ' ')}` : ''}</Badge>
                                                {e.channels.email && <Badge tone="neutral">email: {e.channels.email.replace(/_/g, ' ')}</Badge>}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-[11px] text-muted-foreground mt-1">"accepted" means the email provider accepted the message; it does not guarantee it reached your inbox.</p>
                            </details>
                        )}
                        {remState.err && <Notice type="error">{remState.err}</Notice>}
                        {remState.msg && <Notice type="success">{remState.msg}</Notice>}
                        <Button type="submit" disabled={remState.saving || !active}>{remState.saving ? 'Saving...' : 'Save reminder settings'}</Button>
                    </form>
                )}
            </Card>

            <Card className="p-6 bg-card/50 backdrop-blur border-border">
                <h3 className="font-semibold text-foreground mb-1 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> Consent preferences</h3>
                <p className="text-xs text-muted-foreground mb-4">Case reference {consent.caseRef} · consent version {consent.consentVersion} · {active ? 'active' : 'withdrawn'}</p>
                {active ? (
                    <form onSubmit={savePrefs} className="space-y-4">
                        <label className="flex items-start gap-3 text-sm">
                            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={prefs.allowAiAnalysis} onChange={(e) => setPrefs({ ...prefs, allowAiAnalysis: e.target.checked })} />
                            <span>Allow AI analysis of my optional comments<span className="block text-xs text-muted-foreground">Applies to future check-ins.</span></span>
                        </label>
                        <Field id="pref-district" label="District (optional)" hint="Used only for anonymised aggregate statistics.">
                            <Input value={prefs.district} maxLength={80} onChange={(e) => setPrefs({ ...prefs, district: e.target.value })} />
                        </Field>
                        {prefState.err && <Notice type="error">{prefState.err}</Notice>}
                        {prefState.msg && <Notice type="success">{prefState.msg}</Notice>}
                        <Button type="submit" disabled={prefState.saving}>{prefState.saving ? 'Saving...' : 'Save preferences'}</Button>
                    </form>
                ) : (
                    <div className="space-y-3">
                        <p className="text-sm">Consent withdrawn on {new Date(consent.withdrawnAt).toLocaleDateString()}. Monitoring, AI processing and reminders are stopped.</p>
                        <Button asChild><Link to="/victim-support/consent">Give consent again</Link></Button>
                    </div>
                )}
                <div className="border-t border-border mt-6 pt-4 space-y-2">
                    <h4 className="font-semibold text-sm">Your data</h4>
                    <Button type="button" variant="outline" size="sm" onClick={exportData}><Download className="w-4 h-4 mr-1" /> Download my data (JSON)</Button>
                </div>
            </Card>

            {active ? (
                <Card className="p-6 bg-card/50 backdrop-blur border-destructive/30 lg:col-span-2">
                    <h3 className="font-semibold text-foreground mb-1">Withdraw consent</h3>
                    <p className="text-sm text-muted-foreground mb-4">Monitoring, AI analysis of future check-ins and reminders stop immediately. Choose what happens to the records you already shared:</p>
                    <div className="grid sm:grid-cols-2 gap-3 mb-4">
                        {[
                            { v: 'retain', t: 'Keep my past records (read-only)', d: 'Your counselor can still see past check-ins to close any open follow-up. They are deleted automatically after the retention period.' },
                            { v: 'delete', t: 'Delete my past records now', d: 'Check-ins, results, alerts, support plans and counselor notes about you are permanently deleted.' },
                        ].map((o) => (
                            <label key={o.v} className={`rounded-lg border p-3 cursor-pointer text-sm ${withdrawChoice === o.v ? 'border-primary bg-primary/5' : 'border-border'}`}>
                                <input type="radio" name="withdrawChoice" value={o.v} className="mr-2" checked={withdrawChoice === o.v} onChange={() => setWithdrawChoice(o.v)} />
                                <span className="font-medium">{o.t}</span>
                                <span className="block text-xs text-muted-foreground mt-1">{o.d}</span>
                            </label>
                        ))}
                    </div>
                    {withdrawState.err && <Notice type="error" className="mb-3">{withdrawState.err}</Notice>}
                    {withdrawState.msg && <Notice type="success" className="mb-3">{withdrawState.msg}</Notice>}
                    <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10" onClick={withdraw} disabled={withdrawState.saving}>
                        {withdrawState.saving ? 'Withdrawing...' : 'Withdraw consent'}
                    </Button>
                </Card>
            ) : !consent.dataDeletedAt && (
                <Card className="p-6 bg-card/50 backdrop-blur border-destructive/30 lg:col-span-2">
                    <h3 className="font-semibold text-foreground mb-1">Delete my victim-support data</h3>
                    <p className="text-sm text-muted-foreground mb-4">Permanently delete your retained check-ins, results, alerts, support plans and counselor notes. Type <strong>DELETE</strong> to confirm.</p>
                    <div className="flex flex-col sm:flex-row gap-3 max-w-md">
                        <Input value={deleteText} onChange={(e) => setDeleteText(e.target.value)} placeholder="DELETE" aria-label="Type DELETE to confirm" />
                        <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10" disabled={deleteText !== 'DELETE' || deleteState.saving} onClick={deleteData}>
                            {deleteState.saving ? 'Deleting...' : 'Delete permanently'}
                        </Button>
                    </div>
                    {deleteState.err && <Notice type="error" className="mt-3">{deleteState.err}</Notice>}
                    {deleteState.msg && <Notice type="success" className="mt-3">{deleteState.msg}</Notice>}
                </Card>
            )}
        </div>
    )
}

export default function VictimDashboard() {
    const [params, setParams] = useSearchParams()
    const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'overview'
    const [state, setState] = useState({ loading: true, error: '', data: null })

    const load = useCallback(() => {
        setState((s) => ({ ...s, loading: true, error: '' }))
        api.get('/victim-support/dashboard')
            .then(({ data }) => setState({ loading: false, error: '', data: data.data }))
            .catch((err) => setState((s) => ({ ...s, loading: false, error: errorMessage(err) })))
    }, [])

    useEffect(() => { load() }, [load])

    const { data } = state
    const actions = data?.consent?.status === 'active' ? <Button asChild><Link to="/victim-support/check-in">New check-in</Link></Button> : null

    return (
        <PageShell title="My" highlight="monitoring" subtitle="Your check-ins, trends and support – visible only to you and your assigned counselor." actions={actions}>
            <VSNav active="dashboard" />
            {state.error && <Notice type="error" className="mb-4">{state.error} <button className="underline ml-1" onClick={load}>Retry</button></Notice>}
            {!data && state.loading && <LoadingState label="Loading your dashboard..." />}
            {data && !data.consent && (
                <Card className="bg-card/50 backdrop-blur border-border">
                    <EmptyState icon={ShieldCheck} title="You have not joined Confidential Victim Support" action={<Button asChild><Link to="/victim-support/consent">Read consent information</Link></Button>}>
                        Monitoring only starts after you read how your information is used and agree.
                    </EmptyState>
                </Card>
            )}
            {data?.consent && (
                <div className={state.loading ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
                    {data.consent.status === 'withdrawn' && (
                        <Notice type="warning" className="mb-4" title="Consent withdrawn – monitoring is stopped">
                            {data.consent.dataDeletedAt ? 'Your records were deleted.' : 'Your past records are kept read-only.'} You can give consent again at any time.
                        </Notice>
                    )}
                    <Tabs value={tab} onValueChange={(v) => setParams(v === 'overview' ? {} : { tab: v }, { replace: true })}>
                        <TabsList className="mb-6 flex-wrap h-auto">
                            <TabsTrigger value="overview">Overview</TabsTrigger>
                            <TabsTrigger value="history">Check-in history</TabsTrigger>
                            <TabsTrigger value="plan">Support plan & referrals{(data.supportPlans.length + (data.referrals?.length || 0)) ? ` (${data.supportPlans.length + (data.referrals?.length || 0)})` : ''}</TabsTrigger>
                            <TabsTrigger value="settings">Reminders & consent</TabsTrigger>
                        </TabsList>
                        <TabsContent value="overview"><Overview data={data} /></TabsContent>
                        <TabsContent value="history"><History /></TabsContent>
                        <TabsContent value="plan" className="space-y-6"><SupportPlans plans={data.supportPlans} /><UserReferrals referrals={data.referrals || []} onChanged={load} /></TabsContent>
                        <TabsContent value="settings"><Settings data={data} reload={load} /></TabsContent>
                    </Tabs>
                </div>
            )}
        </PageShell>
    )
}
