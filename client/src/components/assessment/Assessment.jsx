import { useCallback, useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Notice, LoadingState } from "@/components/ui/notice"
import { ArrowDownRight, ArrowLeft, ArrowUpRight, CheckCircle2, History, Minus, RefreshCw } from "lucide-react"
import api, { errorMessage } from "@/lib/api"
import { useAuth } from "@/context/AuthContext"

// Questions and scoring come from the server (one source of truth; stress & anxiety are reverse-scored there)
const FALLBACK = {
    scale: { min: 1, max: 5, minLabel: "Not at all", maxLabel: "Very much" },
    questions: [
        { id: "stress", text: "How often do you feel overwhelmed by stress?" },
        { id: "sleep", text: "How is your sleep quality?" },
        { id: "support", text: "Do you feel connected to your support network?" },
        { id: "anxiety", text: "How often do you experience anxiety?" },
        { id: "satisfaction", text: "Rate your overall life satisfaction" },
        { id: "emotions", text: "How well do you manage emotions?" },
        { id: "coping", text: "Do you have healthy coping mechanisms?" },
        { id: "selfcare", text: "How often do you practice self-care?" },
    ],
}

const fmtDate = (d) => new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })

function Change({ value }) {
    if (value > 0) return <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400"><ArrowUpRight className="h-4 w-4" /> +{value} points</span>
    if (value < 0) return <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><ArrowDownRight className="h-4 w-4" /> {value} points</span>
    return <span className="inline-flex items-center gap-1 text-muted-foreground"><Minus className="h-4 w-4" /> No change</span>
}

/** Result view – used right after submitting and when revisiting a saved assessment. */
export function AssessmentResult({ result, comparison, saved, onRetake }) {
    const { user } = useAuth()
    return (
        <Card className="p-8 text-center bg-card/50 backdrop-blur border-border shadow-xl">
            <div className="w-20 h-20 mx-auto bg-gradient-primary rounded-full flex items-center justify-center mb-6 animate-float">
                <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-foreground mb-2">Assessment {onRetake ? "Complete" : "Result"}</h2>
            <p className="text-muted-foreground mb-8">{result.completedAt ? `Completed ${fmtDate(result.completedAt)}` : "Here's your wellness summary"}</p>

            <div className="bg-muted/50 rounded-2xl p-8 mb-6 border border-border">
                <p className="text-sm text-muted-foreground mb-2 uppercase tracking-wider font-semibold">Overall Status</p>
                <p className="text-5xl font-bold gradient-text mb-2">{result.result}</p>
                <p className="text-lg font-semibold text-foreground mb-4">Wellbeing score: {result.score}/100</p>
                {comparison && (
                    <p className="text-sm mb-4">
                        Compared with your previous assessment ({comparison.previousScore}/100, {fmtDate(comparison.previousCompletedAt)}): <Change value={comparison.change} />
                    </p>
                )}
                <ul className="mx-auto max-w-xl space-y-2 text-left text-sm text-muted-foreground">
                    {(result.recommendations || []).map((r) => <li key={r} className="flex gap-2"><span className="text-primary">•</span>{r}</li>)}
                </ul>
            </div>

            {result.answers?.length > 0 && (
                <details className="mb-6 text-left">
                    <summary className="cursor-pointer text-sm font-medium text-primary">Your answers</summary>
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                        {result.answers.map((a) => (
                            <li key={a.questionId} className="rounded-lg border border-border p-3 text-sm">
                                <p className="text-muted-foreground">{a.question}</p>
                                <p className="font-semibold text-foreground">{a.value} / 5</p>
                            </li>
                        ))}
                    </ul>
                </details>
            )}

            {saved === false && !user && (
                <Notice type="info" className="mb-6 justify-center">Sign in before taking the assessment to save results and see your progress over time.</Notice>
            )}
            <div className="flex flex-wrap justify-center gap-3">
                {onRetake && <Button onClick={onRetake} size="lg" className="gap-2"><RefreshCw className="w-4 h-4" /> Retake Assessment</Button>}
                {user && <Button asChild size="lg" variant="outline" className="gap-2"><Link to="/history?section=assessments"><History className="w-4 h-4" /> Assessment history</Link></Button>}
            </div>
        </Card>
    )
}

