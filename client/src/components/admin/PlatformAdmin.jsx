import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Notice, LoadingState, EmptyState } from "@/components/ui/notice"
import { BadgeInfo, MessageSquareHeart, Plus, ShieldCheck, Star, Users, X, Flag } from "lucide-react"
import api, { errorMessage } from "@/lib/api"

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const when = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—")
const selectClass = "h-9 rounded-md border border-border bg-background px-2 text-sm"
const STATUS_STYLE = {
    verified: "bg-green-500/15 text-green-700 dark:text-green-300",
    pending: "bg-muted text-muted-foreground",
    suspended: "bg-red-500/15 text-red-700 dark:text-red-300",
}

// ============================ Counsellor directory ============================

const blankProfile = () => ({
    name: "", city: "", specialization: "", languages: "", qualifications: "", certifications: "", experienceYears: "",
    feePerHour: "", consultationModes: ["online"], profilePhoto: "", bio: "", slots: Array(7).fill(""), verify: false, availabilityVerified: false,
})
const toForm = (c) => ({
    ...blankProfile(),
    name: c.name, city: c.city, specialization: c.specialization.join(", "), languages: c.languages.join(", "),
    qualifications: c.qualifications, certifications: c.certifications, experienceYears: c.experienceYears ?? "",
    feePerHour: c.feePerHour ?? "", consultationModes: c.consultationModes, profilePhoto: c.profilePhoto || "", bio: c.bio,
    slots: DAY_LABELS.map((_, d) => (c.weeklySlots.find((w) => w.day === d)?.slots || []).join(", ")),
})
const toPayload = (f) => ({
    name: f.name, city: f.city, specialization: f.specialization, languages: f.languages, qualifications: f.qualifications,
    certifications: f.certifications, experienceYears: f.experienceYears, feePerHour: f.feePerHour, consultationModes: f.consultationModes,
    profilePhoto: f.profilePhoto, bio: f.bio,
    weeklySlots: f.slots.map((s, day) => ({ day, slots: s.split(",").map((x) => x.trim()).filter(Boolean) })).filter((w) => w.slots.length),
})

function ProfileForm({ initial, editing, onCancel, onSaved }) {
    const [f, setF] = useState(initial)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
    const toggleMode = (m) => setF({ ...f, consultationModes: f.consultationModes.includes(m) ? f.consultationModes.filter((x) => x !== m) : [...f.consultationModes, m] })
    const submit = async (e) => {
        e.preventDefault()
        setBusy(true)
        setError("")
        try {
            const body = toPayload(f)
            if (editing) await api.patch(`/admin/counsellors/${editing._id}`, body)
            else await api.post("/admin/counsellors", { ...body, verify: f.verify, availabilityVerified: f.availabilityVerified })
            onSaved(editing ? "Profile updated" : "Profile created")
        } catch (err) {
            setError(errorMessage(err, "Could not save the profile."))
        } finally {
            setBusy(false)
        }
    }
    const field = (label, k, props = {}) => (
        <label className="space-y-1 text-sm"><span className="font-medium">{label}</span><Input value={f[k]} onChange={set(k)} {...props} /></label>
    )
    return (
        <Card className="p-5 bg-card/50 border-primary/30">
            <form onSubmit={submit} className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{editing ? `Edit ${editing.name}` : "Add a counsellor profile"}</h3>
                    <Button type="button" size="icon" variant="ghost" onClick={onCancel} aria-label="Close form"><X className="h-4 w-4" /></Button>
                </div>
                {error && <Notice type="error">{error}</Notice>}
                <div className="grid gap-3 md:grid-cols-3">
                    {field("Full name *", "name", { required: true, maxLength: 100 })}
                    {field("City *", "city", { required: true, maxLength: 60 })}
                    {field("Experience (years)", "experienceYears", { type: "number", min: 0, max: 70 })}
                    {field("Specializations * (comma separated)", "specialization", { required: true })}
                    {field("Languages (comma separated)", "languages")}
                    {field("Fee per hour (₹, optional)", "feePerHour", { type: "number", min: 0 })}
                    {field("Qualifications", "qualifications", { maxLength: 300 })}
                    {field("Certifications", "certifications", { maxLength: 300 })}
                    {field("Photo URL (https:// or /path)", "profilePhoto", { maxLength: 300 })}
                </div>
                <fieldset className="flex flex-wrap items-center gap-4 text-sm">
                    <legend className="mb-1 font-medium">Consultation mode *</legend>
                    {["online", "offline"].map((m) => (
                        <label key={m} className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={f.consultationModes.includes(m)} onChange={() => toggleMode(m)} /> {m === "online" ? "Online" : "In person"}</label>
                    ))}
                </fieldset>
                <label className="block space-y-1 text-sm"><span className="font-medium">Bio</span><Textarea value={f.bio} onChange={set("bio")} maxLength={1000} className="min-h-[70px]" /></label>
                <div>
                    <p className="mb-1 text-sm font-medium">Weekly slots <span className="font-normal text-muted-foreground">(HH:MM-HH:MM, comma separated; leave empty for days off)</span></p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {DAY_LABELS.map((d, i) => (
                            <label key={d} className="space-y-1 text-xs"><span className="font-medium">{d}</span>
                                <Input value={f.slots[i]} placeholder="10:00-11:00, 16:00-17:00" onChange={(e) => setF({ ...f, slots: f.slots.map((s, j) => (j === i ? e.target.value : s)) })} className="h-9" />
                            </label>
                        ))}
                    </div>
                    {editing && <p className="mt-1 text-xs text-muted-foreground">Changing slots resets availability verification until you confirm it again.</p>}
                </div>
                {!editing && (
                    <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
                        <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 accent-primary" checked={f.verify} onChange={(e) => setF({ ...f, verify: e.target.checked })} />
                            <span>I have checked this counsellor's identity and credentials (shows as <strong>Verified professional</strong>)</span></label>
                        <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 accent-primary" checked={f.availabilityVerified} onChange={(e) => setF({ ...f, availabilityVerified: e.target.checked })} />
                            <span>The counsellor has confirmed the weekly slots above</span></label>
                    </div>
                )}
                <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? "Saving..." : editing ? "Save changes" : "Create profile"}</Button><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button></div>
            </form>
        </Card>
    )
}

