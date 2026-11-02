import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Activity, BookOpen, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Dumbbell, MessageSquareHeart, MessagesSquare, Music2, Smile, Users, Eye, EyeOff } from 'lucide-react'
import PageShell from '@/components/PageShell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Notice, LoadingState, EmptyState } from '@/components/ui/notice'
import { ChartCard, DataTable, ScaleTrendChart, ValueTrendChart } from '@/components/charts/ChartKit'
import { formatClock } from '@/context/AudioPlayerContext'
import api, { errorMessage } from '@/lib/api'

const SECTIONS = [
    { key: 'assessments', label: 'Assessments', icon: ClipboardList, count: 'assessments' },
    { key: 'chats', label: 'Chatbot', icon: MessagesSquare, count: 'conversations' },
    { key: 'meditation', label: 'Meditation', icon: Music2, count: 'meditation' },
    { key: 'exercise', label: 'Exercises', icon: Dumbbell, count: 'exercise' },
    { key: 'resources', label: 'Resources used', icon: BookOpen, count: 'resources' },
    { key: 'checkins', label: 'Daily check-ins', icon: Smile, count: 'checkins' },
    { key: 'posts', label: 'Community posts', icon: Users, count: 'posts' },
    { key: 'feedback', label: 'Feedback', icon: MessageSquareHeart, count: 'feedback' },
]
const MOOD_EMOJI = { happy: '😊', neutral: '😐', sad: '😢', anxious: '😟', angry: '😠' }
const STATUS_STYLE = { completed: 'bg-green-500/15 text-green-700 dark:text-green-300', started: 'bg-muted text-muted-foreground', abandoned: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', viewed: 'bg-primary/10 text-primary' }
const STATUS_LABEL = { completed: 'Completed', started: 'In progress', abandoned: 'Stopped early', viewed: 'Read' }

const when = (d) => new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
const ymdLocal = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

/** Loads one page of a history list; refetches when the path, page or date range changes. */
function usePaged(path, { from, to, limit = 10, extra = '' }) {
    const [page, setPage] = useState(1)
    const [state, setState] = useState({ loading: true, error: '', rows: [], pages: 1, total: 0, raw: null })
    useEffect(() => { setPage(1) }, [path, from, to, extra])
    const load = useCallback(async () => {
        setState((s) => ({ ...s, loading: true, error: '' }))
        const params = new URLSearchParams({ page: String(page), limit: String(limit) })
        if (from) params.set('from', from)
        if (to) params.set('to', to)
        try {
            const { data } = await api.get(`${path}?${params}${extra}`)
            setState({ loading: false, error: '', rows: data.data || [], pages: data.pagination?.pages || 1, total: data.pagination?.total ?? (data.data || []).length, raw: data })
        } catch (err) {
            setState({ loading: false, error: errorMessage(err, 'Could not load this history.'), rows: [], pages: 1, total: 0, raw: null })
        }
    }, [path, page, limit, from, to, extra])
    useEffect(() => { load() }, [load])
    return { ...state, page, setPage, reload: load }
}

function Pager({ page, pages, setPage }) {
    if (pages <= 1) return null
    return (
        <nav className="flex items-center justify-center gap-2 pt-2" aria-label="Pagination">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="mr-1 h-4 w-4" /> Previous</Button>
            <span className="px-2 text-sm text-muted-foreground">{page} / {pages}</span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button>
        </nav>
    )
}

function ListShell({ q, empty, children }) {
    if (q.loading && !q.rows.length) return <LoadingState />
    if (q.error) return <Notice type="error">{q.error} <Button size="sm" variant="outline" className="ml-2" onClick={q.reload}>Try again</Button></Notice>
    if (!q.rows.length) return <Card className="bg-card/50">{empty}</Card>
    return <div className="space-y-3">{children}<Pager page={q.page} pages={q.pages} setPage={q.setPage} /></div>
}

const Row = ({ children, ...rest }) => <Card className="p-4 bg-card/50 border-border flex flex-wrap items-center justify-between gap-3" {...rest}>{children}</Card>

function AssessmentsSection({ range }) {
    const q = usePaged('/assessments/history', range)
    const trend = q.raw?.trend || []
    return (
        <div className="space-y-4">
            {trend.length > 1 && (
                <ChartCard title="Wellbeing score over time" subtitle="0–100, higher is better" height={220}
                    table={<DataTable columns={[{ key: 'date', label: 'Date' }, { key: 'score', label: 'Score' }, { key: 'result', label: 'Result' }]} rows={trend.map((t) => ({ ...t, date: when(t.date) }))} />}>
                    <ValueTrendChart data={trend} dataKey="score" name="Wellbeing score" ticks={[0, 25, 50, 75, 100]} suffix="/100" height={220} />
                </ChartCard>
            )}
            <ListShell q={q} empty={<EmptyState icon={ClipboardList} title="No assessments yet" action={<Button asChild><Link to="/assessment">Take the assessment</Link></Button>}>Each completed assessment is saved here so you can compare over time.</EmptyState>}>
                {q.rows.map((r, i) => {
                    const prev = q.rows[i + 1]
                    const change = prev ? r.score - prev.score : null
                    return (
                        <Row key={r._id}>
                            <div>
                                <p className="font-medium text-foreground">{r.result} · {r.score}/100 {change != null && <span className={`ml-1 text-xs ${change > 0 ? 'text-green-600' : change < 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>({change > 0 ? '+' : ''}{change} vs previous)</span>}</p>
                                <p className="text-xs text-muted-foreground">{when(r.completedAt)}</p>
                            </div>
                            <Button asChild size="sm" variant="outline"><Link to={`/assessment?result=${r._id}`}>View result</Link></Button>
                        </Row>
                    )
                })}
            </ListShell>
        </div>
    )
}

function ChatsSection({ range }) {
    const q = usePaged('/chatbot/conversations', range)
    return (
        <ListShell q={q} empty={<EmptyState icon={MessagesSquare} title="No saved conversations" action={<Button asChild><Link to="/chatbot">Start a chat</Link></Button>}>Chats you have while signed in are saved privately to your account.</EmptyState>}>
            {q.rows.map((c) => (
                <Row key={c._id}>
                    <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{c.title}</p>
                        <p className="text-xs text-muted-foreground">{c.messageCount} messages · last message {when(c.lastMessageAt || c.updatedAt)}</p>
                    </div>
                    <Button asChild size="sm" variant="outline"><Link to={`/chatbot?c=${c._id}`}>Open & continue</Link></Button>
                </Row>
            ))}
        </ListShell>
    )
}

function ActivitySection({ range, type }) {
    const q = usePaged('/resources/activity', { ...range, extra: `&type=${type}` })
    const totals = q.raw?.totals?.[type]
    const meta = {
        meditation: { icon: Music2, title: 'No meditation sessions yet', cta: 'Listen to a track', text: 'Tracks you play while signed in appear here.' },
        exercise: { icon: Dumbbell, title: 'No exercise sessions yet', cta: 'Try an exercise', text: 'Exercises you start while signed in appear here.' },
        strategy: { icon: BookOpen, title: 'No guides read yet', cta: 'Browse strategies', text: 'Strategy guides you open while signed in appear here.' },
    }[type]
    return (
        <div className="space-y-4">
            {totals && type !== 'strategy' && (
                <p className="text-sm text-muted-foreground">All time: <span className="font-medium text-foreground">{totals.sessions}</span> sessions · <span className="font-medium text-foreground">{totals.completed}</span> completed · <span className="font-medium text-foreground">{formatClock(totals.seconds)}</span> total time</p>
            )}
            <ListShell q={q} empty={<EmptyState icon={meta.icon} title={meta.title} action={<Button asChild><Link to="/resources">{meta.cta}</Link></Button>}>{meta.text}</EmptyState>}>
                {q.rows.map((a) => (
                    <Row key={a._id}>
                        <div>
                            <p className="font-medium text-foreground">{a.title}</p>
                            <p className="text-xs text-muted-foreground">{a.category} · {when(a.startedAt)}{a.durationSeconds ? ` · ${formatClock(a.durationSeconds)}${a.targetSeconds ? ` of ${formatClock(a.targetSeconds)}` : ''}` : ''}</p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[a.status]}`}>{STATUS_LABEL[a.status] || a.status}</span>
                    </Row>
                ))}
            </ListShell>
        </div>
    )
}

/** Month calendar of check-ins (one per day). */
function CheckinCalendar({ entries, month, setMonth }) {
    const byDay = useMemo(() => Object.fromEntries(entries.map((e) => [e.localDate, e])), [entries])
    const [y, m] = month.split('-').map(Number)
    const first = new Date(Date.UTC(y, m - 1, 1))
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const lead = first.getUTCDay()
    const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)]
    const shift = (n) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)) }
    const today = ymdLocal()
    return (
        <Card className="p-5 bg-card/50 border-border">
            <div className="mb-3 flex items-center justify-between">
                <Button size="icon" variant="ghost" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
                <h3 className="font-semibold text-foreground">{first.toLocaleDateString([], { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3>
                <Button size="icon" variant="ghost" onClick={() => shift(1)} aria-label="Next month" disabled={month >= today.slice(0, 7)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="py-1 font-medium text-muted-foreground">{d}</div>)}
                {cells.map((day, i) => {
                    if (!day) return <div key={`b${i}`} />
                    const e = byDay[day]
                    return (
                        <div key={day} title={e ? `${day}: ${e.mood}${e.notes ? ` – ${e.notes}` : ''}` : day}
                            className={`aspect-square rounded-lg border p-1 ${e ? 'border-primary/30 bg-primary/10' : 'border-border'} ${day === today ? 'ring-1 ring-primary' : ''}`}>
                            <div className="text-[10px] text-muted-foreground">{Number(day.slice(8))}</div>
                            {e && <div className="text-base leading-none" aria-label={e.mood}>{MOOD_EMOJI[e.mood] || '•'}</div>}
                        </div>
                    )
                })}
            </div>
        </Card>
    )
}

function CheckinsSection({ range }) {
    const [month, setMonth] = useState(ymdLocal().slice(0, 7))
    const monthRange = useMemo(() => {
        const [y, m] = month.split('-').map(Number)
        return { from: `${month}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }
    }, [month])
    const cal = usePaged('/mood', { ...monthRange, limit: 31 })
    const q = usePaged('/mood', range)
    const trend = [...q.rows].reverse().map((e) => ({ date: e.localDate, emotional: e.emotionalState ?? null, stress: e.stressLevel ?? null, energy: e.energyLevel ?? null, sleep: e.sleepQuality ?? null }))
    const hasScales = trend.some((t) => t.emotional != null || t.stress != null)
    return (
        <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
                <CheckinCalendar entries={cal.rows} month={month} setMonth={setMonth} />
                {hasScales ? (
                    <ChartCard title="How you've been feeling" subtitle="1 = low, 5 = high (this page of check-ins)" height={240}
                        table={<DataTable columns={[{ key: 'date', label: 'Date' }, { key: 'emotional', label: 'Emotional state' }, { key: 'stress', label: 'Stress' }, { key: 'energy', label: 'Energy' }, { key: 'sleep', label: 'Sleep' }]} rows={trend.map((t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v ?? '—'])))} />}>
                        <ScaleTrendChart data={trend} series={[{ key: 'emotional', name: 'Emotional state' }, { key: 'stress', name: 'Stress level' }]} />
                    </ChartCard>
                ) : <Card className="p-5 bg-card/50 border-border text-sm text-muted-foreground grid place-items-center">Add emotional state, stress, energy and sleep ratings in your daily check-in to see trends here.</Card>}
            </div>
            <ListShell q={q} empty={<EmptyState icon={CalendarDays} title="No check-ins yet" action={<Button asChild><Link to="/dashboard">Check in today</Link></Button>}>One check-in per day; you can edit today's from your dashboard.</EmptyState>}>
                {q.rows.map((e) => (
                    <Row key={e._id}>
                        <div className="min-w-0">
                            <p className="font-medium text-foreground">{MOOD_EMOJI[e.mood]} <span className="capitalize">{e.mood}</span> · {new Date(`${e.localDate}T00:00:00Z`).toLocaleDateString([], { dateStyle: 'medium', timeZone: 'UTC' })}</p>
                            <p className="text-xs text-muted-foreground">
                                {[['Emotional', e.emotionalState], ['Stress', e.stressLevel], ['Energy', e.energyLevel], ['Sleep', e.sleepQuality]].filter(([, v]) => v != null).map(([k, v]) => `${k} ${v}/5`).join(' · ') || 'Mood only'}
                                {' · '}checked in {new Date(e.checkinAt || e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{e.editedAt ? ' (edited)' : ''}
                            </p>
                            {e.notes && <p className="mt-1 text-sm text-muted-foreground">“{e.notes}”</p>}
                        </div>
                    </Row>
                ))}
            </ListShell>
        </div>
    )
}

function PostsSection({ range }) {
    const q = usePaged('/community/posts/mine', range)
    return (
        <ListShell q={q} empty={<EmptyState icon={Users} title="No community posts yet" action={<Button asChild><Link to="/community">Visit the community</Link></Button>}>Your posts – including anonymous ones – appear here only for you.</EmptyState>}>
            {q.rows.map((p) => (
                <Row key={p._id}>
                    <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{p.title || p.content.slice(0, 60)}</p>
                        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            <span>{when(p.createdAt)}</span><span>{p.category}</span>
                            <span className="inline-flex items-center gap-1">{p.identity === 'anonymous' ? <><EyeOff className="h-3 w-3" /> Anonymous</> : <><Eye className="h-3 w-3" /> With your name</>}</span>
                            <span>♥ {p.likesCount} · {p.commentsCount} comments</span>
                        </p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${p.status === 'published' ? 'bg-green-500/15 text-green-700 dark:text-green-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'}`}>{p.status === 'published' ? 'Published' : p.status === 'hidden' ? 'Under review' : 'Removed'}</span>
                </Row>
            ))}
        </ListShell>
    )
}

