import { useCallback, useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Notice, LoadingState, EmptyState } from "@/components/ui/notice"
import { Search, Play, Pause, BookOpen, Clock, Music2, Loader2, ChevronDown, ChevronUp, Dumbbell } from "lucide-react"
import api, { errorMessage } from "@/lib/api"
import { useAuth } from "@/context/AuthContext"
import { useAudioPlayer, formatClock } from "@/context/AudioPlayerContext"
import { FullPlayer } from "@/components/audio/Player"
import ExerciseSession from "./ExerciseSession"
import { ExerciseIcon } from "./exerciseIcons"
import { strategies } from "./strategies"

const DIFFICULTY_STYLE = {
    Beginner: "bg-green-500/15 text-green-700 dark:text-green-300",
    Intermediate: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    Advanced: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
}

/** Keeps the first item for every id/slug, so a list can never show the same exercise twice. */
const uniqueBy = (items) => {
    const seen = new Set()
    return items.filter((i) => {
        const key = i.slug || i._id
        if (seen.has(key) || seen.has(i._id)) return false
        seen.add(key); seen.add(i._id)
        return true
    })
}

function CategoryChips({ categories, value, onChange, label }) {
    return (
        <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
            {["", ...categories].map((c) => (
                <button key={c || "all"} type="button" onClick={() => onChange(c)} aria-pressed={value === c}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${value === c ? "border-transparent bg-gradient-primary text-white" : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}>
                    {c || "All"}
                </button>
            ))}
        </div>
    )
}

function useCatalogue(path) {
    const [state, setState] = useState({ loading: true, error: "", items: [], categories: [] })
    const load = useCallback(() => {
        setState((s) => ({ ...s, loading: true, error: "" }))
        api.get(path)
            .then(({ data }) => setState({ loading: false, error: "", items: uniqueBy(data.data || []), categories: data.categories || [] }))
            .catch((err) => setState({ loading: false, error: errorMessage(err, "Could not load this list."), items: [], categories: [] }))
    }, [path])
    useEffect(() => { load() }, [load])
    return { ...state, reload: load }
}

