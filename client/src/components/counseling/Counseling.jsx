import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Notice, LoadingState, EmptyState } from "@/components/ui/notice"
import { Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock, GraduationCap, IndianRupee, Languages, MapPin, Monitor, Search, ShieldCheck, Star, Users, X, BadgeInfo, Building2 } from "lucide-react"
import api, { errorMessage } from "@/lib/api"
import { useAuth } from "@/context/AuthContext"

const PAGE_SIZE = 6
const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MODE_LABEL = { online: "Online", offline: "In person" }
const initials = (name = "") => name.replace(/^Dr\.?\s+/i, "").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()
const todayLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
const weekdayOf = (ymd) => new Date(`${ymd}T00:00:00Z`).getUTCDay()

function Badges({ c }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {c.verified && <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300"><ShieldCheck className="h-3 w-3" /> Verified professional</span>}
            {c.isDemo && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"><BadgeInfo className="h-3 w-3" /> Demo profile – fictional</span>}
        </div>
    )
}

function Rating({ rating }) {
    if (!rating) return <span className="text-xs text-muted-foreground">No ratings yet</span>
    return (
        <span className="inline-flex items-center gap-1 text-xs text-foreground" aria-label={`Rated ${rating.average} out of 5 by ${rating.count} users`}>
            <Star className="h-3 w-3 fill-current text-amber-500" /> {rating.average.toFixed(1)} <span className="text-muted-foreground">({rating.count} verified {rating.count === 1 ? "rating" : "ratings"})</span>
        </span>
    )
}

function AvailabilityLine({ c }) {
    const text = c.availability.status === "verified" ? "Weekly availability confirmed by Lumina"
        : c.availability.status === "demo" ? "Demo schedule – no real sessions take place"
            : "Availability not yet confirmed – the counsellor confirms each request"
    return <p className={`text-xs ${c.availability.status === "verified" ? "text-green-700 dark:text-green-300" : "text-muted-foreground"}`}><Clock className="mr-1 inline h-3 w-3" />{text}</p>
}

function Photo({ c, size = "h-16 w-16" }) {
    const [broken, setBroken] = useState(false)
    const usable = c.profilePhoto && !/placeholder/i.test(c.profilePhoto) && !broken
    return usable
        ? <img src={c.profilePhoto} alt="" onError={() => setBroken(true)} className={`${size} shrink-0 rounded-full object-cover bg-primary/10`} />
        : <div className={`${size} grid shrink-0 place-items-center rounded-full bg-gradient-primary text-lg font-bold text-white`} aria-hidden="true">{initials(c.name)}</div>
}

function CounsellorCard({ c, onView, onBook }) {
    return (
        <Card className="p-6 border-border bg-card/50 backdrop-blur hover:border-primary/50 transition-all duration-300 flex flex-col">
            <div className="flex items-start gap-4">
                <Photo c={c} />
                <div className="min-w-0 flex-1 space-y-1.5">
                    <h3 className="text-lg font-semibold text-foreground">{c.name}</h3>
                    <Badges c={c} />
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{c.city}</span>
                        {c.experienceYears != null && <span>{c.experienceYears} yrs experience</span>}
                        {c.feePerHour != null && <span className="inline-flex items-center gap-0.5"><IndianRupee className="h-3 w-3" />{c.feePerHour}/hr</span>}
                    </div>
                    <Rating rating={c.rating} />
                </div>
            </div>
            {c.qualifications && <p className="mt-3 flex gap-1.5 text-sm text-muted-foreground"><GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{c.qualifications}</p>}
            <div className="mt-3 flex flex-wrap gap-2">{c.specialization.map((s) => <span key={s} className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">{s}</span>)}</div>
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {c.languages.length > 0 && <p><Languages className="mr-1 inline h-3 w-3" />{c.languages.join(", ")}</p>}
                {c.consultationModes.length > 0 && <p><Monitor className="mr-1 inline h-3 w-3" />{c.consultationModes.map((m) => MODE_LABEL[m]).join(" · ")}</p>}
                <AvailabilityLine c={c} />
            </div>
            <div className="mt-auto flex gap-2 pt-4">
                <Button size="sm" variant="outline" onClick={() => onView(c)}>View profile</Button>
                <Button size="sm" onClick={() => onBook(c)} className="bg-gradient-primary text-white hover:opacity-90" disabled={!c.weeklySlots.length}>{c.weeklySlots.length ? "Book session" : "No slots listed"}</Button>
            </div>
        </Card>
    )
}

function Modal({ title, onClose, children }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose() }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [onClose])
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
            <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto bg-background p-6 shadow-2xl">
                <div className="mb-4 flex items-start justify-between gap-4">
                    <h2 className="text-xl font-bold text-foreground">{title}</h2>
                    <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
                </div>
                {children}
            </Card>
        </div>
    )
}