function FeedbackSection({ range }) {
    const q = usePaged('/feedback/mine', range)
    return (
        <ListShell q={q} empty={<EmptyState icon={MessageSquareHeart} title="No feedback yet" action={<Button asChild><Link to="/feedback">Give feedback</Link></Button>} />}>
            {q.rows.map((f) => (
                <Row key={f._id}>
                    <div className="min-w-0">
                        <p className="font-medium text-foreground"><span className="text-amber-500" aria-label={`${f.rating} out of 5`}>{'★'.repeat(f.rating)}</span> {f.category}{f.related ? ` · ${f.related.label}` : ''}</p>
                        <p className="text-sm text-muted-foreground">{f.note}</p>
                        <p className="text-xs text-muted-foreground">{when(f.createdAt)}</p>
                    </div>
                </Row>
            ))}
        </ListShell>
    )
}

export default function History() {
    const [params, setParams] = useSearchParams()
    const section = SECTIONS.some((s) => s.key === params.get('section')) ? params.get('section') : 'assessments'
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')
    const [summary, setSummary] = useState(null)
    const [summaryError, setSummaryError] = useState('')
    const range = useMemo(() => ({ from, to }), [from, to])

    useEffect(() => {
        api.get('/history/summary').then(({ data }) => setSummary(data.data)).catch((err) => setSummaryError(errorMessage(err, 'Could not load your history summary.')))
    }, [])

    const content = {
        assessments: <AssessmentsSection range={range} />,
        chats: <ChatsSection range={range} />,
        meditation: <ActivitySection range={range} type="meditation" />,
        exercise: <ActivitySection range={range} type="exercise" />,
        resources: <ActivitySection range={range} type="strategy" />,
        checkins: <CheckinsSection range={range} />,
        posts: <PostsSection range={range} />,
        feedback: <FeedbackSection range={range} />,
    }[section]

    return (
        <PageShell title="My" highlight="History" subtitle="Everything you have done in Lumina, visible only to you. Your records stay safe when you sign out." maxWidth="max-w-6xl">
            {summaryError && <Notice type="error" className="mb-4">{summaryError}</Notice>}
            <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
                <nav aria-label="History sections" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
                    {SECTIONS.map((item) => { const { key, label, count } = item; const SectionIcon = item.icon; return (
                        <button key={key} onClick={() => setParams({ section: key })} aria-current={section === key ? 'page' : undefined}
                            className={`flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${section === key ? 'bg-gradient-primary text-white' : 'text-foreground hover:bg-primary/10'}`}>
                            <span className="flex items-center gap-2"><SectionIcon className="h-4 w-4" aria-hidden="true" /> {label}</span>
                            {summary && <span className={`rounded-full px-2 text-xs ${section === key ? 'bg-white/20' : 'bg-muted text-muted-foreground'}`}>{summary.counts[count]}</span>}
                        </button>
                    ) })}
                </nav>
                <section aria-label={SECTIONS.find((s) => s.key === section).label} className="min-w-0 space-y-4">
                    <Card className="flex flex-wrap items-end gap-3 p-4 bg-card/50 border-border">
                        <Activity className="hidden h-5 w-5 self-center text-primary sm:block" aria-hidden="true" />
                        <label className="space-y-1 text-xs font-medium">From<Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9" /></label>
                        <label className="space-y-1 text-xs font-medium">To<Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9" /></label>
                        {(from || to) && <Button size="sm" variant="ghost" onClick={() => { setFrom(''); setTo('') }}>Clear dates</Button>}
                    </Card>
                    {content}
                </section>
            </div>
        </PageShell>
    )
}
