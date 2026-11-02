import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import PageShell from '@/components/PageShell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, Select } from '@/components/ui/field'
import { Notice, LoadingState, EmptyState } from '@/components/ui/notice'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Bot, ClipboardList, Lock, Mail, ShieldCheck } from 'lucide-react'
import api, { errorMessage } from '@/lib/api'
import { ChartCard, DataTable, ScaleTrendChart, ScoreTrendChart } from '@/components/charts/ChartKit'
import { CategoryBadge, DistressExplanationCard } from '@/components/victim-support/VSParts'
import { CreatePlanForm, SupportPlanCard } from '@/components/victim-support/SupportPlanEditor'
import ReferralManager from '@/components/victim-support/ReferralManager'
import { ALERT_STATUS_TONE, ANSWER_LABELS } from '@/components/victim-support/vsConstants'

const PRIORITY_TONE = { urgent: 'red', high: 'orange', normal: 'neutral' }
const TABS = ['overview', 'alerts', 'checkins', 'notes', 'plans', 'referrals']

function AiAnalysis({ ai }) {
    if (!ai || ai.status === 'skipped') return <p className="text-xs text-muted-foreground">No comment was provided, so no AI analysis was run.</p>
    if (ai.status === 'disabled') return <p className="text-xs text-muted-foreground">The user opted out of AI analysis. Please read the comment directly.</p>
    if (ai.status === 'unavailable') return <p className="text-xs text-muted-foreground">AI analysis was unavailable ({ai.reason || 'unknown reason'}). The rule-based score is unaffected – please read the comment directly.</p>
    const List = ({ label, items }) => items?.length ? (
        <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="flex flex-wrap gap-1 mt-0.5">{items.map((x) => <Badge key={x} tone="primary">{x}</Badge>)}</dd></div>
    ) : null
    return (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2 text-sm">
            <p className="font-medium flex flex-wrap items-center gap-2">
                <Bot className="w-4 h-4 text-primary" /> AI analysis (advisory – does not set the category)
                <Badge tone={ai.confidence === 'high' ? 'green' : ai.confidence === 'medium' ? 'amber' : 'neutral'}>Confidence: {ai.confidence}</Badge>
                {ai.humanReviewRecommended && <Badge tone="orange">Human review recommended</Badge>}
            </p>
            {ai.summary && <p>{ai.summary}</p>}
            <dl className="grid sm:grid-cols-3 gap-2">
                <List label="Emotional indicators" items={ai.emotionalIndicators} />
                <List label="Distress signals" items={ai.distressSignals} />
                <List label="Support needs" items={ai.supportNeeds} />
            </dl>
            {ai.evidence?.length > 0 && (
                <div>
                    <p className="text-xs text-muted-foreground">Supporting text evidence (verbatim excerpts)</p>
                    <ul className="mt-1 space-y-1">{ai.evidence.map((e) => <li key={e} className="border-l-2 border-primary/40 pl-2 italic">“{e}”</li>)}</ul>
                </div>
            )}
            {ai.uncertaintyNotes?.length > 0 && <p className="text-xs text-muted-foreground"><span className="font-medium">Uncertainty:</span> {ai.uncertaintyNotes.join(' ')}</p>}
            <p className="text-[11px] text-muted-foreground">Model {ai.model} · {ai.analyzedAt ? new Date(ai.analyzedAt).toLocaleString() : ''}</p>
        </div>
    )
}

