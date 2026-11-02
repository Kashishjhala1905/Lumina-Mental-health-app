import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageShell from '@/components/PageShell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import { Notice, LoadingState, EmptyState } from '@/components/ui/notice'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertTriangle, BellRing, Briefcase, Calendar, CheckCircle2, Clock, ClipboardList, FolderOpen, Send, User, XCircle } from 'lucide-react'
import { ReferralCard } from '@/components/victim-support/ReferralManager'
import api, { errorMessage } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { StatTile } from '@/components/charts/ChartKit'
import { CategoryBadge } from '@/components/victim-support/VSParts'
import { ALERT_STATUS_TONE, PLAN_STATUS_TONE } from '@/components/victim-support/vsConstants'

const ACTION_LABELS = {
    ALERT_CREATED: 'New alert created',
    ALERT_UPDATED: 'Alert received new activity',
    ALERT_STATUS_CHANGED: 'Alert status changed',
    ALERT_REVIEW_NOTE_ADDED: 'Review note added',
    CHECKIN_SUBMITTED: 'Check-in submitted',
    MONITORING_SCORE_GENERATED: 'Monitoring score generated',
    CONSENT_GRANTED: 'Consent granted',
    CONSENT_WITHDRAWN: 'Consent withdrawn',
    COUNSELOR_ASSIGNED: 'Case assigned',
    SUPPORT_PLAN_CREATED: 'Support plan created',
    SUPPORT_PLAN_UPDATED: 'Support plan updated',
    SUPPORT_PLAN_ITEM_ADDED: 'Support item added',
    SUPPORT_PLAN_ITEM_UPDATED: 'Support item updated',
    CASE_NOTE_ADDED: 'Private note added',
    FOLLOW_UP_RECORDED: 'Follow-up recorded',
    FOLLOW_UP_UPDATED: 'Follow-up updated',
    VS_DATA_DELETED: 'User deleted their data',
    REFERRAL_CREATED: 'Referral created',
    REFERRAL_STATUS_CHANGED: 'Referral status changed',
    REFERRAL_UPDATED: 'Referral updated',
    REFERRAL_NOTE_ADDED: 'Referral note added',
    REFERRAL_SHARE_CONSENT_CHANGED: 'User changed sharing permission',
    REMINDER_PREFERENCES_UPDATED: 'Reminder settings changed',
    CONSENT_PREFERENCES_UPDATED: 'Consent preferences changed',
}

const PRIORITY_TONE = { urgent: 'red', high: 'orange', normal: 'neutral' }