export function CounsellorDirectoryAdmin() {
    const [rows, setRows] = useState([])
    const [status, setStatus] = useState("")
    const [q, setQ] = useState("")
    const [loading, setLoading] = useState(true)
    const [msg, setMsg] = useState(null)
    const [form, setForm] = useState(null) // { initial, editing }

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (status) params.set("status", status)
            if (q.trim()) params.set("q", q.trim())
            const { data } = await api.get(`/admin/counsellors?${params}`)
            setRows(data.data)
        } catch (err) { setMsg({ type: "error", text: errorMessage(err) }) } finally { setLoading(false) }
    }, [status, q])
    useEffect(() => { load() }, [load])

    const update = async (c, body, text) => {
        setMsg(null)
        try { await api.patch(`/admin/counsellors/${c._id}`, body); setMsg({ type: "success", text }); load() } catch (err) { setMsg({ type: "error", text: errorMessage(err) }) }
    }

    return (
        <div className="space-y-4">
            <Notice type="info">Only profiles marked <strong>Verified</strong> appear to users as professionals. Mark a profile verified only after checking the person's identity and registration. Demo profiles are fictional, always labelled, and can never be verified. Profiles are suspended, never deleted.</Notice>
            {msg && <Notice type={msg.type}>{msg.text}</Notice>}
            <div className="flex flex-wrap items-center gap-2">
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or city" className="h-9 w-56" aria-label="Search counsellors" />
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass} aria-label="Verification status">
                    <option value="">All statuses</option><option value="verified">Verified</option><option value="pending">Pending</option><option value="suspended">Suspended</option>
                </select>
                <Button size="sm" className="ml-auto" onClick={() => setForm({ initial: blankProfile(), editing: null })}><Plus className="mr-1 h-4 w-4" /> Add counsellor</Button>
            </div>
            {form && <ProfileForm key={form.editing?._id || "new"} initial={form.initial} editing={form.editing} onCancel={() => setForm(null)} onSaved={(text) => { setForm(null); setMsg({ type: "success", text }); load() }} />}
            {loading ? <LoadingState /> : rows.length === 0 ? <EmptyState icon={Users} title="No profiles match" /> : (
                <div className="grid gap-3 lg:grid-cols-2">
                    {rows.map((c) => (
                        <Card key={c._id} className="p-4 bg-card/50 border-border text-sm space-y-2">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                    <p className="font-semibold text-foreground">{c.name}</p>
                                    <p className="text-xs text-muted-foreground">{c.city} · {c.specialization.join(", ")}</p>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {c.isDemo && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300"><BadgeInfo className="h-3 w-3" /> Demo</span>}
                                    <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_STYLE[c.verificationStatus]}`}>{c.verificationStatus}</span>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">Availability: {c.availability.status === "verified" ? `confirmed ${when(c.availabilityVerifiedAt)}` : c.availability.status} · Rating: {c.rating ? `${c.rating.average} (${c.rating.count})` : "none"}</p>
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" onClick={() => setForm({ initial: toForm(c), editing: c })}>Edit</Button>
                                {!c.isDemo && c.verificationStatus !== "verified" && <Button size="sm" variant="outline" onClick={() => window.confirm(`Confirm you have verified ${c.name}'s credentials?`) && update(c, { verificationStatus: "verified" }, "Marked as verified")}><ShieldCheck className="mr-1 h-4 w-4" /> Verify</Button>}
                                {!c.isDemo && c.weeklySlots.length > 0 && c.availability.status !== "verified" && <Button size="sm" variant="outline" onClick={() => update(c, { availabilityVerified: true }, "Availability confirmed")}>Confirm availability</Button>}
                                {c.verificationStatus !== "suspended"
                                    ? <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => window.confirm(`Suspend ${c.name}? The profile will be hidden from users.`) && update(c, { verificationStatus: "suspended" }, "Profile suspended")}>Suspend</Button>
                                    : <Button size="sm" variant="ghost" onClick={() => update(c, { verificationStatus: "pending" }, "Profile restored to pending")}>Restore</Button>}
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}

// ============================ Community moderation ============================

export function ModerationAdmin() {
    const [filter, setFilter] = useState("flagged")
    const [state, setState] = useState({ loading: true, rows: [], page: 1, pages: 1 })
    const [msg, setMsg] = useState(null)
    const load = useCallback(async (page = 1) => {
        setState((s) => ({ ...s, loading: true }))
        try {
            const { data } = await api.get(`/admin/community/posts?filter=${filter}&page=${page}`)
            setState({ loading: false, rows: data.data, page, pages: data.pagination.pages })
        } catch (err) { setState((s) => ({ ...s, loading: false })); setMsg({ type: "error", text: errorMessage(err) }) }
    }, [filter])
    useEffect(() => { load(1) }, [load])

    const act = async (p, status) => {
        const note = status === "removed" ? window.prompt("Reason shown to the author (optional):", "") : ""
        if (note === null) return
        try {
            await api.patch(`/admin/community/posts/${p._id}`, { status, note })
            setMsg({ type: "success", text: `Post ${status}` })
            load(state.page)
        } catch (err) { setMsg({ type: "error", text: errorMessage(err) }) }
    }

    return (
        <div className="space-y-4">
            <Notice type="info">Anonymous authors stay anonymous here too. Posts with crisis language are flagged automatically; three reports from different people hide a post until reviewed.</Notice>
            {msg && <Notice type={msg.type}>{msg.text}</Notice>}
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className={selectClass} aria-label="Moderation queue">
                <option value="flagged">Needs review</option><option value="reported">Reported</option><option value="hidden">Hidden</option><option value="removed">Removed</option><option value="all">All posts</option>
            </select>
            {state.loading ? <LoadingState /> : state.rows.length === 0 ? <EmptyState icon={Flag} title="Nothing to review" /> : (
                <div className="space-y-3">
                    {state.rows.map((p) => (
                        <Card key={p._id} className="p-4 bg-card/50 border-border text-sm space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-semibold text-foreground">{p.title || "(no title)"} <span className="font-normal text-muted-foreground">· {p.author.name} · {p.category} · {when(p.createdAt)}</span></p>
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{p.status}{p.flaggedForReview ? " · flagged" : ""}</span>
                            </div>
                            <p className="whitespace-pre-wrap text-foreground/90">{p.content}</p>
                            {p.reports.length > 0 && <p className="text-xs text-muted-foreground">Reports ({p.reports.length}): {p.reports.map((r) => r.reason).join(", ")}</p>}
                            {p.moderationNote && <p className="text-xs text-muted-foreground">Note: {p.moderationNote}</p>}
                            <div className="flex flex-wrap gap-2">
                                {p.status !== "published" && <Button size="sm" variant="outline" onClick={() => act(p, "published")}>Publish / restore</Button>}
                                {p.status === "published" && p.flaggedForReview && <Button size="sm" variant="outline" onClick={() => act(p, "published")}>Mark reviewed</Button>}
                                {p.status !== "hidden" && <Button size="sm" variant="outline" onClick={() => act(p, "hidden")}>Hide</Button>}
                                {p.status !== "removed" && <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => act(p, "removed")}>Remove</Button>}
                            </div>
                        </Card>
                    ))}
                    {state.pages > 1 && <div className="flex justify-center gap-2"><Button size="sm" variant="outline" disabled={state.page <= 1} onClick={() => load(state.page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={state.page >= state.pages} onClick={() => load(state.page + 1)}>Next</Button></div>}
                </div>
            )}
        </div>
    )
}

// ============================ Feedback ============================

const EMAIL_LABEL = { accepted: "Email accepted by provider", captured: "Captured (dev outbox)", failed: "Email failed", skipped: "Email not configured", pending: "Pending", duplicate: "Email accepted by provider" }

export function FeedbackAdmin() {
    const [filters, setFilters] = useState({ rating: "", category: "" })
    const [state, setState] = useState({ loading: true, rows: [], stats: null, configured: null, page: 1, pages: 1, error: "" })
    const load = useCallback(async (page = 1) => {
        setState((s) => ({ ...s, loading: true }))
        try {
            const params = new URLSearchParams({ page: String(page) })
            if (filters.rating) params.set("rating", filters.rating)
            if (filters.category) params.set("category", filters.category)
            const { data } = await api.get(`/admin/feedback?${params}`)
            setState({ loading: false, rows: data.data, stats: data.stats, configured: data.notificationRecipientConfigured, page, pages: data.pagination.pages, error: "" })
        } catch (err) { setState((s) => ({ ...s, loading: false, error: errorMessage(err) })) }
    }, [filters])
    useEffect(() => { load(1) }, [load])
    const categories = ["Overall Experience", "Counselling", "Meditation", "Exercises", "Chatbot", "Community", "Other"]

    return (
        <div className="space-y-4">
            {state.error && <Notice type="error">{state.error}</Notice>}
            {state.configured === false && <Notice type="warning">FEEDBACK_NOTIFICATION_EMAIL is not set on the server, so no notification emails are sent. Feedback is still stored.</Notice>}
            <div className="flex flex-wrap items-center gap-3">
                {state.stats && <p className="text-sm text-muted-foreground"><Star className="mr-1 inline h-4 w-4 text-amber-500" />{state.stats.averageRating ?? "—"} average · {state.stats.count} responses</p>}
                <select value={filters.rating} onChange={(e) => setFilters({ ...filters, rating: e.target.value })} className={`${selectClass} ml-auto`} aria-label="Filter by rating">
                    <option value="">All ratings</option>{[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} stars</option>)}
                </select>
                <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} className={selectClass} aria-label="Filter by category">
                    <option value="">All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}
                </select>
            </div>
            {state.loading ? <LoadingState /> : state.rows.length === 0 ? <EmptyState icon={MessageSquareHeart} title="No feedback yet" /> : (
                <div className="space-y-3">
                    {state.rows.map((f) => (
                        <Card key={f._id} className="p-4 bg-card/50 border-border text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p><span className="text-amber-500" aria-label={`${f.rating} out of 5`}>{"★".repeat(f.rating)}<span className="text-muted-foreground/40">{"★".repeat(5 - f.rating)}</span></span> <span className="font-medium">{f.category}</span>{f.related ? <span className="text-muted-foreground"> · {f.related.label}</span> : null}</p>
                                <span className="text-xs text-muted-foreground">{when(f.createdAt)} · {EMAIL_LABEL[f.emailStatus] || f.emailStatus}</span>
                            </div>
                            <p className="mt-1 text-foreground/90">{f.note}</p>
                            {f.comments && <p className="mt-1 text-muted-foreground">{f.comments}</p>}
                        </Card>
                    ))}
                    {state.pages > 1 && <div className="flex justify-center gap-2"><Button size="sm" variant="outline" disabled={state.page <= 1} onClick={() => load(state.page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={state.page >= state.pages} onClick={() => load(state.page + 1)}>Next</Button></div>}
                </div>
            )}
        </div>
    )
}