function AlertPanel({ alert, statuses, onChanged }) {
    const [status, setStatus] = useState(alert.status)
    const [note, setNote] = useState('')
    const [state, setState] = useState({ saving: false, error: '', msg: '' })

    const saveStatus = async () => {
        setState({ saving: true, error: '', msg: '' })
        try {
            const { data } = await api.patch(`/counselor/alerts/${alert._id}/status`, { status, note: note.trim() || undefined })
            setNote('')
            setState({ saving: false, error: '', msg: data.message })
            onChanged()
        } catch (err) {
            setState({ saving: false, error: errorMessage(err), msg: '' })
        }
    }
    const addNote = async () => {
        if (!note.trim()) return
        setState({ saving: true, error: '', msg: '' })
        try {
            await api.post(`/counselor/alerts/${alert._id}/notes`, { note: note.trim() })
            setNote('')
            setState({ saving: false, error: '', msg: 'Private note added' })
            onChanged()
        } catch (err) {
            setState({ saving: false, error: errorMessage(err), msg: '' })
        }
    }

    return (
        <Card className="p-5 bg-card/50 backdrop-blur border-border">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-3">
                <div>
                    <h3 className="font-semibold flex flex-wrap items-center gap-2">
                        {alert.alertRef}
                        <Badge tone={PRIORITY_TONE[alert.priority]} className="capitalize">{alert.priority} priority</Badge>
                        {alert.isSynthetic && <Badge tone="blue">Synthetic</Badge>}
                    </h3>
                    <p className="text-xs text-muted-foreground">Created {new Date(alert.createdAt).toLocaleString()} · last triggered {new Date(alert.lastTriggeredAt).toLocaleString()} · {alert.occurrences} event(s) · score {alert.score}/100</p>
                </div>
                <div className="flex gap-2"><CategoryBadge category={alert.category} /><Badge tone={ALERT_STATUS_TONE[alert.status]}>{alert.status}</Badge></div>
            </div>
            <div className="grid lg:grid-cols-2 gap-5">
                <div>
                    <h4 className="text-sm font-semibold mb-2">Why this alert was raised</h4>
                    <ul className="space-y-1.5 text-sm">
                        {alert.triggerFactors.map((t, i) => (
                            <li key={i} className="border-l-2 border-primary/40 pl-2">
                                <span className="font-medium">{t.label}</span>
                                <span className="block text-xs text-muted-foreground">{t.detail} · {new Date(t.at).toLocaleString()}</span>
                            </li>
                        ))}
                    </ul>
                    <h4 className="text-sm font-semibold mt-4 mb-1">Status history</h4>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                        {alert.statusHistory.map((h, i) => <li key={i}>{new Date(h.changedAt).toLocaleString()}: {h.from ? `${h.from} → ` : ''}{h.to}</li>)}
                    </ul>
                </div>
                <div className="space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> Private review notes</h4>
                    {alert.reviewNotes.length === 0 ? <p className="text-xs text-muted-foreground">No notes yet.</p> : (
                        <ul className="space-y-2 max-h-48 overflow-y-auto">
                            {alert.reviewNotes.map((n) => (
                                <li key={n._id} className="rounded-md bg-muted/50 p-2 text-sm">
                                    <p className="whitespace-pre-wrap">{n.note}</p>
                                    <p className="text-[11px] text-muted-foreground mt-1">{n.authorName} · {new Date(n.createdAt).toLocaleString()}</p>
                                </li>
                            ))}
                        </ul>
                    )}
                    <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a private note (never visible to the user)" aria-label="Private review note" maxLength={2000} />
                    <div className="flex flex-wrap items-end gap-2">
                        <label className="text-sm">Status
                            <Select className="mt-1 w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
                                {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                            </Select>
                        </label>
                        <Button size="sm" onClick={saveStatus} disabled={state.saving || status === alert.status}>Update status</Button>
                        <Button size="sm" variant="outline" onClick={addNote} disabled={state.saving || !note.trim()}>Add note only</Button>
                    </div>
                    {state.error && <Notice type="error">{state.error}</Notice>}
                    {state.msg && <Notice type="success">{state.msg}</Notice>}
                </div>
            </div>
        </Card>
    )
}

function NotesPanel({ caseRef, notes, onChanged }) {
    const [form, setForm] = useState({ type: 'follow_up', content: '', followUpDate: '' })
    const [state, setState] = useState({ saving: false, error: '' })

    const submit = async (e) => {
        e.preventDefault()
        setState({ saving: true, error: '' })
        try {
            await api.post(`/counselor/cases/${caseRef}/notes`, { ...form, followUpDate: form.followUpDate || undefined })
            setForm({ type: form.type, content: '', followUpDate: '' })
            setState({ saving: false, error: '' })
            onChanged()
        } catch (err) {
            setState({ saving: false, error: errorMessage(err) })
        }
    }
    const toggle = async (n) => {
        try {
            await api.patch(`/counselor/cases/${caseRef}/notes/${n._id}`, { followUpStatus: n.followUpStatus === 'pending' ? 'completed' : 'pending' })
            onChanged()
        } catch (err) {
            setState({ saving: false, error: errorMessage(err) })
        }
    }

    return (
        <div className="grid lg:grid-cols-[1fr_1.4fr] gap-6">
            <Card className="p-5 bg-card/50 backdrop-blur border-border h-fit">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Lock className="w-4 h-4 text-primary" /> Record a note or follow-up</h3>
                <form onSubmit={submit} className="space-y-3">
                    <Field id="note-type" label="Type">
                        <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                            <option value="follow_up">Follow-up action</option>
                            <option value="note">Private case note</option>
                        </Select>
                    </Field>
                    <Field id="note-content" label={form.type === 'follow_up' ? 'Action to take / taken' : 'Note'} required>
                        <Textarea rows={3} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} maxLength={4000} />
                    </Field>
                    {form.type === 'follow_up' && (
                        <Field id="note-date" label="Due date">
                            <Input type="date" value={form.followUpDate} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} />
                        </Field>
                    )}
                    {state.error && <Notice type="error">{state.error}</Notice>}
                    <Button type="submit" disabled={state.saving || !form.content.trim()}>{state.saving ? 'Saving...' : 'Save'}</Button>
                    <p className="text-xs text-muted-foreground">Notes are encrypted and visible only to counselors assigned to this case.</p>
                </form>
            </Card>
            <div className="space-y-3">
                {notes.length === 0 ? <Card className="bg-card/50 backdrop-blur border-border"><EmptyState icon={ClipboardList} title="No notes or follow-ups yet" /></Card> : notes.map((n) => (
                    <Card key={n._id} className="p-4 bg-card/50 backdrop-blur border-border">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-xs text-muted-foreground mb-1">
                                    <Badge tone={n.type === 'follow_up' ? 'blue' : 'neutral'}>{n.type === 'follow_up' ? 'Follow-up' : 'Note'}</Badge>
                                    <span className="ml-2">{n.counselorName} · {new Date(n.createdAt).toLocaleString()}</span>
                                    {n.followUpDate && <span> · due {new Date(n.followUpDate).toLocaleDateString()}</span>}
                                </p>
                                <p className="text-sm whitespace-pre-wrap">{n.content}</p>
                            </div>
                            {n.type === 'follow_up' && (
                                <Button size="sm" variant="outline" onClick={() => toggle(n)} className="shrink-0">
                                    {n.followUpStatus === 'pending' ? 'Mark done' : 'Reopen'}
                                </Button>
                            )}
                        </div>
                        {n.type === 'follow_up' && <p className="text-xs mt-2"><Badge tone={n.followUpStatus === 'pending' ? 'amber' : 'green'}>{n.followUpStatus === 'pending' ? 'Pending' : `Completed ${n.completedAt ? new Date(n.completedAt).toLocaleDateString() : ''}`}</Badge></p>}
                    </Card>
                ))}
            </div>
        </div>
    )
}

