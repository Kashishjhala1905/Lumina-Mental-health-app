import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquareHeart, Star } from 'lucide-react'
import PageShell from '@/components/PageShell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Notice, LoadingState, EmptyState } from '@/components/ui/notice'
import api, { errorMessage, fieldErrors } from '@/lib/api'

const NOTE_MAX = 280
const COMMENTS_MAX = 1000
const RATING_WORDS = ['', 'Very poor', 'Poor', 'Okay', 'Good', 'Excellent']
const RELATED_LABEL = { counselor: 'Counsellor', meditation: 'Meditation track', exercise: 'Exercise' }

/** 1–5 star input (radio group, keyboard accessible). */
function StarRating({ value, onChange }) {
    const [hover, setHover] = useState(0)
    const shown = hover || value
    return (
        <div>
            <div role="radiogroup" aria-label="Rating from 1 to 5 stars" className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map((n) => (
                    <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={value === n}
                        aria-label={`${n} star${n > 1 ? 's' : ''} – ${RATING_WORDS[n]}`}
                        onClick={() => onChange(n)}
                        onMouseEnter={() => setHover(n)}
                        className="rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                        <Star className={`h-8 w-8 transition-colors ${n <= shown ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`} />
                    </button>
                ))}
                <span className="ml-2 text-sm text-muted-foreground" aria-live="polite">{shown ? `${shown}/5 · ${RATING_WORDS[shown]}` : 'Choose a rating'}</span>
            </div>
        </div>
    )
}

const emailNote = (status) => ({
    accepted: 'The Lumina team has been notified.',
    captured: 'Saved (email notifications are in development mode on this server).',
    failed: 'Your feedback is saved. The notification email could not be sent right now.',
    skipped: 'Your feedback is saved. Email notifications are not configured on this server.',
    duplicate: 'The Lumina team has been notified.',
}[status] || '')

