import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'

// One <audio> element for the whole app. It lives above the router, so playback continues across route
// changes and is never restarted by component re-renders.
const AudioPlayerContext = createContext(null)

const VOLUME_KEY = 'lumina:player-volume'
const COMPLETE_RATIO = 0.9 // listening to 90% of a track counts as completed

const readVolume = () => {
    const v = Number(localStorage.getItem(VOLUME_KEY))
    return Number.isFinite(v) && v >= 0 && v <= 1 && localStorage.getItem(VOLUME_KEY) !== null ? v : 0.7
}

export function AudioPlayerProvider({ children }) {
    const { user } = useAuth()
    const audioRef = useRef(null)
    if (!audioRef.current && typeof Audio !== 'undefined') {
        audioRef.current = new Audio()
        audioRef.current.preload = 'metadata'
    }

    const [queue, setQueue] = useState([])
    const [index, setIndex] = useState(-1)
    const [status, setStatus] = useState('idle') // idle | loading | playing | paused | ended | error
    const [error, setError] = useState('')
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [volume, setVolumeState] = useState(readVolume)
    const [muted, setMuted] = useState(false)
    const [loop, setLoopState] = useState(false)

    // Listening session for history (signed-in users only)
    const session = useRef({ activityId: null, trackId: null, listened: 0, lastTime: 0, finished: false })
    const userRef = useRef(user)
    useEffect(() => { userRef.current = user }, [user])
    const stopRef = useRef(null)
    const userId = user?._id || null
    const prevUserId = useRef(userId)
    useEffect(() => {
        // Signing out (or switching account) ends the current listening session
        if (prevUserId.current && prevUserId.current !== userId) stopRef.current?.()
        prevUserId.current = userId
    }, [userId])

    const queueRef = useRef(queue)
    useEffect(() => { queueRef.current = queue }, [queue])

    const track = index >= 0 ? queue[index] : null
    const trackRef = useRef(track)
    useEffect(() => { trackRef.current = track }, [track])

    const finishSession = useCallback((outcome) => {
        const s = session.current
        if (!s.activityId || s.finished) return
        s.finished = true
        api.patch(`/resources/activity/${s.activityId}`, { status: outcome, durationSeconds: Math.round(s.listened) }).catch(() => {})
    }, [])

    const beginSession = useCallback((t) => {
        session.current = { activityId: null, trackId: t._id, listened: 0, lastTime: 0, finished: false }
        if (!userRef.current) return
        const trackId = t._id
        api.post('/resources/activity', { resourceType: 'meditation', resourceId: t._id })
            .then(({ data }) => { if (session.current.trackId === trackId) session.current.activityId = data.data.activityId })
            .catch(() => {})
    }, [])

    // Audio element events
    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return
        const onTime = () => {
            setCurrentTime(audio.currentTime)
            const s = session.current
            const delta = audio.currentTime - s.lastTime
            if (delta > 0 && delta < 2) s.listened += delta // ignore seeks
            s.lastTime = audio.currentTime
            const t = trackRef.current
            const target = t?.duration || audio.duration
            if (target && s.listened >= target * COMPLETE_RATIO) finishSession('completed')
        }
        const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
        const onPlaying = () => { setStatus('playing'); setError('') }
        const onPause = () => setStatus((st) => (st === 'playing' || st === 'loading' ? 'paused' : st))
        const onWaiting = () => setStatus('loading')
        const onEnded = () => {
            finishSession('completed')
            setStatus('ended')
            // Continue with the next track in the list (if any)
            setIndex((i) => {
                const next = i + 1
                return next < queueRef.current.length ? next : i
            })
        }
        const onError = () => {
            if (!audio.src) return
            setStatus('error')
            setError('This track could not be loaded. Please check your connection and try again.')
        }
        audio.addEventListener('timeupdate', onTime)
        audio.addEventListener('loadedmetadata', onMeta)
        audio.addEventListener('durationchange', onMeta)
        audio.addEventListener('playing', onPlaying)
        audio.addEventListener('pause', onPause)
        audio.addEventListener('waiting', onWaiting)
        audio.addEventListener('ended', onEnded)
        audio.addEventListener('error', onError)
        return () => {
            audio.removeEventListener('timeupdate', onTime)
            audio.removeEventListener('loadedmetadata', onMeta)
            audio.removeEventListener('durationchange', onMeta)
            audio.removeEventListener('playing', onPlaying)
            audio.removeEventListener('pause', onPause)
            audio.removeEventListener('waiting', onWaiting)
            audio.removeEventListener('ended', onEnded)
            audio.removeEventListener('error', onError)
        }
    }, [finishSession])

    // Load + play whenever the current track changes (only then – never on unrelated re-renders)
    const loadedId = useRef(null)
    const autoplay = useRef(false)
    useEffect(() => {
        const audio = audioRef.current
        if (!audio || !track || loadedId.current === track._id) return
        if (session.current.trackId && session.current.trackId !== track._id) finishSession('abandoned')
        loadedId.current = track._id
        audio.src = track.url
        audio.currentTime = 0
        setCurrentTime(0)
        setDuration(track.duration || 0)
        beginSession(track)
        if (autoplay.current || status === 'ended') {
            setStatus('loading')
            audio.play().catch((err) => {
                if (err?.name === 'NotAllowedError') { setStatus('paused'); setError('Press play to start the audio.') } else if (err?.name !== 'AbortError') { setStatus('error'); setError('This track could not be played.') }
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [track?._id])

    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return
        audio.volume = volume
        audio.muted = muted
        localStorage.setItem(VOLUME_KEY, String(volume))
    }, [volume, muted])

    useEffect(() => { if (audioRef.current) audioRef.current.loop = loop }, [loop])

    // Close the listening session when the page is left
    useEffect(() => {
        const onHide = () => finishSession('abandoned')
        window.addEventListener('pagehide', onHide)
        return () => window.removeEventListener('pagehide', onHide)
    }, [finishSession])

    const playTrack = useCallback((t, list) => {
        const audio = audioRef.current
        const nextQueue = list?.length ? list : [t]
        const i = Math.max(nextQueue.findIndex((x) => x._id === t._id), 0)
        setError('')
        if (track && track._id === t._id) {
            // Same track: resume (or restart after the end)
            if (status === 'ended') { audio.currentTime = 0; beginSession(t) }
            setQueue(nextQueue)
            setIndex(i)
            setStatus('loading')
            audio.play().catch(() => { setStatus('error'); setError('This track could not be played.') })
            return
        }
        autoplay.current = true
        setQueue(nextQueue)
        setIndex(i)
    }, [track, status, beginSession])

    const pause = useCallback(() => { audioRef.current?.pause() }, [])
    const resume = useCallback(() => {
        const audio = audioRef.current
        if (!audio || !track) return
        if (status === 'error') { audio.load() }
        if (status === 'ended') { audio.currentTime = 0; beginSession(track) }
        setError('')
        setStatus('loading')
        audio.play().catch(() => { setStatus('error'); setError('This track could not be played.') })
    }, [track, status, beginSession])
    const toggle = useCallback(() => (status === 'playing' ? pause() : resume()), [status, pause, resume])

    const step = useCallback((dir) => {
        if (!queue.length) return
        const i = (index + dir + queue.length) % queue.length
        autoplay.current = status === 'playing' || status === 'loading' || status === 'ended'
        if (i === index) { if (audioRef.current) audioRef.current.currentTime = 0; return }
        setIndex(i)
    }, [queue.length, index, status])
    const next = useCallback(() => step(1), [step])
    const previous = useCallback(() => {
        // Like most players: go to the start first, then to the previous track
        if (audioRef.current && audioRef.current.currentTime > 5) { audioRef.current.currentTime = 0; return }
        step(-1)
    }, [step])

    const seek = useCallback((seconds) => {
        const audio = audioRef.current
        if (!audio || !Number.isFinite(seconds)) return
        audio.currentTime = Math.max(0, Math.min(seconds, duration || seconds))
        session.current.lastTime = audio.currentTime
        setCurrentTime(audio.currentTime)
    }, [duration])

    const stop = useCallback(() => {
        const audio = audioRef.current
        finishSession('abandoned')
        if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load() }
        loadedId.current = null
        session.current = { activityId: null, trackId: null, listened: 0, lastTime: 0, finished: true }
        setQueue([]); setIndex(-1); setStatus('idle'); setCurrentTime(0); setDuration(0); setError('')
    }, [finishSession])

    useEffect(() => { stopRef.current = stop }, [stop])

    const setVolume = useCallback((v) => { setVolumeState(Math.max(0, Math.min(1, v))); if (v > 0) setMuted(false) }, [])

    const value = useMemo(() => ({
        track, queue, index, status, error, currentTime, duration, volume, muted, loop,
        isPlaying: status === 'playing', isLoading: status === 'loading',
        playTrack, pause, resume, toggle, next, previous, seek, stop, setVolume,
        toggleMute: () => setMuted((m) => !m), setLoop: setLoopState,
    }), [track, queue, index, status, error, currentTime, duration, volume, muted, loop, playTrack, pause, resume, toggle, next, previous, seek, stop, setVolume])

    return <AudioPlayerContext.Provider value={value}>{children}</AudioPlayerContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAudioPlayer() {
    const ctx = useContext(AudioPlayerContext)
    if (!ctx) throw new Error('useAudioPlayer must be used inside AudioPlayerProvider')
    return ctx
}

// eslint-disable-next-line react-refresh/only-export-components
export const formatClock = (seconds = 0) => {
    const s = Math.max(0, Math.floor(seconds || 0))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = String(s % 60).padStart(2, '0')
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}