function Overview({ dash }) {
    const s = dash.stats
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatTile label="Assigned cases" value={s.totalAssignedCases} icon={Briefcase} hint={`${s.activeCases} with active consent`} />
                <StatTile label="New alerts" value={s.newAlerts} icon={BellRing} accent={s.newAlerts > 0} />
                <StatTile label="High-priority alerts" value={s.highPriorityAlerts} icon={AlertTriangle} hint="Open, high or urgent" />
                <StatTile label="Open alerts" value={s.openAlerts} icon={FolderOpen} />
                <StatTile label="Pending follow-ups" value={s.pendingFollowUps} icon={ClipboardList} />
                <StatTile label="Resolved alerts" value={s.resolvedCases} icon={CheckCircle2} />
                <StatTile label="Open referrals" value={s.openReferrals ?? 0} icon={Send} />
                <StatTile label="Referral follow-ups due" value={s.referralsDue ?? 0} icon={Clock} accent={s.referralsDue > 0} />
            </div>
            <Card className="p-5 bg-card/50 backdrop-blur border-border">
                <h3 className="font-semibold text-foreground mb-3">Recent activity on your cases</h3>
                {dash.recentActivity.length === 0 ? <p className="text-sm text-muted-foreground">No activity yet.</p> : (
                    <ul className="divide-y divide-border">
                        {dash.recentActivity.map((e, i) => (
                            <li key={i} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-sm">
                                <span>
                                    <span className="font-medium">{ACTION_LABELS[e.action] || e.action}</span>
                                    {e.alertRef && <span className="text-muted-foreground"> · {e.alertRef}</span>}
                                    {e.to && <span className="text-muted-foreground"> → {e.to}</span>}
                                    {e.category && <span className="text-muted-foreground"> · {e.category}</span>}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {e.caseRef && <Link to={`/counselor/cases/${e.caseRef}`} className="text-primary hover:underline mr-2">{e.caseRef}</Link>}
                                    {new Date(e.createdAt).toLocaleString()}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
        </div>
    )
}

function Cases({ cases }) {
    if (!cases.length) return <Card className="bg-card/50 backdrop-blur border-border"><EmptyState icon={Briefcase} title="No cases assigned yet">Cases are assigned automatically when a user enrolls, or by an administrator.</EmptyState></Card>
    return (
        <div className="grid gap-3">
            {cases.map((c) => (
                <Card key={c.caseRef} className="p-4 bg-card/50 backdrop-blur border-border hover:border-primary/50 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="font-semibold flex flex-wrap items-center gap-2">
                                <Link to={`/counselor/cases/${c.caseRef}`} className="hover:text-primary">{c.caseRef}</Link>
                                <span className="text-sm font-normal text-muted-foreground">{c.userName}</span>
                                {c.consentStatus !== 'active' && <Badge tone="neutral">Consent withdrawn</Badge>}
                                {c.isSynthetic && <Badge tone="blue">Synthetic</Badge>}
                                {c.openAlert?.hasNewActivity && <Badge tone="primary">New activity</Badge>}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {c.checkinCount} check-ins · last {c.lastCheckinAt ? new Date(c.lastCheckinAt).toLocaleString() : 'never'}
                                {c.pendingFollowUps > 0 && ` · ${c.pendingFollowUps} follow-up(s) pending`}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {c.latestScore != null && <span className="text-sm tabular-nums text-muted-foreground">{c.latestScore}/100</span>}
                            <CategoryBadge category={c.latestCategory} />
                            {c.openAlert && <Badge tone={ALERT_STATUS_TONE[c.openAlert.status]}>{c.openAlert.alertRef} · {c.openAlert.status}</Badge>}
                            <Button asChild size="sm" variant="outline"><Link to={`/counselor/cases/${c.caseRef}`}>Open case</Link></Button>
                        </div>
                    </div>
                </Card>
            ))}
        </div>
    )
}

function Alerts({ onChanged }) {
    const [filters, setFilters] = useState({ status: 'open', priority: '' })
    const [state, setState] = useState({ loading: true, error: '', rows: [] })
    const [busy, setBusy] = useState('')

    const load = useCallback(() => {
        const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString()
        setState((s) => ({ ...s, loading: true, error: '' }))
        api.get(`/counselor/alerts?${q}`)
            .then(({ data }) => setState({ loading: false, error: '', rows: data.data }))
            .catch((err) => setState((s) => ({ ...s, loading: false, error: errorMessage(err) })))
    }, [filters])

    useEffect(() => { load() }, [load])

    const updateStatus = async (alert, status) => {
        setBusy(alert._id)
        try {
            await api.patch(`/counselor/alerts/${alert._id}/status`, { status })
            load()
            onChanged()
        } catch (err) {
            window.alert(errorMessage(err))
        } finally {
            setBusy('')
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
                <label className="text-sm">Status
                    <Select className="mt-1 w-48" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                        <option value="open">All open</option>
                        <option value="New">New</option>
                        <option value="Under Review">Under Review</option>
                        <option value="Contact Initiated">Contact Initiated</option>
                        <option value="Resolved">Resolved</option>
                        <option value="">All</option>
                    </Select>
                </label>
                <label className="text-sm">Priority
                    <Select className="mt-1 w-40" value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })}>
                        <option value="">Any</option>
                        <option value="urgent">Urgent</option>
                        <option value="high">High</option>
                        <option value="normal">Normal</option>
                    </Select>
                </label>
            </div>
            {state.error && <Notice type="error">{state.error}</Notice>}
            {state.loading && !state.rows.length ? <LoadingState /> : state.rows.length === 0 ? (
                <Card className="bg-card/50 backdrop-blur border-border"><EmptyState icon={BellRing} title="No alerts match these filters" /></Card>
            ) : (
                <div className={`grid gap-3 ${state.loading ? 'opacity-60' : ''}`}>
                    {state.rows.map((a) => (
                        <Card key={a._id} className="p-4 bg-card/50 backdrop-blur border-border">
                            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-semibold flex flex-wrap items-center gap-2">
                                        {a.alertRef}
                                        <Link to={`/counselor/cases/${a.caseRef}`} className="text-sm font-normal text-primary hover:underline">{a.caseRef}</Link>
                                        <Badge tone={PRIORITY_TONE[a.priority]} className="capitalize">{a.priority} priority</Badge>
                                        {a.hasNewActivity && <Badge tone="primary">New activity</Badge>}
                                        {a.isSynthetic && <Badge tone="blue">Synthetic</Badge>}
                                    </p>
                                    <ul className="mt-1 text-sm text-muted-foreground list-disc pl-5">
                                        {[...new Set(a.triggerFactors.map((t) => t.label))].map((l) => <li key={l}>{l}</li>)}
                                    </ul>
                                    <p className="text-xs text-muted-foreground mt-1">Created {new Date(a.createdAt).toLocaleString()} · {a.occurrences} trigger event(s) · score {a.score}/100</p>
                                </div>
                                <div className="flex flex-col items-start lg:items-end gap-2 shrink-0">
                                    <div className="flex gap-2"><CategoryBadge category={a.category} /><Badge tone={ALERT_STATUS_TONE[a.status]}>{a.status}</Badge></div>
                                    <div className="flex flex-wrap gap-2">
                                        {a.status === 'New' && <Button size="sm" variant="outline" disabled={busy === a._id} onClick={() => updateStatus(a, 'Under Review')}>Start review</Button>}
                                        {['New', 'Under Review'].includes(a.status) && <Button size="sm" variant="outline" disabled={busy === a._id} onClick={() => updateStatus(a, 'Contact Initiated')}>Contact initiated</Button>}
                                        <Button asChild size="sm"><Link to={`/counselor/cases/${a.caseRef}`}>Review case</Link></Button>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}

function Plans() {
    const [state, setState] = useState({ loading: true, error: '', rows: [] })
    useEffect(() => {
        api.get('/counselor/support-plans')
            .then(({ data }) => setState({ loading: false, error: '', rows: data.data }))
            .catch((err) => setState({ loading: false, error: errorMessage(err), rows: [] }))
    }, [])
    if (state.loading) return <LoadingState />
    if (state.error) return <Notice type="error">{state.error}</Notice>
    if (!state.rows.length) return <Card className="bg-card/50 backdrop-blur border-border"><EmptyState icon={ClipboardList} title="No support plans yet">Open a case to create a support plan.</EmptyState></Card>
    return (
        <div className="grid gap-3">
            {state.rows.map((p) => (
                <Card key={p._id} className="p-4 bg-card/50 backdrop-blur border-border">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div>
                            <p className="font-semibold">{p.title} <span className="text-sm font-normal text-muted-foreground">· {p.caseRef}</span></p>
                            <p className="text-xs text-muted-foreground">Updated {new Date(p.updatedAt).toLocaleString()} · {p.items.length} item(s)</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 items-center">
                            {Object.entries(p.items.reduce((acc, i) => ({ ...acc, [i.status]: (acc[i.status] || 0) + 1 }), {})).map(([status, n]) => (
                                <Badge key={status} tone={PLAN_STATUS_TONE[status]}>{status}: {n}</Badge>
                            ))}
                            <Button asChild size="sm" variant="outline"><Link to={`/counselor/cases/${p.caseRef}?tab=plans`}>Manage</Link></Button>
                        </div>
                    </div>
                </Card>
            ))}
        </div>
    )
}

function Referrals() {
    const [filter, setFilter] = useState('open')
    const [state, setState] = useState({ loading: true, error: '', rows: [] })
    const load = useCallback(() => {
        const q = filter === 'due' ? 'due=1' : filter ? `status=${encodeURIComponent(filter)}` : ''
        setState((s) => ({ ...s, loading: true, error: '' }))
        api.get(`/counselor/referrals?${q}`)
            .then(({ data }) => setState({ loading: false, error: '', rows: data.data }))
            .catch((err) => setState((s) => ({ ...s, loading: false, error: errorMessage(err) })))
    }, [filter])
    useEffect(() => { load() }, [load])
    return (
        <div className="space-y-4">
            <label className="text-sm inline-block">Show
                <Select className="mt-1 w-56" value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="open">All open referrals</option>
                    <option value="due">Follow-up due</option>
                    {['Suggested', 'Accepted', 'Referred', 'Follow-up Pending', 'Completed', 'Unable to Connect'].map((s) => <option key={s} value={s}>{s}</option>)}
                    <option value="">All referrals</option>
                </Select>
            </label>
            {state.error && <Notice type="error">{state.error}</Notice>}
            {state.loading && !state.rows.length ? <LoadingState /> : state.rows.length === 0
                ? <Card className="bg-card/50 backdrop-blur border-border"><EmptyState icon={Send} title="No referrals match">Create referrals from a case's Referrals tab.</EmptyState></Card>
                : <div className={`grid gap-3 ${state.loading ? 'opacity-60' : ''}`}>{state.rows.map((r) => (
                    <div key={r._id + r.updatedAt}>
                        <ReferralCard referral={r} onUpdated={load} showCase />
                        <Link to={`/counselor/cases/${r.caseRef}?tab=referrals`} className="text-xs text-primary hover:underline ml-1">Open case {r.caseRef}</Link>
                    </div>
                ))}</div>}
        </div>
    )
}

// ---------------- Existing appointment management (preserved) ----------------
function Appointments() {
    const [appointments, setAppointments] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        api.get('/appointment/counselor')
            .then(({ data }) => { if (data.success) setAppointments(data.data) })
            .catch((err) => setError(errorMessage(err, 'Failed to fetch appointments')))
            .finally(() => setLoading(false))
    }, [])

    const handleStatusUpdate = async (id, status) => {
        try {
            const { data } = await api.patch(`/appointment/${id}/status`, { status })
            if (data.success) setAppointments(appointments.map((apt) => (apt._id === id ? { ...apt, status } : apt)))
        } catch (err) {
            window.alert(errorMessage(err, 'Failed to update status'))
        }
    }

    const getStatusColor = (status) => {
        switch (status) {
            case 'approved': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
            case 'rejected': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
            case 'completed': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
            default: return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
        }
    }

    return (
        <Card className="border-primary/20 bg-card/50 backdrop-blur">
            <CardHeader>
                <CardTitle>Appointment Requests</CardTitle>
                <CardDescription>Review and manage upcoming sessions</CardDescription>
            </CardHeader>
            <CardContent>
                {error && <Notice type="error" className="mb-4">{error}</Notice>}
                {loading ? (
                    <LoadingState label="Loading appointments..." />
                ) : appointments.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No appointments assigned yet.</p>
                ) : (
                    <div className="space-y-4">
                        {appointments.map((apt) => (
                            <div key={apt._id} className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors gap-4">
                                <div className="flex gap-4 items-start">
                                    <div className="p-3 rounded-full bg-primary/10 mt-1">
                                        <User className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-lg">{apt.userId?.name || "Member"}</h4>
                                        <p className="text-sm text-muted-foreground">{apt.userId?.email}</p>
                                        <div className="flex flex-wrap gap-4 mt-2 text-sm">
                                            <div className="flex items-center gap-1 text-muted-foreground">
                                                <Calendar className="w-4 h-4" />
                                                {new Date(apt.date).toLocaleDateString()}
                                            </div>
                                            <div className="flex items-center gap-1 text-muted-foreground">
                                                <Clock className="w-4 h-4" />
                                                {apt.time}
                                            </div>
                                        </div>
                                        <div className="mt-2 text-sm bg-muted/50 p-2 rounded">
                                            <span className="font-medium">Concern: </span>
                                            {apt.concern}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col items-end gap-3 min-w-[140px]">
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide ${getStatusColor(apt.status)}`}>
                                        {apt.status}
                                    </span>
                                    {apt.status === 'pending' && (
                                        <div className="flex gap-2">
                                            <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700" onClick={() => handleStatusUpdate(apt._id, 'approved')}>
                                                <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                                            </Button>
                                            <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" onClick={() => handleStatusUpdate(apt._id, 'rejected')}>
                                                <XCircle className="w-4 h-4 mr-1" /> Reject
                                            </Button>
                                        </div>
                                    )}
                                    {apt.status === 'approved' && (
                                        <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700" onClick={() => handleStatusUpdate(apt._id, 'completed')}>
                                            <CheckCircle2 className="w-4 h-4 mr-1" /> Mark Complete
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

const TABS = ['overview', 'cases', 'alerts', 'plans', 'referrals', 'appointments']

export default function CounselorDashboard() {
    const { user } = useAuth()
    const [params, setParams] = useSearchParams()
    const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'overview'
    const [state, setState] = useState({ loading: true, error: '', dash: null, cases: [] })

    const load = useCallback(() => {
        setState((s) => ({ ...s, loading: true, error: '' }))
        Promise.all([api.get('/counselor/dashboard'), api.get('/counselor/cases')])
            .then(([d, c]) => setState({ loading: false, error: '', dash: d.data.data, cases: c.data.data }))
            .catch((err) => setState((s) => ({ ...s, loading: false, error: errorMessage(err) })))
    }, [])

    useEffect(() => { load() }, [load])

    return (
        <PageShell title="Counselor" highlight="Dashboard" subtitle={`Welcome, ${user?.name}. Manage assigned victim-support cases, alerts, support plans and appointments.`}>
            {state.error && <Notice type="error" className="mb-4">{state.error} <button className="underline ml-1" onClick={load}>Retry</button></Notice>}
            <Tabs value={tab} onValueChange={(v) => setParams(v === 'overview' ? {} : { tab: v }, { replace: true })}>
                <TabsList className="mb-6 flex-wrap h-auto">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="cases">Cases{state.cases.length ? ` (${state.cases.length})` : ''}</TabsTrigger>
                    <TabsTrigger value="alerts">Alerts{state.dash?.stats.newAlerts ? ` (${state.dash.stats.newAlerts} new)` : ''}</TabsTrigger>
                    <TabsTrigger value="plans">Support plans</TabsTrigger>
                    <TabsTrigger value="referrals">Referrals{state.dash?.stats.referralsDue ? ` (${state.dash.stats.referralsDue} due)` : ''}</TabsTrigger>
                    <TabsTrigger value="appointments">Appointments</TabsTrigger>
                </TabsList>
                <TabsContent value="overview">{state.dash ? <Overview dash={state.dash} /> : <LoadingState />}</TabsContent>
                <TabsContent value="cases">{state.dash ? <Cases cases={state.cases} /> : <LoadingState />}</TabsContent>
                <TabsContent value="alerts"><Alerts onChanged={load} /></TabsContent>
                <TabsContent value="plans"><Plans /></TabsContent>
                <TabsContent value="referrals"><Referrals /></TabsContent>
                <TabsContent value="appointments"><Appointments /></TabsContent>
            </Tabs>
        </PageShell>
    )
}
