import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/field"
import { Notice, LoadingState, EmptyState } from "@/components/ui/notice"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Activity, BellRing, ClipboardList, FolderOpen, ScrollText, ShieldCheck, UserMinus, Users } from "lucide-react"
import api, { errorMessage } from "@/lib/api"
import { ChartCard, ColumnChart, DataTable, HBarChart, StatTile } from "@/components/charts/ChartKit"
import { formatMonth } from "@/components/charts/chartUtils"
import { CATEGORY_ORDER, CATEGORY_STYLE } from "@/components/victim-support/vsConstants"
import { CategoryBadge } from "@/components/victim-support/VSParts"
import { ALERT_STATUS_TONE } from "@/components/victim-support/vsConstants"

const PLAN_STATUSES = ["Suggested", "Accepted", "Referred", "Follow-up Pending", "Completed", "Unable to Connect"]
const ALERT_STATUSES = ["New", "Under Review", "Contact Initiated", "Resolved"]
const isoDay = (d) => d.toISOString().slice(0, 10)

const toRows = (obj, order) => (order || Object.keys(obj || {}))
    .map((label) => ({ label, value: obj?.[label] || 0 }))

const sortedRows = (obj) => Object.entries(obj || {}).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)

export function VictimAnalytics() {
    const today = new Date()
    const [filters, setFilters] = useState({ from: isoDay(new Date(today.getTime() - 180 * 86400000)), to: isoDay(today), district: "" })
    const [applied, setApplied] = useState(filters)
    const [state, setState] = useState({ loading: true, error: "", data: null })

    const load = useCallback(() => {
        const q = new URLSearchParams(Object.entries(applied).filter(([, v]) => v)).toString()
        setState((s) => ({ ...s, loading: true, error: "" }))
        api.get(`/admin/analytics?${q}`)
            .then(({ data }) => setState({ loading: false, error: "", data: data.data }))
            .catch((err) => setState((s) => ({ ...s, loading: false, error: errorMessage(err) })))
    }, [applied])

    useEffect(() => { load() }, [load])

    const d = state.data
    return (
        <div className="space-y-6">
            {/* One filter row scoping every figure below */}
            <Card className="p-4 bg-card/50 backdrop-blur border-border">
                <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setApplied(filters) }}>
                    <label className="text-sm">From<Input type="date" className="mt-1 w-40" value={filters.from} max={filters.to} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
                    <label className="text-sm">To<Input type="date" className="mt-1 w-40" value={filters.to} min={filters.from} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
                    <label className="text-sm">District<Input className="mt-1 w-48" placeholder="All districts" value={filters.district} onChange={(e) => setFilters({ ...filters, district: e.target.value })} /></label>
                    <Button type="submit" disabled={state.loading}>{state.loading ? "Loading..." : "Apply"}</Button>
                    <Button type="button" variant="ghost" onClick={() => { const f = { from: "", to: "", district: "" }; setFilters(f); setApplied(f) }}>Reset</Button>
                </form>
                <p className="text-xs text-muted-foreground mt-2">
                    Aggregate, anonymised figures only. Groups with fewer than {d?.minGroupSize ?? 5} people are suppressed. Date range applies to check-ins, alerts and monthly trends; enrolment totals are all-time.
                </p>
            </Card>

            {state.error && <Notice type="error">{state.error}</Notice>}
            {!d && state.loading && <LoadingState label="Loading analytics..." />}
            {d?.suppressed && <Notice type="warning" title="Figures suppressed">{d.message}</Notice>}

            {d && !d.suppressed && (
                <div className={state.loading ? "opacity-60 transition-opacity space-y-6" : "transition-opacity space-y-6"}>
                    {d.totals.syntheticCheckins > 0 && (
                        <Notice type="info">This view includes {d.totals.syntheticCheckins} synthetic demo check-in(s) created by the seed script.</Notice>
                    )}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatTile label="Total enrolled" value={d.totals.totalEnrolled} icon={Users} hint={`${d.totals.withdrawn} withdrawn`} />
                        <StatTile label="Active monitoring" value={d.totals.activeMonitoring} icon={ShieldCheck} hint={d.totals.unassignedActive ? `${d.totals.unassignedActive} without a counselor` : "All assigned"} />
                        <StatTile label="Check-ins in range" value={d.totals.totalCheckins} icon={Activity} />
                        <StatTile label="Pending alerts" value={d.totals.pendingAlerts} icon={BellRing} accent={d.totals.pendingAlerts > 0} />
                        <StatTile label="Follow-ups pending" value={d.totals.followUpsPending} icon={ClipboardList} />
                        <StatTile label="Support items" value={Object.values(d.supportPlans.byStatus).reduce((a, b) => a + b, 0)} icon={FolderOpen} hint={`${d.supportPlans.byStatus.Completed || 0} completed`} />
                        <StatTile label="Unassigned active cases" value={d.totals.unassignedActive} icon={UserMinus} />
                        <StatTile label="Alerts in range" value={Object.values(d.alertsByCategory).reduce((a, b) => a + b, 0)} icon={BellRing} />
                    </div>

                    <div className="grid lg:grid-cols-2 gap-6">
                        <ChartCard title="Check-ins per month" subtitle="Number of check-ins submitted" empty={!d.monthlyTrends.length}
                            table={<DataTable columns={[{ key: "month", label: "Month", render: (r) => formatMonth(r.month) }, { key: "checkins", label: "Check-ins" }, { key: "activeUsers", label: "People" }, { key: "avgScore", label: "Avg score", render: (r) => (r.avgScoreSuppressed ? "suppressed" : r.avgScore ?? "—") }]} rows={d.monthlyTrends} />}>
                            <ColumnChart data={d.monthlyTrends} xKey="month" yKey="checkins" name="Check-ins" xFormatter={formatMonth} />
                        </ChartCard>
                        <ChartCard title="Alerts per month" subtitle="Alerts raised for human review" empty={!d.monthlyTrends.length}
                            table={<DataTable columns={[{ key: "month", label: "Month", render: (r) => formatMonth(r.month) }, { key: "alerts", label: "Alerts" }]} rows={d.monthlyTrends} />}>
                            <ColumnChart data={d.monthlyTrends} xKey="month" yKey="alerts" name="Alerts" xFormatter={formatMonth} />
                        </ChartCard>
                        <ChartCard title="Alerts by monitoring category" subtitle="Alerts created in the selected range" height={200} empty={!Object.keys(d.alertsByCategory).length}
                            table={<DataTable columns={[{ key: "label", label: "Category" }, { key: "value", label: "Alerts" }]} rows={toRows(d.alertsByCategory, CATEGORY_ORDER)} />}>
                            <HBarChart data={toRows(d.alertsByCategory, CATEGORY_ORDER)} name="Alerts" colorFor={(r) => CATEGORY_STYLE[r.label]?.color} height={200} />
                        </ChartCard>
                        <ChartCard title="Current category of active cases" subtitle="Latest monitoring result per active case" height={200} empty={!Object.keys(d.latestCategoryDistribution).length}
                            table={<DataTable columns={[{ key: "label", label: "Category" }, { key: "value", label: "Cases" }]} rows={toRows(d.latestCategoryDistribution, CATEGORY_ORDER)} />}>
                            <HBarChart data={toRows(d.latestCategoryDistribution, CATEGORY_ORDER)} name="Cases" colorFor={(r) => CATEGORY_STYLE[r.label]?.color} height={200} />
                        </ChartCard>
                        <ChartCard title="Alerts by review status" subtitle="Alerts created in the selected range" height={200} empty={!Object.keys(d.alertsByStatus).length}
                            table={<DataTable columns={[{ key: "label", label: "Status" }, { key: "value", label: "Alerts" }]} rows={toRows(d.alertsByStatus, ALERT_STATUSES)} />}>
                            <HBarChart data={toRows(d.alertsByStatus, ALERT_STATUSES)} name="Alerts" height={200} />
                        </ChartCard>
                        <ChartCard title="Support plan items by status" subtitle="Across all support plans" height={230} empty={!Object.keys(d.supportPlans.byStatus).length}
                            table={<DataTable columns={[{ key: "label", label: "Status" }, { key: "value", label: "Items" }]} rows={toRows(d.supportPlans.byStatus, PLAN_STATUSES)} />}>
                            <HBarChart data={toRows(d.supportPlans.byStatus, PLAN_STATUSES)} name="Items" height={230} />
                        </ChartCard>
                    </div>
                    <ChartCard title="Support items by category" subtitle="Ranked, across all support plans" height={Math.max(120, Object.keys(d.supportPlans.byCategory).length * 40 + 20)} empty={!Object.keys(d.supportPlans.byCategory).length}
                        table={<DataTable columns={[{ key: "label", label: "Category" }, { key: "value", label: "Items" }]} rows={sortedRows(d.supportPlans.byCategory)} />}>
                        <HBarChart data={sortedRows(d.supportPlans.byCategory)} name="Items" />
                    </ChartCard>

                    {d.referrals && (
                        <div className="grid lg:grid-cols-2 gap-6">
                            <ChartCard title="Referrals by status" subtitle={`Tracked internally – external integrations not connected · ${d.referrals.followUpsDue} follow-up(s) due`} height={250} empty={!Object.keys(d.referrals.byStatus).length}
                                table={<DataTable columns={[{ key: "label", label: "Status" }, { key: "value", label: "Referrals" }]} rows={toRows(d.referrals.byStatus, PLAN_STATUSES)} />}>
                                <HBarChart data={toRows(d.referrals.byStatus, PLAN_STATUSES)} name="Referrals" height={250} />
                            </ChartCard>
                            <ChartCard title="Referrals by category" subtitle="Ranked" height={Math.max(120, Object.keys(d.referrals.byCategory).length * 40 + 20)} empty={!Object.keys(d.referrals.byCategory).length}
                                table={<DataTable columns={[{ key: "label", label: "Category" }, { key: "value", label: "Referrals" }]} rows={sortedRows(d.referrals.byCategory)} />}>
                                <HBarChart data={sortedRows(d.referrals.byCategory)} name="Referrals" />
                            </ChartCard>
                        </div>
                    )}

                    <Card className="p-5 bg-card/50 backdrop-blur border-border">
                        <h3 className="font-semibold text-foreground mb-1">District-wise statistics</h3>
                        <p className="text-xs text-muted-foreground mb-3">Based on optional, self-reported districts. Districts with fewer than {d.minGroupSize} enrolled people are hidden.</p>
                        {!d.districts.available ? (
                            <p className="text-sm text-muted-foreground">Not enough reliable district data to show district-level figures{d.districts.suppressedPeople ? ` (${d.districts.suppressedPeople} people in small groups suppressed)` : ""}.</p>
                        ) : (
                            <>
                                <DataTable
                                    columns={[{ key: "district", label: "District" }, { key: "enrolled", label: "Enrolled" }, { key: "active", label: "Active" }, { key: "avgLatestScore", label: "Avg latest score" }]}
                                    rows={d.districts.rows}
                                />
                                {d.districts.suppressedPeople > 0 && <p className="text-xs text-muted-foreground mt-2">{d.districts.suppressedPeople} people in smaller districts are not shown.</p>}
                            </>
                        )}
                    </Card>
                </div>
            )}
        </div>
    )
}

