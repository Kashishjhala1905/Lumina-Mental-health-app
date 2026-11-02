import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Pause, Play, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { formatClock } from '@/context/AudioPlayerContext'
import { ExerciseIcon } from './exerciseIcons'

const TICK_MS = 250

/**
 * Accurate countdown: remaining time is derived from Date.now() (not by counting ticks), so it stays correct
 * when the tab is throttled. Exactly one interval exists while running; it is cleared on pause, completion,
 * reset and unmount. Completion is recorded once.
 */
function useCountdown(totalSeconds, onComplete) {
    const totalMs = totalSeconds * 1000
    const [status, setStatus] = useState('ready') // ready | running | paused | completed
    const [remainingMs, setRemainingMs] = useState(totalMs)
    const endAt = useRef(0)
    const pausedRemaining = useRef(totalMs)
    const completeFired = useRef(false)
    const onCompleteRef = useRef(onComplete)
    useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

    useEffect(() => {
        if (status !== 'running') return undefined
        const id = setInterval(() => {
            const left = Math.max(0, endAt.current - Date.now())
            setRemainingMs(left)
            if (left === 0) {
                clearInterval(id)
                setStatus('completed')
                if (!completeFired.current) {
                    completeFired.current = true
                    onCompleteRef.current?.()
                }
            }
        }, TICK_MS)
        return () => clearInterval(id)
    }, [status])

    const start = useCallback(() => {
        if (status === 'running' || status === 'completed') return
        endAt.current = Date.now() + pausedRemaining.current
        setStatus('running')
    }, [status])

    const pause = useCallback(() => {
        if (status !== 'running') return
        pausedRemaining.current = Math.max(0, endAt.current - Date.now())
        setRemainingMs(pausedRemaining.current)
        setStatus('paused')
    }, [status])

    const reset = useCallback(() => {
        pausedRemaining.current = totalMs
        completeFired.current = false
        setRemainingMs(totalMs)
        setStatus('ready')
    }, [totalMs])

    return { status, remainingMs, elapsedMs: totalMs - remainingMs, start, pause, reset }
}

/** Plays a short, soft chime with Web Audio (no audio file needed). */
function chime() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext
        if (!Ctx) return
        const ctx = new Ctx()
        const now = ctx.currentTime
        ;[523.25, 783.99].forEach((f, i) => {
            const o = ctx.createOscillator()
            const g = ctx.createGain()
            o.type = 'sine'
            o.frequency.value = f
            g.gain.setValueAtTime(0.0001, now + i * 0.18)
            g.gain.exponentialRampToValueAtTime(0.15, now + i * 0.18 + 0.03)
            g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 1.4)
            o.connect(g).connect(ctx.destination)
            o.start(now + i * 0.18)
            o.stop(now + i * 0.18 + 1.5)
        })
        setTimeout(() => ctx.close().catch(() => {}), 2200)
    } catch { /* sound is optional */ }
}