export default function AssessmentComponent() {
    const { user } = useAuth()
    const [params, setParams] = useSearchParams()
    const resultId = params.get("result")
    const [definition, setDefinition] = useState(null)
    const [current, setCurrent] = useState(0)
    const [answers, setAnswers] = useState({})
    const [submitting, setSubmitting] = useState(false)
    const [outcome, setOutcome] = useState(null) // { result, comparison, saved }
    const [error, setError] = useState("")
    const [viewing, setViewing] = useState({ loading: false, data: null, error: "" })

    useEffect(() => {
        api.get("/assessments/definition").then(({ data }) => setDefinition(data.data)).catch(() => setDefinition(FALLBACK))
    }, [])

    // Revisit a saved result: /assessment?result=<id>
    useEffect(() => {
        if (!resultId) { setViewing({ loading: false, data: null, error: "" }); return }
        if (!user) return
        setViewing({ loading: true, data: null, error: "" })
        api.get(`/assessments/history/${resultId}`)
            .then(({ data }) => setViewing({
                loading: false,
                data: { result: data.data, comparison: data.previous ? { previousScore: data.previous.score, previousCompletedAt: data.previous.completedAt, change: data.data.score - data.previous.score } : null },
                error: "",
            }))
            .catch((err) => setViewing({ loading: false, data: null, error: errorMessage(err, "This assessment could not be loaded.") }))
    }, [resultId, user])

    const submit = useCallback(async (finalAnswers) => {
        setSubmitting(true)
        setError("")
        try {
            const { data } = await api.post("/assessments", { answers: finalAnswers })
            setOutcome({ result: data.data, comparison: data.comparison || null, saved: data.saved })
        } catch (err) {
            setError(errorMessage(err, "We could not score your assessment. Please try again."))
        } finally {
            setSubmitting(false)
        }
    }, [])

    const retake = () => { setCurrent(0); setAnswers({}); setOutcome(null); setError("") }

    if (resultId) {
        if (!user) return <Notice type="info">Please <Link to="/login" className="underline">sign in</Link> to view your saved assessments.</Notice>
        if (viewing.loading) return <LoadingState label="Loading your assessment..." />
        if (viewing.error) return <Notice type="error">{viewing.error}</Notice>
        if (viewing.data) {
            return (
                <div className="space-y-4">
                    <Button variant="ghost" onClick={() => setParams({})} className="gap-2"><ArrowLeft className="h-4 w-4" /> Take a new assessment</Button>
                    <AssessmentResult result={viewing.data.result} comparison={viewing.data.comparison} saved />
                </div>
            )
        }
    }

    if (outcome) return <AssessmentResult {...outcome} onRetake={retake} />
    if (!definition) return <LoadingState label="Loading questions..." />

    const { questions, scale } = definition
    const question = questions[current]
    const progress = ((current + 1) / questions.length) * 100

    const handleAnswer = (score) => {
        const next = { ...answers, [question.id]: score }
        setAnswers(next)
        if (current < questions.length - 1) setCurrent(current + 1)
        else submit(next)
    }

    return (
        <Card className="p-8 bg-card/50 backdrop-blur border-border shadow-xl">
            {!user && <Notice type="info" className="mb-6">You can take the assessment as a guest. <Link to="/login" className="underline">Sign in</Link> to save your results and track changes over time.</Notice>}
            {error && <Notice type="error" className="mb-6">{error}</Notice>}
            <div className="mb-8">
                <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-medium text-muted-foreground">Question {current + 1} of {questions.length}</span>
                    <span className="text-sm font-bold text-primary">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-3" />
            </div>

            <div className="min-h-[120px] mb-8">
                <h3 className="text-2xl md:text-3xl font-bold text-foreground leading-tight">{question.text}</h3>
            </div>

            <div className="grid grid-cols-5 gap-3" role="group" aria-label="Your answer">
                {[1, 2, 3, 4, 5].map((score) => (
                    <Button
                        key={score}
                        onClick={() => handleAnswer(score)}
                        disabled={submitting}
                        variant="outline"
                        aria-pressed={answers[question.id] === score}
                        className={`h-16 text-xl font-bold hover:bg-gradient-primary hover:text-white hover:border-transparent transition-all duration-300 ${answers[question.id] === score ? "border-primary" : ""}`}
                    >
                        {score}
                    </Button>
                ))}
            </div>

            <div className="flex justify-between mt-4 px-2">
                <span className="text-xs text-muted-foreground">{scale.minLabel}</span>
                <span className="text-xs text-muted-foreground">{scale.maxLabel}</span>
            </div>
            <div className="mt-6 flex justify-between">
                <Button variant="ghost" size="sm" disabled={current === 0 || submitting} onClick={() => setCurrent(current - 1)}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
                {submitting && <span className="text-sm text-muted-foreground">Calculating your result…</span>}
            </div>
        </Card>
    )
}