export function VictimCases() {
    const [state, setState] = useState({ loading: true, error: "", cases: [], counselors: [] })
    const [selection, setSelection] = useState({})
    const [msg, setMsg] = useState({ type: "", text: "" })

    const load = useCallback(() => {
        api.get("/admin/vs/cases")
            .then(({ data }) => setState({ loading: false, error: "", cases: data.data.cases, counselors: data.data.counselors }))
            .catch((err) => setState((s) => ({ ...s, loading: false, error: errorMessage(err) })))
    }, [])
    useEffect(() => { load() }, [load])

    const assign = async (caseRef) => {
        const counselorId = selection[caseRef]
        if (!counselorId) return
        try {
            const { data } = await api.patch(`/admin/vs/cases/${caseRef}/assign`, { counselorId })
            setMsg({ type: "success", text: data.message })
            setSelection({ ...selection, [caseRef]: "" })
            load()
        } catch (err) {
            setMsg({ type: "error", text: errorMessage(err) })
        }
    }

    if (state.loading) return <LoadingState />
    return (
        <Card className="border-border bg-card/50 backdrop-blur overflow-hidden">
            <div className="p-6 border-b border-border">
                <h2 className="text-xl font-bold text-foreground">Victim Support Cases</h2>
                <p className="text-sm text-muted-foreground">Pseudonymous case references only. Administrators cannot view check-in answers or personal details.</p>
            </div>
            {state.error && <Notice type="error" className="m-4">{state.error}</Notice>}
            {msg.text && <Notice type={msg.type} className="m-4">{msg.text}</Notice>}
            {!state.counselors.length && <Notice type="warning" className="m-4">There are no approved counselors yet. Approve a counselor application to assign cases.</Notice>}
            {state.cases.length === 0 ? <EmptyState icon={ShieldCheck} title="No one has enrolled yet" /> : (
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-border">
                                <TableHead>Case</TableHead>
                                <TableHead>Consent</TableHead>
                                <TableHead>Latest category</TableHead>
                                <TableHead>Open alert</TableHead>
                                <TableHead>Check-ins</TableHead>
                                <TableHead>Counselor</TableHead>
                                <TableHead>Reassign</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {state.cases.map((c) => (
                                <TableRow key={c.caseRef} className="border-border hover:bg-muted/50">
                                    <TableCell className="font-medium">{c.caseRef}{c.isSynthetic && <Badge tone="blue" className="ml-2">Synthetic</Badge>}</TableCell>
                                    <TableCell><Badge tone={c.status === "active" ? "green" : "neutral"}>{c.status}</Badge></TableCell>
                                    <TableCell><CategoryBadge category={c.latestCategory} /></TableCell>
                                    <TableCell>{c.openAlert ? <Badge tone={ALERT_STATUS_TONE[c.openAlert.status]}>{c.openAlert.status} · {c.openAlert.priority}</Badge> : "—"}</TableCell>
                                    <TableCell>{c.checkinCount}</TableCell>
                                    <TableCell>{c.assignedCounselor?.name || <span className="text-amber-600">Unassigned</span>}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-2">
                                            <Select className="w-44 h-9" value={selection[c.caseRef] || ""} onChange={(e) => setSelection({ ...selection, [c.caseRef]: e.target.value })} aria-label={`Counselor for ${c.caseRef}`}>
                                                <option value="">Choose counselor</option>
                                                {state.counselors.filter((x) => x._id !== c.assignedCounselor?._id).map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
                                            </Select>
                                            <Button size="sm" disabled={!selection[c.caseRef]} onClick={() => assign(c.caseRef)}>Assign</Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </Card>
    )
}

export function AuditLog() {
    const [filters, setFilters] = useState({ action: "", caseRef: "" })
    const [page, setPage] = useState(1)
    const [state, setState] = useState({ loading: true, error: "", rows: [], actions: [], pagination: null })

    const load = useCallback(() => {
        const q = new URLSearchParams({ page: String(page), limit: "25", ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }).toString()
        setState((s) => ({ ...s, loading: true, error: "" }))
        api.get(`/admin/audit?${q}`)
            .then(({ data }) => setState({ loading: false, error: "", rows: data.data, actions: data.actions, pagination: data.pagination }))
            .catch((err) => setState((s) => ({ ...s, loading: false, error: errorMessage(err) })))
    }, [filters, page])
    useEffect(() => { load() }, [load])

    return (
        <Card className="border-border bg-card/50 backdrop-blur overflow-hidden">
            <div className="p-6 border-b border-border space-y-3">
                <div>
                    <h2 className="text-xl font-bold text-foreground flex items-center gap-2"><ScrollText className="w-5 h-5 text-primary" /> Audit Log</h2>
                    <p className="text-sm text-muted-foreground">Metadata only – no passwords, check-in comments or note contents are ever recorded.</p>
                </div>
                <div className="flex flex-wrap gap-3 items-end">
                    <label className="text-sm">Action
                        <Select className="mt-1 w-64" value={filters.action} onChange={(e) => { setPage(1); setFilters({ ...filters, action: e.target.value }) }}>
                            <option value="">All actions</option>
                            {state.actions.map((a) => <option key={a} value={a}>{a}</option>)}
                        </Select>
                    </label>
                    <label className="text-sm">Case reference
                        <Input className="mt-1 w-40" placeholder="VS-XXXXXX" value={filters.caseRef} onChange={(e) => { setPage(1); setFilters({ ...filters, caseRef: e.target.value.trim() }) }} />
                    </label>
                </div>
            </div>
            {state.error && <Notice type="error" className="m-4">{state.error}</Notice>}
            <div className={`overflow-x-auto ${state.loading ? "opacity-60" : ""}`}>
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent border-border">
                            <TableHead>Time</TableHead>
                            <TableHead>Action</TableHead>
                            <TableHead>Actor</TableHead>
                            <TableHead>Case</TableHead>
                            <TableHead>Details</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {state.rows.map((e) => (
                            <TableRow key={e._id} className="border-border hover:bg-muted/50 align-top">
                                <TableCell className="whitespace-nowrap text-xs">{new Date(e.createdAt).toLocaleString()}</TableCell>
                                <TableCell className="font-mono text-xs">{e.action}</TableCell>
                                <TableCell className="text-xs">{e.actor}<span className="block text-muted-foreground capitalize">{e.actorRole}</span></TableCell>
                                <TableCell className="text-xs">{e.caseRef || "—"}</TableCell>
                                <TableCell className="text-xs font-mono max-w-[320px] break-words">{e.metadata ? JSON.stringify(e.metadata) : "—"}</TableCell>
                            </TableRow>
                        ))}
                        {!state.loading && state.rows.length === 0 && (
                            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground h-24">No audit events match.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            {state.pagination && state.pagination.pages > 1 && (
                <div className="flex items-center justify-between p-4 text-sm">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                    <span className="text-muted-foreground">Page {state.pagination.page} of {state.pagination.pages} · {state.pagination.total} events</span>
                    <Button variant="outline" size="sm" disabled={page >= state.pagination.pages} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
            )}
        </Card>
    )
}
