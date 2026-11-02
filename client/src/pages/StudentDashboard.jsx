import { useState, useEffect, useCallback } from 'react'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Notice } from '@/components/ui/notice'
import { Calendar, BookOpen, Clock, AlertCircle, ShieldCheck, Smile, History } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import api, { errorMessage } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'

const MOODS = [
    { value: 'happy', label: 'Happy', emoji: '😊' },
    { value: 'neutral', label: 'Neutral', emoji: '😐' },
    { value: 'sad', label: 'Sad', emoji: '😢' },
    { value: 'anxious', label: 'Anxious', emoji: '😟' },
    { value: 'angry', label: 'Angry', emoji: '😠' },
]
const moodMeta = (v) => MOODS.find((m) => m.value === v) || MOODS[1]
const SCALES = [
    { key: 'emotionalState', label: 'Emotional state', low: 'Low', high: 'Great' },
    { key: 'stressLevel', label: 'Stress', low: 'Calm', high: 'Very stressed' },
    { key: 'energyLevel', label: 'Energy', low: 'Drained', high: 'Energised' },
    { key: 'sleepQuality', label: 'Sleep quality', low: 'Poor', high: 'Restful' },
]
const timezone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' } }
const emptyForm = { mood: '', emotionalState: null, stressLevel: null, energyLevel: null, sleepQuality: null, notes: '' }