export default function CounselorCase() {
    const { caseRef } = useParams()
    const [params, setParams] = useSearchParams()
    const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'overview'
    const [state, setState] = useState({ loading: true, error: '', status: 200, data: null })

    const load = useCallback(() => {
        setState((s) => ({ ...s, loading: true, error: '' }))
        api.get(`/counselor/cases/${caseRef}`)
            .then(({ data }) => setState({ loading: false, error: '', status: 200, data: data.data }))
            .catch((err) => setState((s) => ({ ...s, loading: false, error: errorMessage(err), status: err.response?.status })))
    }, [caseRef])

    useEffect(() => { load() }, [load])

    const back = <Button asChild variant="outline"><Link to="/counselor-dashboard?tab=cases"><ArrowLeft className="w-4 h-4 mr-1" /> All cases</Link></Button>

    if (!state.data) {
        return (
            <PageShell title="Case" highlight={caseRef} actions={back}>
                {state.loading ? <LoadingState label="Loading case..." /> : <Notice type="error" title={state.status === 403 ? 'Access denied' : 'Could not load case'}>{state.error}</Notice>}
            </PageShell>
        )
    }

    const { case: c, checkins, trends, alerts, notes, supportPlans, options, referrals = [] } = state.data
    const latest = checkins[0]?.assessment
    const openAlert = alerts.find((a) => a.status !== 'Resolved')
    const replacePlan = () => load()

    return (
        <PageShell title="Case" highlight={c.caseRef} subtitle="Confidential – access to this case is logged." actions={back}>
            <div className={state.loading ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
                <Card className="p-5 mb-6 bg-card/50 backdrop-blur border-border">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <p className="font-semibold text-lg">{c.user?.name || 'Deleted user'} {c.isSynthetic && <Badge tone="blue" className="ml-1">Synthetic demo case</Badge>}</p>
                            {c.user && <p className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> <a href={`mailto:${c.user.email}`} className="hover:text-primary">{c.user.email}</a>{c.user.username && ` · @${c.user.username}`}</p>}
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Consent {c.consentStatus === 'active' ? `active since ${new Date(c.consentGrantedAt).toLocaleDateString()}` : `withdrawn ${c.consentWithdrawnAt ? new Date(c.consentWithdrawnAt).toLocaleDateString() : ''} (records ${c.withdrawalDataChoice === 'retain' ? 'retained read-only' : 'deleted'})`}
                                {' · '}AI analysis {c.allowAiAnalysis ? 'allowed' : 'off'}{c.district && ` · ${c.district}`}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {c.latestScore != null && <span className="text-2xl font-semibold">{c.latestScore}<span className="text-sm text-muted-foreground">/100</span></span>}
                            <CategoryBadge category={c.latestCategory} />
                            {openAlert && <Badge tone={ALERT_STATUS_TONE[openAlert.status]}>{openAlert.alertRef} · {openAlert.status}</Badge>}
                        </div>
                    </div>
                    {c.consentStatus !== 'active' && <Notice type="warning" className="mt-4">The user withdrew consent. Do not continue monitoring; only close out open follow-ups as appropriate.</Notice>}
                </Card>

                <Tabs value={tab} onValueChange={(v) => setParams(v === 'overview' ? {} : { tab: v }, { replace: true })}>
                    <TabsList className="mb-6 flex-wrap h-auto">
                        <TabsTrigger value="overview">Overview & trends</TabsTrigger>
                        <TabsTrigger value="alerts">Alerts ({alerts.length})</TabsTrigger>
                        <TabsTrigger value="checkins">Check-ins ({checkins.length})</TabsTrigger>
                        <TabsTrigger value="notes">Notes & follow-ups ({notes.length})</TabsTrigger>
                        <TabsTrigger value="plans">Support plans ({supportPlans.length})</TabsTrigger>
                        <TabsTrigger value="referrals">Referrals ({referrals.length})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-6">
                        {latest ? <DistressExplanationCard assessment={latest} audience="counselor" /> : <Card className="bg-card/50 backdrop-blur border-border"><EmptyState title="No check-ins yet" /></Card>}
                        {trends.length > 0 && (
                            <>
                                <ChartCard title="Monitoring score over time" subtitle="0-100 with category bands" table={<DataTable columns={[{ key: 'date', label: 'Date', render: (r) => new Date(r.date).toLocaleString() }, { key: 'score', label: 'Score' }, { key: 'category', label: 'Category' }]} rows={trends} />}>
                                    <ScoreTrendChart data={trends} />
                                </ChartCard>
                                <div className="grid lg:grid-cols-2 gap-6">
                                    <ChartCard title="Emotional state & sleep" subtitle="1-5, higher is better" table={<DataTable columns={[{ key: 'date', label: 'Date', render: (r) => new Date(r.date).toLocaleDateString() }, { key: 'emotionalState', label: 'Emotional' }, { key: 'sleepQuality', label: 'Sleep' }]} rows={trends} />}>
                                        <ScaleTrendChart data={trends} series={[{ key: 'emotionalState', name: 'Emotional state' }, { key: 'sleepQuality', name: 'Sleep quality' }]} />
                                    </ChartCard>
                                    <ChartCard title="Stress & anxiety" subtitle="1-5, higher is more intense" table={<DataTable columns={[{ key: 'date', label: 'Date', render: (r) => new Date(r.date).toLocaleDateString() }, { key: 'stressLevel', label: 'Stress' }, { key: 'anxietyLevel', label: 'Anxiety' }]} rows={trends} />}>
                                        <ScaleTrendChart data={trends} series={[{ key: 'stressLevel', name: 'Stress' }, { key: 'anxietyLevel', name: 'Anxiety' }]} />
                                    </ChartCard>
                                </div>
                            </>
                        )}
                    </TabsContent>

                    <TabsContent value="alerts" className="space-y-4">
                        {alerts.length === 0 ? <Card className="bg-card/50 backdrop-blur border-border"><EmptyState title="No alerts for this case" /></Card>
                            : alerts.map((a) => <AlertPanel key={a._id + a.updatedAt} alert={a} statuses={options.alertStatuses} onChanged={load} />)}
                    </TabsContent>

                    <TabsContent value="checkins" className="space-y-3">
                        {checkins.length === 0 ? <Card className="bg-card/50 backdrop-blur border-border"><EmptyState title="No check-ins yet" /></Card> : checkins.map((ci) => (
                            <details key={ci._id} className="group rounded-xl border border-border bg-card/50 backdrop-blur">
                                <summary className="cursor-pointer list-none p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div>
                                        <p className="font-medium text-sm">{new Date(ci.createdAt).toLocaleString()}{ci.isSynthetic && ' · Synthetic'}</p>
                                        <p className="text-xs text-muted-foreground">
                                            Emotional {ci.emotionalState}/5 · Stress {ci.stressLevel}/5 · Anxiety {ci.anxietyLevel}/5 · Safety: {ANSWER_LABELS[ci.safetyConcern] || 'skipped'}
                                            {ci.requestCounselorContact && ' · Requested contact'}{ci.hasComment && ' · Has comment'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {ci.assessment && <span className="text-sm tabular-nums text-muted-foreground">{ci.assessment.score}/100</span>}
                                        <CategoryBadge category={ci.assessment?.category} />
                                    </div>
                                </summary>
                                <div className="px-4 pb-4 space-y-3 text-sm">
                                    <dl className="grid sm:grid-cols-3 gap-x-4 gap-y-1">
                                        <div><dt className="text-xs text-muted-foreground">Sleep quality</dt><dd>{ci.sleepQuality ? `${ci.sleepQuality}/5` : 'Skipped'}</dd></div>
                                        <div><dt className="text-xs text-muted-foreground">Daily functioning</dt><dd>{ci.dailyFunctioning ? `${ci.dailyFunctioning}/5` : 'Skipped'}</dd></div>
                                        <div><dt className="text-xs text-muted-foreground">Support available</dt><dd>{ANSWER_LABELS[ci.socialSupport] || 'Skipped'}</dd></div>
                                        <div><dt className="text-xs text-muted-foreground">Needs professional help</dt><dd>{ANSWER_LABELS[ci.needsProfessionalHelp] || 'Skipped'}</dd></div>
                                    </dl>
                                    {ci.comments && <div><p className="text-xs text-muted-foreground mb-1">User comment</p><p className="rounded-lg bg-muted/50 p-3 whitespace-pre-wrap">{ci.comments}</p></div>}
                                    <AiAnalysis ai={ci.assessment?.ai} />
                                    {ci.assessment && <DistressExplanationCard assessment={ci.assessment} title="Rule-based monitoring result" audience="counselor" />}
                                </div>
                            </details>
                        ))}
                    </TabsContent>

                    <TabsContent value="notes"><NotesPanel caseRef={c.caseRef} notes={notes} onChanged={load} /></TabsContent>

                    <TabsContent value="plans" className="space-y-6">
                        {supportPlans.map((p) => <SupportPlanCard key={p._id + p.updatedAt} plan={p} options={options} onUpdated={replacePlan} />)}
                        {c.user && <CreatePlanForm caseRef={c.caseRef} options={options} onCreated={replacePlan} />}
                    </TabsContent>

                    <TabsContent value="referrals">
                        <ReferralManager caseRef={c.caseRef} referrals={referrals} categories={options.supportCategories} supportPlans={supportPlans} canCreate={!!c.user && c.consentStatus === 'active'} onChanged={load} />
                    </TabsContent>
                </Tabs>
            </div>
        </PageShell>
    )
}