function ProfileDetails({ c, onBook }) {
    return (
        <div className="space-y-4 text-sm">
            <div className="flex items-center gap-4">
                <Photo c={c} size="h-20 w-20" />
                <div className="space-y-1.5">
                    <Badges c={c} />
                    <p className="text-muted-foreground"><MapPin className="mr-1 inline h-3 w-3" />{c.city}{c.experienceYears != null ? ` · ${c.experienceYears} years of experience` : ""}</p>
                    <Rating rating={c.rating} />
                </div>
            </div>
            {c.isDemo && <Notice type="warning">This is a fictional demo profile used to show how Lumina works. It is not a real counsellor and no real session will take place.</Notice>}
            {c.bio && <p className="text-foreground/90">{c.bio}</p>}
            <dl className="grid gap-3 sm:grid-cols-2">
                <div><dt className="font-medium text-foreground">Qualifications</dt><dd className="text-muted-foreground">{c.qualifications || "Not provided"}</dd></div>
                <div><dt className="font-medium text-foreground">Certifications</dt><dd className="text-muted-foreground">{c.certifications || "Not provided"}</dd></div>
                <div><dt className="font-medium text-foreground">Specializations</dt><dd className="text-muted-foreground">{c.specialization.join(", ")}</dd></div>
                <div><dt className="font-medium text-foreground">Languages</dt><dd className="text-muted-foreground">{c.languages.join(", ") || "Not provided"}</dd></div>
                <div><dt className="font-medium text-foreground">Consultation</dt><dd className="text-muted-foreground">{c.consultationModes.map((m) => MODE_LABEL[m]).join(" · ") || "Not provided"}</dd></div>
                {c.feePerHour != null && <div><dt className="font-medium text-foreground">Fee</dt><dd className="text-muted-foreground">₹{c.feePerHour} per hour</dd></div>}
            </dl>
            <div>
                <p className="font-medium text-foreground mb-1">Weekly schedule</p>
                {c.weeklySlots.length ? (
                    <ul className="space-y-1 text-muted-foreground">{c.weeklySlots.map((w) => <li key={w.day}><span className="inline-block w-24 text-foreground">{DAY_LABELS[w.day]}</span>{w.slots.join(", ")}</li>)}</ul>
                ) : <p className="text-muted-foreground">No weekly slots listed.</p>}
                <div className="mt-2"><AvailabilityLine c={c} /></div>
            </div>
            {c.weeklySlots.length > 0 && <Button onClick={() => onBook(c)} className="bg-gradient-primary text-white hover:opacity-90">Book a session</Button>}
        </div>
    )
}