/** Daily check-in: one per local day (stored in UTC with the user's timezone), editable for today. */
function DailyCheckin() {
    const [today, setToday] = useState(null)
    const [recent, setRecent] = useState([])
    const [form, setForm] = useState(emptyForm)
    const [state, setState] = useState({ loading: true, saving: false, error: '', msg: '' })

    const load = useCallback(async () => {
        try {
            const [t, r] = await Promise.all([api.get(`/mood/today?timezone=${encodeURIComponent(timezone())}`), api.get('/mood?limit=7')])
            setToday(t.data.data)
            setRecent(r.data.data)
            if (t.data.data) {
                const d = t.data.data
                setForm({ mood: d.mood, emotionalState: d.emotionalState ?? null, stressLevel: d.stressLevel ?? null, energyLevel: d.energyLevel ?? null, sleepQuality: d.sleepQuality ?? null, notes: d.notes || '' })
            }
            setState((s) => ({ ...s, loading: false }))
        } catch (err) {
            setState((s) => ({ ...s, loading: false, error: errorMessage(err) }))
        }
    }, [])
    useEffect(() => { load() }, [load])

    const save = async (e) => {
        e.preventDefault()
        if (!form.mood) return
        setState((s) => ({ ...s, saving: true, error: '', msg: '' }))
        const payload = { ...form, timezone: timezone() }
        try {
            if (today) await api.put(`/mood/${today._id}`, payload)
            else await api.post('/mood', payload)
            setState((s) => ({ ...s, saving: false, msg: today ? "Today's check-in updated" : 'Check-in saved for today' }))
            load()
        } catch (err) {
            if (err.response?.data?.code === 'ALREADY_CHECKED_IN') { setState((s) => ({ ...s, saving: false, msg: 'You already checked in today – you can edit it below.' })); load(); return }
            setState((s) => ({ ...s, saving: false, error: errorMessage(err) }))
        }
    }

    const time = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return (
        <Card className="border-primary/20 bg-card/50 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-medium">Daily Check-in</CardTitle>
                <Smile className="w-5 h-5 text-primary" />
            </CardHeader>
            <CardContent className="space-y-4">
                {state.loading ? <p className="text-sm text-muted-foreground">Loading...</p> : (
                    <form onSubmit={save} className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            {today ? <>Checked in today at {time(today.checkinAt || today.createdAt)}{today.editedAt ? ` (edited ${time(today.editedAt)})` : ''}. You can update it until midnight.</> : 'How are you feeling today?'}
                        </p>
                        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Mood">
                            {MOODS.map((m) => (
                                <button key={m.value} type="button" role="radio" aria-checked={form.mood === m.value} onClick={() => setForm({ ...form, mood: m.value })}
                                    className={cn('px-3 py-2 rounded-lg border text-sm transition-all', form.mood === m.value ? 'bg-gradient-primary text-white border-transparent' : 'border-border hover:border-primary/50')}>
                                    <span aria-hidden="true">{m.emoji}</span> {m.label}
                                </button>
                            ))}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {SCALES.map((sc) => (
                                <fieldset key={sc.key} className="space-y-1">
                                    <legend className="text-xs font-medium text-foreground">{sc.label} <span className="font-normal text-muted-foreground">(optional)</span></legend>
                                    <div className="flex gap-1" role="radiogroup" aria-label={sc.label}>
                                        {[1, 2, 3, 4, 5].map((n) => (
                                            <button key={n} type="button" role="radio" aria-checked={form[sc.key] === n} aria-label={`${sc.label} ${n} of 5`}
                                                onClick={() => setForm({ ...form, [sc.key]: form[sc.key] === n ? null : n })}
                                                className={cn('h-8 w-8 rounded-md border text-xs transition-colors', form[sc.key] === n ? 'bg-gradient-primary text-white border-transparent' : 'border-border hover:border-primary/50')}>
                                                {n}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="flex justify-between text-[10px] text-muted-foreground w-[11.5rem]"><span>{sc.low}</span><span>{sc.high}</span></p>
                                </fieldset>
                            ))}
                        </div>
                        <Textarea rows={2} placeholder="Journal note (optional, private)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={1000} aria-label="Journal note" />
                        {state.error && <Notice type="error">{state.error}</Notice>}
                        {state.msg && <Notice type="success">{state.msg}</Notice>}
                        <Button type="submit" size="sm" disabled={!form.mood || state.saving}>{state.saving ? 'Saving...' : today ? 'Update today' : 'Save check-in'}</Button>
                    </form>
                )}
                <div>
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-medium">Recent check-ins</p>
                        <Link to="/history?section=checkins" className="text-xs text-primary hover:underline">Calendar & trends</Link>
                    </div>
                    {recent.length === 0 ? <p className="text-sm text-muted-foreground">No check-ins yet.</p> : (
                        <ul className="flex flex-wrap gap-2">
                            {recent.map((e) => (
                                <li key={e._id} className="rounded-lg border border-border px-3 py-1.5 text-xs" title={e.notes || ''}>
                                    <span aria-hidden="true">{moodMeta(e.mood).emoji}</span> {moodMeta(e.mood).label}
                                    <span className="block text-muted-foreground">{new Date(`${e.localDate}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

export default function StudentDashboard() {
    const { user } = useAuth()
    const location = useLocation()
    const [appointments, setAppointments] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        api.get('/appointment/my')
            .then(({ data }) => { if (data.success) setAppointments(data.data) })
            .catch((err) => setError(errorMessage(err, 'Failed to fetch appointments')))
            .finally(() => setLoading(false))
    }, [])

    const getStatusColor = (status) => {
        switch (status) {
            case 'approved': return 'text-green-500 bg-green-100 dark:bg-green-900/20'
            case 'rejected': return 'text-red-500 bg-red-100 dark:bg-red-900/20'
            case 'completed': return 'text-blue-500 bg-blue-100 dark:bg-blue-900/20'
            default: return 'text-yellow-500 bg-yellow-100 dark:bg-yellow-900/20'
        }
    }

    const cards = [
        { to: '/counseling', title: 'Book Counseling', icon: Calendar, text: 'Schedule a session with our professionals.' },
        { to: '/resources', title: 'Resources', icon: BookOpen, text: 'Access articles, videos, and self-help guides.' },
        { to: '/assessment', title: 'Self Assessment', icon: Clock, text: 'Take a quick check-in on your mental health.' },
        { to: '/history', title: 'My History', icon: History, text: 'Assessments, chats, sessions, check-ins and posts.' },
        { to: '/victim-support', title: 'Victim Support', icon: ShieldCheck, text: 'Confidential, consent-based monitoring and counselor support.' },
    ]

    return (
        <div className="flex flex-col min-h-screen bg-background">
            <Navbar />
            <main id="main-content" className="flex-1 px-4 sm:px-6 lg:px-8 py-12 max-w-7xl mx-auto w-full">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-foreground">
                        Welcome back, <span className="gradient-text">{user?.name}</span>
                    </h1>
                    <p className="text-muted-foreground mt-2">Here is an overview of your wellness journey.</p>
                </div>
                {location.state?.notice && <Notice type="info" className="mb-6">{location.state.notice}</Notice>}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-10">
                    {cards.map(({ to, title, icon, text }) => { const Icon = icon; return (
                        <Link key={to} to={to}>
                            <Card className="h-full hover:shadow-lg transition-all duration-300 cursor-pointer border-primary/20 bg-card/50 backdrop-blur">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-lg font-medium">{title}</CardTitle>
                                    <Icon className="w-5 h-5 text-primary" />
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground">{text}</p>
                                </CardContent>
                            </Card>
                        </Link>
                    ) })}
                </div>

                <div className="grid lg:grid-cols-[1fr_1.3fr] gap-8">
                    <DailyCheckin />

                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-foreground">My Appointments</h2>
                        {error && <Notice type="error">{error}</Notice>}
                        {loading ? (
                            <p>Loading appointments...</p>
                        ) : appointments.length === 0 ? (
                            <Card className="p-8 text-center text-muted-foreground bg-card/50 backdrop-blur">
                                <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                <p>No appointments booked yet.</p>
                                <Button asChild className="mt-4" variant="outline">
                                    <Link to="/counseling">Book Now</Link>
                                </Button>
                            </Card>
                        ) : (
                            <div className="grid gap-4">
                                {appointments.map((apt) => (
                                    <Card key={apt._id} className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-card/50 backdrop-blur">
                                        <div className="flex gap-4 items-start">
                                            <div className="p-3 rounded-full bg-primary/10">
                                                <Calendar className="w-6 h-6 text-primary" />
                                            </div>
                                            <div>
                                                <h4 className="font-semibold">{apt.counselorId?.name || "Counselor"}</h4>
                                                <p className="text-sm text-muted-foreground">{apt.counselorId?.email}</p>
                                                <div className="flex items-center gap-2 mt-1 text-sm">
                                                    <span>{new Date(apt.date).toLocaleDateString()}</span>
                                                    <span>•</span>
                                                    <span>{apt.time}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className={`px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide ${getStatusColor(apt.status)}`}>
                                            {apt.status}
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    )
}
