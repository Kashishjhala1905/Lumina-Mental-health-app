import { Link, useLocation } from 'react-router-dom'
import { Loader2, Pause, Play, Repeat, SkipBack, SkipForward, Volume2, VolumeX, X, AlertCircle, RotateCcw, Music2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAudioPlayer, formatClock } from '@/context/AudioPlayerContext'
import { cn } from '@/lib/utils'

/** Current guide prompt for guided tracks (the last prompt whose time has passed). */
function currentPrompt(guide = [], t = 0) {
    let text = ''
    for (const g of guide) if (g.at <= t) text = g.text
    return text
}

/** Breathing phase for paced-breathing tracks. */
function breathingPhase(b, t) {
    if (!b?.inhale || !b?.exhale) return null
    const hold = b.hold || 0
    const cycle = b.inhale + hold + b.exhale
    const pos = t % cycle
    if (pos < b.inhale) return { label: 'Breathe in', progress: pos / b.inhale, expanding: true, left: Math.ceil(b.inhale - pos) }
    if (pos < b.inhale + hold) return { label: 'Hold', progress: 1, expanding: true, left: Math.ceil(b.inhale + hold - pos) }
    const e = pos - b.inhale - hold
    return { label: 'Breathe out', progress: 1 - e / b.exhale, expanding: false, left: Math.ceil(b.exhale - e) }
}

function PlayButton({ size = 'lg' }) {
    const { status, toggle, track } = useAudioPlayer()
    const big = size === 'lg'
    return (
        <Button
            type="button"
            size="icon"
            onClick={toggle}
            disabled={!track}
            aria-label={status === 'playing' ? 'Pause' : status === 'paused' ? 'Resume' : 'Play'}
            className={cn('rounded-full bg-gradient-primary text-white hover:opacity-90', big ? 'h-14 w-14' : 'h-9 w-9')}
        >
            {status === 'loading' ? <Loader2 className={cn('animate-spin', big ? 'h-6 w-6' : 'h-4 w-4')} />
                : status === 'playing' ? <Pause className={big ? 'h-6 w-6' : 'h-4 w-4'} />
                    : <Play className={cn('ml-0.5', big ? 'h-6 w-6' : 'h-4 w-4')} />}
        </Button>
    )
}