function BookingForm({ c, onBooked }) {
    const { user } = useAuth()
    const [date, setDate] = useState("")
    const [slot, setSlot] = useState("")
    const [concern, setConcern] = useState("")
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const [done, setDone] = useState("")
    const offered = c.weeklySlots.map((w) => DAY_LABELS[w.day]).join(", ")
    const daySlots = date ? (c.weeklySlots.find((w) => w.day === weekdayOf(date))?.slots || []) : []

    if (!user) return <Notice type="info">Please <Link to="/login" className="underline">sign in</Link> to book a session.</Notice>
    if (done) return <Notice type="success">{done}</Notice>

    const submit = async (e) => {
        e.preventDefault()
        setBusy(true)
        setError("")
        try {
            const { data } = await api.post("/counseling/bookings", { counselorId: c._id, date, timeSlot: slot, concern })
            setDone(data.message)
            onBooked()
        } catch (err) {
            setError(errorMessage(err, "Failed to book the session."))
        } finally {
            setBusy(false)
        }
    }

    return (
        <form onSubmit={submit} className="space-y-4">
            {c.isDemo && <Notice type="warning">Demo profile: the booking is saved so you can try the flow, but no real session will take place.</Notice>}
            {error && <Notice type="error">{error}</Notice>}
            <p className="text-sm text-muted-foreground">Sessions are offered on: <span className="font-medium text-foreground">{offered}</span></p>
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm">
                    <span className="font-medium">Date</span>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input type="date" min={todayLocal()} value={date} onChange={(e) => { setDate(e.target.value); setSlot("") }} required className="pl-10" />
                    </div>
                </label>
                <label className="space-y-1.5 text-sm">
                    <span className="font-medium">Time slot</span>
                    <select value={slot} onChange={(e) => setSlot(e.target.value)} required disabled={!daySlots.length} className="h-10 w-full rounded-md border border-primary/20 bg-background px-3 disabled:opacity-60">
                        <option value="">{!date ? "Choose a date first" : daySlots.length ? "Select a time" : `No slots on ${DAY_LABELS[weekdayOf(date)]}`}</option>
                        {daySlots.map((s) => <option key={s}>{s}</option>)}
                    </select>
                </label>
            </div>
            <label className="block space-y-1.5 text-sm">
                <span className="font-medium">What would you like to discuss? (optional)</span>
                <Textarea value={concern} onChange={(e) => setConcern(e.target.value)} maxLength={1000} placeholder="Share what's on your mind..." className="min-h-[100px]" />
            </label>
            <Button type="submit" disabled={busy || !date || !slot} className="w-full bg-gradient-primary text-white hover:opacity-90">{busy ? "Booking..." : "Request this session"}</Button>
        </form>
    )
}

