import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import PageShell from '@/components/PageShell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Notice, LoadingState } from '@/components/ui/notice'
import { HeartHandshake } from 'lucide-react'
import api, { errorMessage, fieldErrors } from '@/lib/api'
import { cn } from '@/lib/utils'
import { VSNav, DistressExplanationCard, UrgentSupportCard } from '@/components/victim-support/VSParts'
import { SCALE_QUESTIONS, CHOICE_QUESTIONS } from '@/components/victim-support/vsConstants'

const EMPTY = {
    emotionalState: null, stressLevel: null, anxietyLevel: null, sleepQuality: null, dailyFunctioning: null,
    safetyConcern: null, socialSupport: null, needsProfessionalHelp: null, requestCounselorContact: false, comments: '',
}
const MAX_COMMENT = 2000

function ScaleQuestion({ q, value, onChange, error }) {
    return (
        <fieldset className="space-y-2" aria-describedby={error ? `${q.key}-error` : undefined}>
            <legend className="text-sm font-medium text-foreground">
                {q.label} {q.required ? <span className="text-destructive" aria-hidden="true">*</span> : <span className="text-xs text-muted-foreground">(optional)</span>}
            </legend>
            <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label={q.label}>
                {[1, 2, 3, 4, 5].map((n) => (
                    <label key={n} className="cursor-pointer">
                        <input type="radio" name={q.key} value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only peer" />
                        <span className={cn(
                            'flex flex-col items-center justify-center rounded-lg border px-1 py-2 text-center transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
                            value === n ? 'bg-gradient-primary text-white border-transparent' : 'border-border hover:border-primary/50'
                        )}>
                            <span className="text-lg font-bold leading-none">{n}</span>
                            <span className="text-[10px] sm:text-xs mt-1 leading-tight">{q.labels[n - 1]}</span>
                        </span>
                    </label>
                ))}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
                <span>{q.low}</span>
                {!q.required && value !== null && <button type="button" className="text-primary hover:underline" onClick={() => onChange(null)}>Skip this question</button>}
                <span>{q.high}</span>
            </div>
            {error && <p id={`${q.key}-error`} className="text-xs text-destructive">{error}</p>}
        </fieldset>
    )
}

function ChoiceQuestion({ q, value, onChange, error }) {
    return (
        <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">{q.label} <span className="text-xs text-muted-foreground">(optional)</span></legend>
            <div className="grid sm:grid-cols-2 gap-2">
                {q.options.map((o) => (
                    <label key={o.value} className="cursor-pointer">
                        <input type="radio" name={q.key} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only peer" />
                        <span className={cn(
                            'block rounded-lg border px-3 py-2 text-sm transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
                            value === o.value ? 'bg-gradient-primary text-white border-transparent' : 'border-border hover:border-primary/50'
                        )}>{o.label}</span>
                    </label>
                ))}
            </div>
            {value !== null && <button type="button" className="text-xs text-primary hover:underline" onClick={() => onChange(null)}>Clear answer</button>}
            {error && <p className="text-xs text-destructive">{error}</p>}
        </fieldset>
    )
}