/** Full player shown on the Resources page. */
export function FullPlayer() {
    const p = useAudioPlayer()
    const { track } = p
    if (!track) {
        return (
            <div className="rounded-xl border border-dashed border-primary/30 bg-card/40 p-6 text-center text-sm text-muted-foreground">
                <Music2 className="mx-auto mb-2 h-8 w-8 text-primary/50" aria-hidden="true" />
                Choose a track below to start listening. Playback continues while you browse other pages.
            </div>
        )
    }
    // Catalogue durations were measured exactly when the audio was generated; browsers only estimate AAC length
    const total = track.duration || p.duration || 0
    const prompt = currentPrompt(track.guide, p.currentTime)
    const breath = breathingPhase(track.breathing, p.currentTime)
    const statusText = { loading: 'Loading…', playing: 'Playing', paused: 'Paused', ended: 'Finished', error: 'Unavailable', idle: 'Ready' }[p.status]

    return (
        <section aria-label="Audio player" className="rounded-xl border border-primary/20 bg-card/70 p-5 shadow-lg backdrop-blur md:p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-medium text-primary">{track.category}</span>
                        {track.isShortLoop && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Short loop</span>}
                        <span className="text-muted-foreground" aria-live="polite">· {statusText}</span>
                    </div>
                    <h2 className="mt-1 truncate text-xl font-semibold text-foreground">{track.title}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{track.description}</p>
                </div>
                <div className="flex items-center justify-center gap-3">
                    <Button type="button" variant="ghost" size="icon" onClick={p.previous} aria-label="Previous track" disabled={p.queue.length < 1}><SkipBack className="h-5 w-5" /></Button>
                    <PlayButton />
                    <Button type="button" variant="ghost" size="icon" onClick={p.next} aria-label="Next track" disabled={p.queue.length < 2}><SkipForward className="h-5 w-5" /></Button>
                </div>
            </div>

            <div className="mt-5">
                <input
                    type="range"
                    min="0"
                    max={Math.max(total, 1)}
                    step="1"
                    value={Math.min(p.currentTime, total || p.currentTime)}
                    onChange={(e) => p.seek(Number(e.target.value))}
                    aria-label="Playback position"
                    aria-valuetext={`${formatClock(p.currentTime)} of ${formatClock(total)}`}
                    className="w-full accent-primary"
                />
                <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
                    <span>{formatClock(p.currentTime)}</span>
                    <span>{formatClock(total)}</span>
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" size="icon" onClick={p.toggleMute} aria-label={p.muted ? 'Unmute' : 'Mute'}>
                        {p.muted || p.volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                    <input type="range" min="0" max="1" step="0.05" value={p.muted ? 0 : p.volume} onChange={(e) => p.setVolume(Number(e.target.value))} aria-label="Volume" className="w-28 accent-primary" />
                    <span className="w-9 text-xs tabular-nums text-muted-foreground">{Math.round((p.muted ? 0 : p.volume) * 100)}%</span>
                </div>
                <div className="flex items-center gap-2">
                    <Button type="button" variant={p.loop ? 'default' : 'outline'} size="sm" onClick={() => p.setLoop(!p.loop)} aria-pressed={p.loop}>
                        <Repeat className="mr-1 h-4 w-4" /> Repeat
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={p.stop}><X className="mr-1 h-4 w-4" /> Stop</Button>
                </div>
            </div>

            {p.error && (
                <div role="alert" className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" aria-hidden="true" /> {p.error}
                    <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={p.resume}><RotateCcw className="mr-1 h-3 w-3" /> Try again</Button>
                </div>
            )}

            {(prompt || breath) && (
                <div className="mt-5 grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
                    {breath && (
                        <div className="flex items-center gap-4">
                            <div className="grid h-24 w-24 place-items-center" aria-hidden="true">
                                <div
                                    className="breath-orb grid place-items-center rounded-full bg-gradient-primary text-white shadow-lg"
                                    style={{ width: 96, height: 96, transform: `scale(${0.55 + 0.45 * breath.progress})` }}
                                />
                            </div>
                            <p className="text-lg font-semibold text-foreground" aria-live="polite">{breath.label} <span className="text-sm font-normal text-muted-foreground">({breath.left})</span></p>
                        </div>
                    )}
                    {prompt && <p className="rounded-lg bg-primary/10 px-4 py-3 text-sm text-primary" aria-live="polite">{prompt}</p>}
                </div>
            )}

            {track.source && <p className="mt-4 text-[11px] text-muted-foreground">Audio: {track.source}. {track.license}.</p>}
        </section>
    )
}

/** Small persistent player shown on every other page while a track is loaded. */
export function MiniPlayer() {
    const p = useAudioPlayer()
    const location = useLocation()
    if (!p.track || location.pathname === '/resources') return null
    const total = p.track.duration || p.duration || 0
    const pct = total ? Math.min(100, (p.currentTime / total) * 100) : 0
    return (
        <aside aria-label="Now playing" className="fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-primary/20 bg-background/95 shadow-2xl backdrop-blur">
            <div className="flex items-center gap-3 p-3">
                <PlayButton size="sm" />
                <div className="min-w-0 flex-1">
                    <Link to="/resources" className="block truncate text-sm font-semibold text-foreground hover:text-primary">{p.track.title}</Link>
                    <p className="truncate text-xs text-muted-foreground">{p.track.category} · {formatClock(p.currentTime)} / {formatClock(total)}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={p.next} aria-label="Next track" disabled={p.queue.length < 2}><SkipForward className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={p.stop} aria-label="Close player"><X className="h-4 w-4" /></Button>
            </div>
            <div className="h-1 bg-muted"><div className="h-full bg-gradient-primary" style={{ width: `${pct}%` }} /></div>
            {p.error && <p role="alert" className="px-3 pb-2 text-xs text-destructive">{p.error}</p>}
        </aside>
    )
}