export default function Feedback() {
    const [options, setOptions] = useState(null)
    const [form, setForm] = useState({ rating: 0, category: '', note: '', comments: '', relatedType: '', relatedId: '' })
    const [errors, setErrors] = useState({})
    const [busy, setBusy] = useState(false)
    const [result, setResult] = useState(null)
    const [error, setError] = useState('')
    const [mine, setMine] = useState({ loading: true, items: [], page: 1, pages: 1 })

    useEffect(() => {
        api.get('/feedback/options').then(({ data }) => setOptions(data.data)).catch((err) => setError(errorMessage(err, 'Could not load the feedback form.')))
    }, [])

    const loadMine = useCallback(async (page = 1) => {
        try {
            const { data } = await api.get(`/feedback/mine?page=${page}&limit=5`)
            setMine({ loading: false, items: data.data, page, pages: data.pagination.pages })
        } catch { setMine((m) => ({ ...m, loading: false })) }
    }, [])
    useEffect(() => { loadMine(1) }, [loadMine])

    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
    const relatedItems = form.relatedType === 'counselor' ? options?.counselors : form.relatedType === 'meditation' ? options?.meditations : form.relatedType === 'exercise' ? options?.exercises : []

    const submit = async (e) => {
        e.preventDefault()
        const next = {}
        if (!form.rating) next.rating = 'Please choose a rating from 1 to 5 stars'
        if (!form.category) next.category = 'Please choose a feedback category'
        if (!form.note.trim()) next.note = 'Please write a short note'
        if (form.relatedType && !form.relatedId) next.related = 'Please choose the item your feedback is about'
        setErrors(next)
        setResult(null)
        setError('')
        if (Object.keys(next).length) return
        setBusy(true)
        try {
            const { data } = await api.post('/feedback', {
                rating: form.rating, category: form.category, note: form.note.trim(), comments: form.comments.trim(),
                relatedType: form.relatedType || undefined, relatedId: form.relatedId || undefined,
            })
            setResult({ type: 'success', text: `Thank you! Your feedback was saved. ${emailNote(data.data.emailStatus)}` })
            setForm({ rating: 0, category: '', note: '', comments: '', relatedType: '', relatedId: '' })
            loadMine(1)
        } catch (err) {
            setErrors(fieldErrors(err))
            setResult({ type: err.response?.status === 409 ? 'info' : 'error', text: errorMessage(err, 'Your feedback could not be sent. Please try again.') })
        } finally {
            setBusy(false)
        }
    }

    const selectClass = 'h-10 w-full rounded-md border border-primary/20 bg-background px-3 text-sm'
    return (
        <PageShell title="Share Your" highlight="Feedback" subtitle="Tell us what is working and what we can improve. Your feedback is stored securely and shared with the Lumina team without your name or email." maxWidth="max-w-3xl">
            <Card className="p-6 md:p-8 bg-card/50 backdrop-blur border-border shadow-lg">
                {error ? <Notice type="error">{error}</Notice> : !options ? <LoadingState label="Loading..." /> : (
                    <form onSubmit={submit} className="space-y-6" noValidate>
                        {result && <Notice type={result.type}>{result.text}</Notice>}
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-foreground">Your rating *</p>
                            <StarRating value={form.rating} onChange={(rating) => setForm({ ...form, rating })} />
                            {errors.rating && <p className="text-sm text-destructive">{errors.rating}</p>}
                        </div>
                        <label className="block space-y-1.5 text-sm">
                            <span className="font-medium">Category *</span>
                            <select value={form.category} onChange={set('category')} className={selectClass} aria-invalid={!!errors.category}>
                                <option value="">Choose a category</option>
                                {options.categories.map((c) => <option key={c}>{c}</option>)}
                            </select>
                            {errors.category && <span className="text-destructive">{errors.category}</span>}
                        </label>
                        <label className="block space-y-1.5 text-sm">
                            <span className="font-medium">Short note *</span>
                            <Textarea value={form.note} onChange={set('note')} maxLength={NOTE_MAX} placeholder="What stood out for you?" className="min-h-[80px]" aria-invalid={!!errors.note} />
                            <span className="flex justify-between text-xs text-muted-foreground"><span className="text-destructive">{errors.note}</span><span>{form.note.length}/{NOTE_MAX}</span></span>
                        </label>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="space-y-1.5 text-sm">
                                <span className="font-medium">Related to (optional)</span>
                                <select value={form.relatedType} onChange={(e) => setForm({ ...form, relatedType: e.target.value, relatedId: '' })} className={selectClass}>
                                    <option value="">Nothing specific</option>
                                    <option value="counselor">A counsellor I booked</option>
                                    <option value="meditation">A meditation track</option>
                                    <option value="exercise">An exercise</option>
                                </select>
                            </label>
                            {form.relatedType && (
                                <label className="space-y-1.5 text-sm">
                                    <span className="font-medium">{RELATED_LABEL[form.relatedType]}</span>
                                    <select value={form.relatedId} onChange={set('relatedId')} className={selectClass} disabled={!relatedItems?.length}>
                                        <option value="">{relatedItems?.length ? 'Choose…' : form.relatedType === 'counselor' ? 'No booked counsellors yet' : 'Nothing available'}</option>
                                        {(relatedItems || []).map((x) => <option key={x._id} value={x._id}>{x.name || x.title}{x.isDemo ? ' (demo)' : ''}</option>)}
                                    </select>
                                </label>
                            )}
                        </div>
                        {errors.related && <p className="text-sm text-destructive">{errors.related}</p>}
                        {form.relatedType === 'counselor' && <p className="text-xs text-muted-foreground">Only counsellors you have booked can be rated, so ratings stay genuine. <Link to="/counseling" className="text-primary underline">Find a counsellor</Link></p>}
                        <label className="block space-y-1.5 text-sm">
                            <span className="font-medium">Additional comments (optional)</span>
                            <Textarea value={form.comments} onChange={set('comments')} maxLength={COMMENTS_MAX} placeholder="Anything else you'd like to share?" className="min-h-[100px]" />
                            <span className="block text-right text-xs text-muted-foreground">{form.comments.length}/{COMMENTS_MAX}</span>
                        </label>
                        <p className="text-xs text-muted-foreground">Please don't include personal details. For urgent help call 112 or Tele-MANAS 14416.</p>
                        <Button type="submit" disabled={busy} className="w-full bg-gradient-primary text-white hover:opacity-90 h-11">{busy ? 'Sending...' : 'Submit feedback'}</Button>
                    </form>
                )}
            </Card>

            <section className="mt-8">
                <h2 className="text-lg font-semibold text-foreground mb-3">Your recent feedback</h2>
                {mine.loading ? <LoadingState /> : mine.items.length === 0 ? (
                    <Card className="bg-card/50"><EmptyState icon={MessageSquareHeart} title="No feedback yet">Feedback you send will appear here.</EmptyState></Card>
                ) : (
                    <div className="space-y-3">
                        {mine.items.map((f) => (
                            <Card key={f._id} className="p-4 bg-card/50 border-border text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-amber-500" aria-label={`${f.rating} out of 5 stars`}>{'★'.repeat(f.rating)}<span className="text-muted-foreground/40">{'★'.repeat(5 - f.rating)}</span></span>
                                    <span className="text-xs text-muted-foreground">{new Date(f.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                </div>
                                <p className="mt-1 font-medium text-foreground">{f.category}{f.related ? ` · ${f.related.label}` : ''}</p>
                                <p className="text-muted-foreground">{f.note}</p>
                            </Card>
                        ))}
                        {mine.pages > 1 && (
                            <div className="flex justify-center gap-2">
                                <Button size="sm" variant="outline" disabled={mine.page <= 1} onClick={() => loadMine(mine.page - 1)}>Previous</Button>
                                <Button size="sm" variant="outline" disabled={mine.page >= mine.pages} onClick={() => loadMine(mine.page + 1)}>Next</Button>
                            </div>
                        )}
                    </div>
                )}
            </section>
        </PageShell>
    )
}