function MeditationTab({ search }) {
    const player = useAudioPlayer()
    const { loading, error, items, categories, reload } = useCatalogue("/resources/meditations")
    const [category, setCategory] = useState("")
    const visible = items.filter((t) => (!category || t.category === category) && `${t.title} ${t.description} ${t.category}`.toLowerCase().includes(search))

    return (
        <div className="space-y-6">
            <FullPlayer />
            {loading ? <LoadingState label="Loading tracks..." /> : error ? (
                <Notice type="error">{error} <Button size="sm" variant="outline" className="ml-2" onClick={reload}>Try again</Button></Notice>
            ) : (
                <>
                    <CategoryChips categories={categories} value={category} onChange={setCategory} label="Meditation categories" />
                    {visible.length === 0 ? <EmptyState icon={Music2} title="No tracks match your search" /> : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {visible.map((t) => {
                                const current = player.track?._id === t._id
                                const playing = current && player.isPlaying
                                const busy = current && player.isLoading
                                return (
                                    <Card key={t._id} className={`p-6 hover:shadow-lg transition-all duration-300 border-border hover:border-primary/50 bg-card/50 backdrop-blur group ${current ? "border-primary ring-1 ring-primary/40" : ""}`} data-track={t.slug}>
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-primary mb-1">
                                                    {t.category}
                                                    {t.isShortLoop && <span className="rounded-full bg-muted px-2 py-0.5 font-normal text-muted-foreground">Short loop</span>}
                                                    {current && <span className="rounded-full bg-primary/10 px-2 py-0.5">{playing ? "Now playing" : busy ? "Loading…" : "Paused"}</span>}
                                                </div>
                                                <h3 className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">{t.title}</h3>
                                                <p className="text-sm text-muted-foreground mb-3">{t.description}</p>
                                                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary"><Clock className="w-3 h-3" />{formatClock(t.duration)}</span>
                                            </div>
                                            <Button size="icon" onClick={() => (current ? player.toggle() : player.playTrack(t, visible))}
                                                className="rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors shrink-0"
                                                aria-label={`${playing ? "Pause" : "Play"} ${t.title}`}>
                                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                                            </Button>
                                        </div>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground">All tracks are original audio created for Lumina (no third-party or copyrighted music). Audio keeps playing while you browse other pages.</p>
                </>
            )}
        </div>
    )
}

function ExercisesTab({ search }) {
    const { loading, error, items, categories, reload } = useCatalogue("/resources/exercises")
    const [category, setCategory] = useState("")
    const [active, setActive] = useState(null)
    const visible = items.filter((e) => (!category || e.category === category) && `${e.title} ${e.description} ${e.category}`.toLowerCase().includes(search))

    if (loading) return <LoadingState label="Loading exercises..." />
    if (error) return <Notice type="error">{error} <Button size="sm" variant="outline" className="ml-2" onClick={reload}>Try again</Button></Notice>
    return (
        <div className="space-y-6">
            <CategoryChips categories={categories} value={category} onChange={setCategory} label="Exercise categories" />
            {visible.length === 0 ? <EmptyState icon={Dumbbell} title="No exercises match your search" /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {visible.map((e) => (
                        <Card key={e._id} data-exercise={e.slug} className="p-6 hover:shadow-lg transition-all duration-300 border-border hover:border-primary/50 bg-card/50 backdrop-blur group flex flex-col">
                            <div className="flex items-start gap-3">
                                <div className="rounded-lg bg-primary/10 p-2 text-primary group-hover:bg-primary group-hover:text-white transition-colors"><ExerciseIcon name={e.icon} className="h-5 w-5" /></div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-primary">{e.category}</p>
                                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{e.title}</h3>
                                </div>
                            </div>
                            <p className="mt-3 text-sm text-muted-foreground">{e.description}</p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-primary"><Clock className="h-3 w-3" />{formatClock(e.duration)}</span>
                                <span className={`rounded-full px-2 py-1 ${DIFFICULTY_STYLE[e.difficulty] || "bg-muted"}`}>{e.difficulty}</span>
                                <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">{e.instructions.length} steps</span>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => setActive(e)} className="mt-4 w-full group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all">Start Exercise</Button>
                        </Card>
                    ))}
                </div>
            )}
            {active && <ExerciseSession key={active._id} exercise={active} onClose={() => setActive(null)} />}
        </div>
    )
}

function StrategiesTab({ search }) {
    const { user } = useAuth()
    const [open, setOpen] = useState({})
    const visible = useMemo(() => strategies.filter((s) => `${s.title} ${s.description}`.toLowerCase().includes(search)), [search])
    const toggle = (s) => {
        const willOpen = !open[s.slug]
        setOpen({ ...open, [s.slug]: willOpen })
        // Record that the guide was read (one record per guide per day on the server)
        if (willOpen && user) api.post("/resources/activity", { resourceType: "strategy", resourceKey: s.slug, title: s.title }).catch(() => {})
    }
    if (!visible.length) return <EmptyState icon={BookOpen} title="No guides match your search" />
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {visible.map((item) => (
                <Card key={item.slug} className="p-6 hover:shadow-lg transition-all duration-300 border-border hover:border-primary/50 bg-card/50 backdrop-blur group">
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors"><BookOpen className="w-5 h-5" /></div>
                        <div className="min-w-0 flex-1 space-y-3">
                            <div>
                                <h3 className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">{item.title}</h3>
                                <p className="text-sm text-muted-foreground">{item.description}</p>
                            </div>
                            <Button variant="ghost" size="sm" className="-ml-2 text-primary" onClick={() => toggle(item)} aria-expanded={!!open[item.slug]}>
                                {open[item.slug] ? <><ChevronUp className="mr-1 h-4 w-4" /> Hide guide</> : <><ChevronDown className="mr-1 h-4 w-4" /> Open guide</>}
                            </Button>
                            {open[item.slug] && (
                                <>
                                    <div>
                                        <p className="text-xs font-semibold uppercase text-primary mb-2">Action steps</p>
                                        <ul className="space-y-1 text-sm text-muted-foreground">{item.steps.map((step) => <li key={step}>- {step}</li>)}</ul>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                        {item.checklist.map((entry) => (
                                            <label key={entry} className="flex items-center gap-2 text-muted-foreground">
                                                <input type="checkbox" className="h-4 w-4 rounded border-primary/30 accent-primary" /> {entry}
                                            </label>
                                        ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground">{item.tips.join(" ")}</p>
                                </>
                            )}
                        </div>
                    </div>
                </Card>
            ))}
        </div>
    )
}

export default function ResourcesComponent() {
    const [searchTerm, setSearchTerm] = useState("")
    const search = searchTerm.trim().toLowerCase()
    return (
        <div className="space-y-8">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search resources..." aria-label="Search resources" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 h-12 border-primary/20 bg-card/50 backdrop-blur focus-visible:ring-primary/50" />
            </div>
            <Tabs defaultValue="meditation" className="w-full">
                <TabsList className="grid w-full grid-cols-3 h-12 bg-muted/50 p-1 rounded-xl">
                    <TabsTrigger value="meditation" className="rounded-lg data-[state=active]:bg-gradient-primary data-[state=active]:text-white">Meditation</TabsTrigger>
                    <TabsTrigger value="exercises" className="rounded-lg data-[state=active]:bg-gradient-primary data-[state=active]:text-white">Exercises</TabsTrigger>
                    <TabsTrigger value="strategies" className="rounded-lg data-[state=active]:bg-gradient-primary data-[state=active]:text-white">Strategies</TabsTrigger>
                </TabsList>
                <TabsContent value="meditation" className="mt-6"><MeditationTab search={search} /></TabsContent>
                <TabsContent value="exercises" className="mt-6"><ExercisesTab search={search} /></TabsContent>
                <TabsContent value="strategies" className="mt-6"><StrategiesTab search={search} /></TabsContent>
            </Tabs>
        </div>
    )
}