export default function ExerciseSession({ exercise, onClose }) {
    const { user } = useAuth()
    const activity = useRef({ id: null, pending: null, recorded: false })
    const [completedAt, setCompletedAt] = useState(null)
    const [saveNote, setSaveNote] = useState('')

    const record = useCallback(async (status, seconds) => {
        const a = activity.current
        if (a.recorded) return
        a.recorded = true
        const id = a.id || (await a.pending)
        if (!id) return
        try {
            await api.patch(`/resources/activity/${id}`, { status, durationSeconds: Math.round(seconds) })
            if (status === 'completed') setSaveNote('Saved to your history.')
        } catch (err) {
            if (status === 'completed' && err?.response?.status !== 409) setSaveNote('Completed – but we could not save it to your history.')
        }
    }, [])

    const handleComplete = useCallback(() => {
        setCompletedAt(new Date())
        chime()
        record('completed', exercise.duration)
    }, [exercise.duration, record])

    const timer = useCountdown(exercise.duration, handleComplete)

    const startSession = () => {
        // Create the history record on the first start of this session only
        if (user && !activity.current.id && !activity.current.pending) {
            activity.current.pending = api.post('/resources/activity', { resourceType: 'exercise', resourceId: exercise._id })
                .then(({ data }) => { activity.current.id = data.data.activityId; return activity.current.id })
                .catch(() => null)
        }
        timer.start()
    }

    const again = () => {
        activity.current = { id: null, pending: null, recorded: false }
        setCompletedAt(null)
        setSaveNote('')
        timer.reset()
    }

    // Leaving before the end records an abandoned session (only if one was started)
    const elapsedRef = useRef(0)
    useEffect(() => { elapsedRef.current = timer.elapsedMs / 1000 }, [timer.elapsedMs])
    const close = () => {
        if (activity.current.pending && !activity.current.recorded) record('abandoned', elapsedRef.current)
        onClose()
    }
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') close() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    })

    const pct = Math.min(100, (timer.elapsedMs / (exercise.duration * 1000)) * 100)
    const isBreathing = exercise.category === 'Breathing Exercises'

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="exercise-title">
            <Card className="max-h-[90vh] w-full max-w-xl overflow-y-auto bg-background p-6 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="rounded-lg bg-primary/10 p-2 text-primary"><ExerciseIcon name={exercise.icon} className="h-6 w-6" /></div>
                        <div>
                            <h2 id="exercise-title" className="text-2xl font-bold text-foreground">{exercise.title}</h2>
                            <p className="text-sm text-muted-foreground">{exercise.category} · {exercise.difficulty} · {formatClock(exercise.duration)}</p>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={close} aria-label="Close exercise"><X className="h-4 w-4" /></Button>
                </div>

                <p className="mt-4 text-sm text-muted-foreground">{exercise.description}</p>
                <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-foreground">
                    {(exercise.instructions || []).map((step, i) => <li key={i}>{step}</li>)}
                </ol>

                <div className="grid place-items-center py-6">
                    <div className={`grid h-36 w-36 place-items-center rounded-full border-4 border-primary/30 bg-primary/10 text-primary ${timer.status === 'running' && isBreathing ? 'motion-safe:animate-pulse' : ''}`}>
                        <div className="text-center" aria-live="off">
                            <p className="text-4xl font-bold tabular-nums" role="timer" aria-label={`${formatClock(Math.ceil(timer.remainingMs / 1000))} remaining`}>{formatClock(Math.ceil(timer.remainingMs / 1000))}</p>
                            <p className="text-xs" aria-live="polite">{{ ready: 'Ready', running: 'In progress', paused: 'Paused', completed: 'Done' }[timer.status]}</p>
                        </div>
                    </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Exercise progress">
                    <div className="h-full bg-gradient-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
                </div>

                {completedAt && (
                    <div className="mt-4 rounded-lg border border-primary/20 bg-primary/10 p-3 text-sm text-primary" role="status">
                        <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" /> Well done – exercise completed</div>
                        <p className="mt-1">Completed at {completedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. {user ? saveNote : 'Sign in to keep a history of your exercises.'}</p>
                    </div>
                )}

                <div className="mt-5 flex flex-wrap gap-3">
                    {timer.status === 'completed' ? (
                        <Button className="flex-1" onClick={again}><RotateCcw className="mr-2 h-4 w-4" /> Do it again</Button>
                    ) : timer.status === 'running' ? (
                        <Button className="flex-1" variant="outline" onClick={timer.pause}><Pause className="mr-2 h-4 w-4" /> Pause</Button>
                    ) : (
                        <Button className="flex-1 bg-gradient-primary text-white hover:opacity-90" onClick={startSession}>
                            <Play className="mr-2 h-4 w-4" /> {timer.status === 'paused' ? 'Resume' : 'Start'}
                        </Button>
                    )}
                    {timer.status !== 'completed' && (
                        <Button variant="outline" onClick={timer.reset} disabled={timer.status === 'ready'}><RotateCcw className="mr-2 h-4 w-4" /> Reset</Button>
                    )}
                </div>
            </Card>
        </div>
    )
}
