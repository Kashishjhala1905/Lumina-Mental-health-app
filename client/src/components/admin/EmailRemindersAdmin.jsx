import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Notice, LoadingState } from "@/components/ui/notice"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BellRing, ExternalLink, Link2Off, Mail, PlayCircle, ShieldCheck } from "lucide-react"
import api, { errorMessage } from "@/lib/api"
import { useAuth } from "@/context/AuthContext"

const STATUS_TONE = { accepted: "blue", delivered: "green", captured: "amber", sending: "primary", failed: "red", bounced: "red", complained: "red", skipped: "neutral", scheduled: "primary", sent: "green" }

export default function EmailRemindersAdmin() {
    const { user } = useAuth()
    const [state, setState] = useState({ loading: true, error: "", data: null })
    const [integrations, setIntegrations] = useState(null)
    const [testTo, setTestTo] = useState(user?.email || "")
    const [action, setAction] = useState({ busy: "", type: "", text: "" })

    const load = useCallback(() => {
        setState((s) => ({ ...s, loading: true, error: "" }))
        Promise.all([api.get("/admin/email/status"), api.get("/admin/integrations")])
            .then(([st, ints]) => { setState({ loading: false, error: "", data: st.data.data }); setIntegrations(ints.data.data) })
            .catch((err) => setState((s) => ({ ...s, loading: false, error: errorMessage(err) })))
    }, [])
    useEffect(() => { load() }, [load])

    const run = async (key, fn) => {
        setAction({ busy: key, type: "", text: "" })
        try {
            const { data } = await fn()
            setAction({ busy: "", type: "success", text: data.message })
        } catch (err) {
            setAction({ busy: "", type: "error", text: err.response?.data?.message || errorMessage(err) })
        }
        load()
    }

    if (!state.data) return state.error ? <Notice type="error">{state.error}</Notice> : <LoadingState />
    const { provider, recentDeliveries, last30Days, reminders, note } = state.data

    return (
        <div className="space-y-6">
            <Card className="p-6 bg-card/50 backdrop-blur border-border">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-foreground flex items-center gap-2"><Mail className="w-5 h-5 text-primary" /> Email provider</h2>
                        <p className="text-sm mt-2 flex flex-wrap items-center gap-2">
                            Provider: <Badge tone="primary">{provider.provider}</Badge>
                            {provider.configured ? <Badge tone="green">Configured</Badge> : <Badge tone="red">Not configured</Badge>}
                            <Badge tone={provider.deliveryConfirmation === "webhook" ? "green" : "neutral"}>
                                {provider.deliveryConfirmation === "webhook" ? "Delivery confirmed by webhook" : "Provider acceptance only"}
                            </Badge>
                            {provider.isDevelopmentOutbox && <Badge tone="amber">Development outbox – nothing is sent</Badge>}
                        </p>
                        {provider.from && <p className="text-xs text-muted-foreground mt-1">From: {provider.from}</p>}
                    </div>
                    <Button variant="outline" disabled={!!action.busy} onClick={() => run("verify", () => api.post("/admin/email/verify"))}>
                        <ShieldCheck className="w-4 h-4 mr-1" /> {action.busy === "verify" ? "Checking..." : "Check connection"}
                    </Button>
                </div>
                {provider.issues.length > 0 && (
                    <Notice type="warning" className="mt-4" title="Configuration needed">
                        <ul className="list-disc pl-5">{provider.issues.map((i) => <li key={i}>{i}</li>)}</ul>
                        <p className="mt-1">Set these in <code>server/.env</code> (see <code>server/.env.example</code>) and restart the server. Credentials are never sent to the browser.</p>
                    </Notice>
                )}
                <form className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-end" onSubmit={(e) => { e.preventDefault(); run("test", () => api.post("/admin/email/test", { to: testTo })) }}>
                    <label className="text-sm flex-1">Send a test email to
                        <Input type="email" className="mt-1" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                    </label>
                    <Button type="submit" disabled={!!action.busy || !testTo}>{action.busy === "test" ? "Sending..." : "Send test email"}</Button>
                </form>
                {action.text && <Notice type={action.type} className="mt-4">{action.text}</Notice>}
                <p className="text-xs text-muted-foreground mt-3">{note}</p>
            </Card>

            <Card className="p-6 bg-card/50 backdrop-blur border-border">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-foreground flex items-center gap-2"><BellRing className="w-5 h-5 text-primary" /> Check-in reminders</h2>
                        <p className="text-sm text-muted-foreground mt-1">One central job processes due reminders every 15 minutes. You can run it now instead of waiting.</p>
                        <div className="flex flex-wrap gap-2 mt-3">
                            {["scheduled", "sent", "failed", "skipped"].map((st) => <Badge key={st} tone={STATUS_TONE[st]}>{st}: {reminders.byStatus[st] || 0}</Badge>)}
                        </div>
                        {Object.keys(reminders.skipReasons).length > 0 && (
                            <p className="text-xs text-muted-foreground mt-2">Skipped (last {reminders.sinceDays} days): {Object.entries(reminders.skipReasons).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(" · ")}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">Next scheduled reminder: {reminders.nextDueAt ? new Date(reminders.nextDueAt).toLocaleString() : "none"}</p>
                    </div>
                    <Button disabled={!!action.busy} onClick={() => run("remind", () => api.post("/admin/reminders/run"))}>
                        <PlayCircle className="w-4 h-4 mr-1" /> {action.busy === "remind" ? "Running..." : "Run due reminders now"}
                    </Button>
                </div>
            </Card>

            <Card className="border-border bg-card/50 backdrop-blur overflow-hidden">
                <div className="p-6 border-b border-border">
                    <h2 className="text-xl font-bold text-foreground">Recent email deliveries</h2>
                    <p className="text-xs text-muted-foreground">Recipients are masked. Last 30 days: {Object.entries(last30Days.totals).map(([k, v]) => `${k} ${v}`).join(" · ") || "none"}</p>
                </div>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-border">
                                <TableHead>Time</TableHead><TableHead>Type</TableHead><TableHead>Recipient</TableHead><TableHead>Provider</TableHead><TableHead>Status</TableHead><TableHead>Attempts</TableHead><TableHead>Detail</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {recentDeliveries.map((d) => (
                                <TableRow key={d._id} className="border-border hover:bg-muted/50">
                                    <TableCell className="text-xs whitespace-nowrap">{new Date(d.createdAt).toLocaleString()}</TableCell>
                                    <TableCell className="text-xs">{d.type.replace(/_/g, " ")}{d.isTest && " (test)"}</TableCell>
                                    <TableCell className="text-xs">{d.toMasked}</TableCell>
                                    <TableCell className="text-xs">{d.provider}</TableCell>
                                    <TableCell><Badge tone={STATUS_TONE[d.status]}>{d.status}</Badge></TableCell>
                                    <TableCell className="text-xs">{d.attempts}</TableCell>
                                    <TableCell className="text-xs max-w-[260px]">{d.lastErrorCode ? `${d.lastErrorCode}: ${d.lastErrorMessage}` : d.skipReason ? d.skipReason.replace(/_/g, " ") : d.deliveredAt ? `delivered ${new Date(d.deliveredAt).toLocaleString()}` : ""}{d.uncertain && " (outcome uncertain – not retried)"}</TableCell>
                                </TableRow>
                            ))}
                            {recentDeliveries.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground h-20">No emails yet.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </div>
            </Card>

            {integrations && (
                <Card className="border-border bg-card/50 backdrop-blur overflow-hidden">
                    <div className="p-6 border-b border-border">
                        <h2 className="text-xl font-bold text-foreground flex items-center gap-2"><Link2Off className="w-5 h-5 text-primary" /> External services & integrations</h2>
                        <p className="text-sm text-muted-foreground">{integrations.summary}</p>
                    </div>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent border-border">
                                    <TableHead>Service</TableHead><TableHead>Contact</TableHead><TableHead>Official source</TableHead><TableHead>Verification</TableHead><TableHead>Integration</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {integrations.directory.map((d) => (
                                    <TableRow key={d.id} className="border-border hover:bg-muted/50">
                                        <TableCell className="text-sm font-medium">{d.name}</TableCell>
                                        <TableCell className="text-sm tabular-nums">{d.phone}</TableCell>
                                        <TableCell className="text-xs"><a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">{d.sourceUrl.replace(/^https?:\/\//, "")} <ExternalLink className="w-3 h-3" /></a></TableCell>
                                        <TableCell><Badge tone={d.verification.status === "verified" ? "green" : "amber"}>{d.verification.status} {d.verification.checkedOn}</Badge></TableCell>
                                        <TableCell><Badge tone="neutral">{d.integration.status.replace(/_/g, " ")}</Badge></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </Card>
            )}
        </div>
    )
}