export default function VictimCheckin() {
    const navigate = useNavigate()
    const location = useLocation()
    const [ready, setReady] = useState(false)
    const [form, setForm] = useState(EMPTY)
    const [errors, setErrors] = useState({})
    const [error, setError] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [result, setResult] = useState(null)

    // Monitoring requires active consent
    useEffect(() => {
        api.get('/victim-support/consent')
            .then(({ data }) => {
                if (data.data.consent?.status !== 'active') navigate('/victim-support/consent', { replace: true })
                else setReady(true)
            })
            .catch((err) => { setError(errorMessage(err)); setReady(true) })
    }, [navigate])

    const set = (key) => (value) => {
        setForm((f) => ({ ...f, [key]: value }))
        if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
    }

    const submit = async (e) => {
        e.preventDefault()
        const missing = {}
        for (const q of SCALE_QUESTIONS) if (q.required && form[q.key] === null) missing[q.key] = 'Please choose an answer'
        if (form.comments.length > MAX_COMMENT) missing.comments = `Please keep comments under ${MAX_COMMENT} characters`
        setErrors(missing)
        if (Object.keys(missing).length) { setError('Please answer the three required questions (marked *).'); return }

        setSubmitting(true)
        setError('')
        try {
            const { data } = await api.post('/victim-support/checkins', form)
            setResult({ ...data.data, message: data.message })
            window.scrollTo({ top: 0, behavior: 'smooth' })
        } catch (err) {
            if (err.response?.data?.code === 'CONSENT_REQUIRED') { navigate('/victim-support/consent', { replace: true }); return }
            setErrors(fieldErrors(err))
            setError(errorMessage(err, 'Your check-in could not be saved. Please try again.'))
        } finally {
            setSubmitting(false)
        }
    }

    if (!ready) return <PageShell maxWidth="max-w-3xl"><LoadingState /></PageShell>

    if (result) {
        return (
            <PageShell title="Check-in" highlight="saved" maxWidth="max-w-4xl">
                <VSNav active="check-in" />
                <div className="space-y-6">
                    {result.showUrgentResources && <UrgentSupportCard prominent />}
                    <Notice type={result.alertAction !== 'none' ? 'warning' : 'success'} title={result.message}>
                        {result.alert && <>Reference {result.alert.alertRef} · status: {result.alert.status}. A person – not the computer – will review it.</>}
                    </Notice>
                    <DistressExplanationCard assessment={result.assessment} title="Your monitoring result" />
                    {result.assessment.ai?.status === 'unavailable' && result.checkin.hasComment && (
                        <Notice type="info">AI analysis of your comment was unavailable right now. Your check-in and monitoring score were saved normally, and your counselor can still read your comment.</Notice>
                    )}
                    <div className="flex flex-wrap gap-3">
                        <Button asChild><Link to="/victim-support/dashboard">View my monitoring dashboard</Link></Button>
                        <Button asChild variant="outline"><Link to="/resources">Try a calming exercise</Link></Button>
                        <Button asChild variant="outline"><Link to="/counseling">Book a counseling session</Link></Button>
                    </div>
                </div>
            </PageShell>
        )
    }

    return (
        <PageShell title="Well-being" highlight="check-in" subtitle="This takes about two minutes. Only the first three questions are required – skip anything you prefer not to answer." maxWidth="max-w-3xl">
            <VSNav active="check-in" />
            {location.state?.justConsented && <Notice type="success" className="mb-4">Thank you – your consent has been recorded and monitoring is now active.</Notice>}

            <form onSubmit={submit} noValidate>
                <Card className="p-6 bg-card/50 backdrop-blur border-border space-y-7">
                    {SCALE_QUESTIONS.map((q) => (
                        <ScaleQuestion key={q.key} q={q} value={form[q.key]} onChange={set(q.key)} error={errors[q.key]} />
                    ))}
                    {CHOICE_QUESTIONS.map((q) => (
                        <ChoiceQuestion key={q.key} q={q} value={form[q.key]} onChange={set(q.key)} error={errors[q.key]} />
                    ))}

                    <label className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 cursor-pointer">
                        <input type="checkbox" className="mt-1 h-4 w-4" checked={form.requestCounselorContact} onChange={(e) => set('requestCounselorContact')(e.target.checked)} />
                        <span>
                            <span className="font-medium flex items-center gap-2"><HeartHandshake className="w-4 h-4 text-primary" /> I would like a counselor to contact me</span>
                            <span className="block text-xs text-muted-foreground">Your assigned counselor will be notified and will reach out through Lumina.</span>
                        </span>
                    </label>

                    <div className="space-y-2">
                        <label htmlFor="comments" className="text-sm font-medium">Anything else you would like to share? <span className="text-xs text-muted-foreground">(optional)</span></label>
                        <p id="comments-hint" className="text-xs text-muted-foreground">You do not need to describe what happened. Share only what you are comfortable with – for example, how your week has been or what kind of help would be useful.</p>
                        <Textarea
                            id="comments"
                            rows={4}
                            maxLength={MAX_COMMENT}
                            value={form.comments}
                            onChange={(e) => set('comments')(e.target.value)}
                            aria-describedby="comments-hint"
                            aria-invalid={errors.comments ? true : undefined}
                        />
                        <p className="text-xs text-muted-foreground text-right">{form.comments.length}/{MAX_COMMENT}</p>
                        {errors.comments && <p className="text-xs text-destructive">{errors.comments}</p>}
                    </div>

                    {error && <Notice type="error">{error}</Notice>}
                    <div className="flex flex-wrap gap-3">
                        <Button type="submit" disabled={submitting}>{submitting ? 'Saving your check-in...' : 'Submit check-in'}</Button>
                        <Button type="button" variant="outline" onClick={() => { setForm(EMPTY); setErrors({}); setError('') }}>Clear form</Button>
                    </div>
                </Card>
            </form>
            <UrgentSupportCard className="mt-6" />
        </PageShell>
    )
}