export default function CounselingComponent() {
    const { user } = useAuth()
    const [meta, setMeta] = useState(null)
    const [cityInput, setCityInput] = useState("")
    const [filters, setFilters] = useState({ city: "", specialization: "", mode: "", language: "", availability: "", day: "", minRating: "", includeDemo: "true" })
    const [page, setPage] = useState(1)
    const [result, setResult] = useState({ data: [], pagination: { total: 0, pages: 1 } })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [viewing, setViewing] = useState(null)
    const [booking, setBooking] = useState(null)
    const [bookings, setBookings] = useState([])

    useEffect(() => { api.get("/counseling/meta").then(({ data }) => setMeta(data.data)).catch(() => setMeta(null)) }, [])

    const search = useCallback(async () => {
        setLoading(true)
        setError("")
        try {
            const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
            Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
            const { data } = await api.get(`/counseling/counselors?${params}`)
            setResult({ data: data.data || [], pagination: data.pagination || { total: 0, pages: 1 } })
        } catch (err) {
            setError(errorMessage(err, "Unable to load counsellors right now."))
            setResult({ data: [], pagination: { total: 0, pages: 1 } })
        } finally {
            setLoading(false)
        }
    }, [filters, page])
    useEffect(() => { search() }, [search])

    const fetchBookings = useCallback(async () => {
        if (!user) return
        try { const { data } = await api.get("/counseling/bookings/my"); setBookings(data.data || []) } catch { setBookings([]) }
    }, [user])
    useEffect(() => { fetchBookings() }, [fetchBookings])

    const setFilter = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })) }
    const submitCity = (e) => { e.preventDefault(); setPage(1); setFilters((f) => ({ ...f, city: cityInput.trim() })) }
    const clearAll = () => { setCityInput(""); setPage(1); setFilters({ city: "", specialization: "", mode: "", language: "", availability: "", day: "", minRating: "", includeDemo: "true" }) }

    const grouped = useMemo(() => ({
        upcoming: bookings.filter((b) => ["pending", "confirmed"].includes(b.status)),
        completed: bookings.filter((b) => b.status === "completed"),
        cancelled: bookings.filter((b) => b.status === "cancelled"),
    }), [bookings])

    const { total, pages } = result.pagination
    const selectClass = "h-10 w-full rounded-md border border-primary/20 bg-background px-3 text-sm"
    const heading = filters.city ? `${total} ${total === 1 ? "counsellor" : "counsellors"} matching “${filters.city}”` : `${total} ${total === 1 ? "counsellor" : "counsellors"} available`

    return (
        <Tabs defaultValue="discover" className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-12 bg-muted/50 p-1 rounded-xl mb-8">
                <TabsTrigger value="discover" className="rounded-lg data-[state=active]:bg-gradient-primary data-[state=active]:text-white">Find a Counsellor</TabsTrigger>
                <TabsTrigger value="dashboard" className="rounded-lg data-[state=active]:bg-gradient-primary data-[state=active]:text-white">My Sessions</TabsTrigger>
            </TabsList>

            <TabsContent value="discover" className="space-y-5">
                <Card className="p-5 bg-card/50 backdrop-blur border-border space-y-4">
                    <form onSubmit={submitCity} className="flex flex-col gap-3 sm:flex-row" role="search">
                        <label htmlFor="city-search" className="sr-only">City</label>
                        <div className="relative flex-1">
                            <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input id="city-search" list="city-options" value={cityInput} onChange={(e) => setCityInput(e.target.value)} placeholder="Search by city, e.g. Indore" className="h-11 pl-10 border-primary/20 bg-background/50" maxLength={60} />
                            <datalist id="city-options">{(meta?.cities || []).map((c) => <option key={c} value={c} />)}</datalist>
                        </div>
                        <Button type="submit" className="h-11 bg-gradient-primary text-white hover:opacity-90"><Search className="mr-2 h-4 w-4" /> Search</Button>
                        <Button type="button" variant="outline" className="h-11" onClick={clearAll}><X className="mr-2 h-4 w-4" /> Clear</Button>
                    </form>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                        <label className="space-y-1 text-xs font-medium">Specialization
                            <select value={filters.specialization} onChange={setFilter("specialization")} className={selectClass}><option value="">Any</option>{(meta?.specializations || []).map((s) => <option key={s}>{s}</option>)}</select>
                        </label>
                        <label className="space-y-1 text-xs font-medium">Mode
                            <select value={filters.mode} onChange={setFilter("mode")} className={selectClass}><option value="">Any</option><option value="online">Online</option><option value="offline">In person</option></select>
                        </label>
                        <label className="space-y-1 text-xs font-medium">Language
                            <select value={filters.language} onChange={setFilter("language")} className={selectClass}><option value="">Any</option>{(meta?.languages || []).map((s) => <option key={s}>{s}</option>)}</select>
                        </label>
                        <label className="space-y-1 text-xs font-medium">Day
                            <select value={filters.day} onChange={setFilter("day")} className={selectClass}><option value="">Any day</option>{DAY_LABELS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
                        </label>
                        <label className="space-y-1 text-xs font-medium">Availability
                            <select value={filters.availability} onChange={setFilter("availability")} className={selectClass}><option value="">Any</option><option value="verified">Confirmed availability only</option></select>
                        </label>
                        <label className="space-y-1 text-xs font-medium">Rating
                            <select value={filters.minRating} onChange={setFilter("minRating")} className={selectClass} disabled={meta && !meta.ratingsAvailable}>
                                <option value="">{meta && !meta.ratingsAvailable ? "No ratings yet" : "Any"}</option><option value="3">3★ and above</option><option value="4">4★ and above</option><option value="4.5">4.5★ and above</option>
                            </select>
                        </label>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input type="checkbox" className="accent-primary" checked={filters.includeDemo === "true"} onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, includeDemo: e.target.checked ? "true" : "false" })) }} />
                        Include clearly labelled demo profiles{meta ? ` (${meta.demoCount})` : ""}
                    </label>
                    {meta && meta.verifiedCount === 0 && (
                        <Notice type="info">No verified counsellors have been added to the directory yet. The profiles below are fictional demo records that show how booking works. In an emergency call 112 or Tele-MANAS 14416.</Notice>
                    )}
                </Card>

                {error && <Notice type="error">{error} <Button size="sm" variant="outline" className="ml-2" onClick={search}>Try again</Button></Notice>}

                {!error && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-muted-foreground" aria-live="polite">{loading ? "Searching…" : heading}</p>
                        {pages > 1 && <p className="text-sm text-muted-foreground">Page {page} of {pages}</p>}
                    </div>
                )}

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-64 animate-pulse rounded-lg bg-muted/60" />)}</div>
                ) : !error && result.data.length === 0 ? (
                    <Card className="bg-card/50"><EmptyState icon={Users} title={filters.city ? `No counsellors found in “${filters.city}”` : "No counsellors match these filters"} action={<Button variant="outline" onClick={clearAll}>Clear search and filters</Button>}>
                        Try a nearby city, remove a filter, or choose online sessions.{meta?.cities?.length ? ` Cities with listed counsellors: ${meta.cities.join(", ")}.` : ""}
                    </EmptyState></Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {result.data.map((c) => <CounsellorCard key={c._id} c={c} onView={setViewing} onBook={(x) => { setViewing(null); setBooking(x) }} />)}
                    </div>
                )}

                {pages > 1 && !loading && (
                    <nav className="flex items-center justify-center gap-2" aria-label="Pagination">
                        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="mr-1 h-4 w-4" /> Previous</Button>
                        <span className="px-2 text-sm text-muted-foreground">{page} / {pages}</span>
                        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button>
                    </nav>
                )}
            </TabsContent>

            <TabsContent value="dashboard" className="space-y-4">
                {!user && <Card className="p-6 text-center text-muted-foreground"><Link to="/login" className="text-primary underline">Sign in</Link> to view your sessions.</Card>}
                {user && ["upcoming", "completed", "cancelled"].map((group) => (
                    <Card key={group} className="p-5 bg-card/50 border-border">
                        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold capitalize"><CheckCircle2 className="h-5 w-5 text-primary" /> {group} sessions</h3>
                        {grouped[group].length === 0 ? <p className="text-sm text-muted-foreground">No {group} sessions yet.</p> : (
                            <div className="space-y-3">
                                {grouped[group].map((b) => (
                                    <div key={b._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                                        <div>
                                            <p className="font-medium">{b.counselor?.name || "Counsellor"} {b.counselor?.isDemo && <span className="ml-1 text-xs text-amber-600">(demo)</span>}</p>
                                            <p className="text-sm text-muted-foreground">{new Date(b.date).toLocaleDateString([], { timeZone: "UTC", dateStyle: "medium" })} · {b.timeSlot}</p>
                                        </div>
                                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs capitalize text-primary">{b.status}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                ))}
                {user && <p className="text-sm text-muted-foreground"><Building2 className="mr-1 inline h-4 w-4" />After a session you can rate your counsellor on the <Link to="/feedback" className="text-primary underline">Feedback</Link> page. Only people who booked a counsellor can rate them.</p>}
            </TabsContent>

            {viewing && <Modal title={viewing.name} onClose={() => setViewing(null)}><ProfileDetails c={viewing} onBook={(x) => { setViewing(null); setBooking(x) }} /></Modal>}
            {booking && <Modal title={`Book a session with ${booking.name}`} onClose={() => setBooking(null)}><BookingForm c={booking} onBooked={fetchBookings} /></Modal>}
        </Tabs>
    )
}
