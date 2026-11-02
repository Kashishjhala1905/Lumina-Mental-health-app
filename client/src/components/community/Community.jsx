import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Notice, LoadingState, EmptyState } from "@/components/ui/notice"
import { Heart, MessageCircle, Send, Flag, Trash2, Pencil, Eye, EyeOff, UserRound, Users, X } from "lucide-react"
import api, { errorMessage } from "@/lib/api"
import { useAuth } from "@/context/AuthContext"

const POST_CATEGORIES = ["General", "Stress & Anxiety", "Studies & Work", "Relationships", "Self-care", "Motivation", "Gratitude", "Other"]
const REPORT_REASONS = ["Harassment or bullying", "Harmful or unsafe content", "Shares personal information", "Spam", "Other"]
const TITLE_MAX = 120
const CONTENT_MAX = 1200

const timeAgo = (date) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
    if (seconds < 60) return "Just now"
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return days < 30 ? `${days}d ago` : new Date(date).toLocaleDateString()
}

function SupportPrompt() {
    return (
        <Notice type="warning" title="You don't have to go through this alone">
            If you are in danger or thinking about harming yourself, please call <a className="underline font-semibold" href="tel:112">112</a> now, or Tele-MANAS on <a className="underline font-semibold" href="tel:14416">14416</a> (free, 24×7). <Link to="/emergency" className="underline">More emergency help</Link>
        </Notice>
    )
}

function Avatar({ author }) {
    return (
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-semibold ${author.anonymous ? "bg-muted text-muted-foreground" : "bg-gradient-primary text-white"}`} aria-hidden="true">
            {author.anonymous ? <UserRound className="h-5 w-5" /> : author.initial}
        </div>
    )
}

/** Identity choice – required before publishing; enforced again by the server. */
function IdentityChoice({ value, onChange, name }) {
    const options = [
        { value: "public", label: "Show My Identity", hint: user => `Your name (${user?.name || "your account name"}) appears with the post.`, Icon: Eye },
        { value: "anonymous", label: "Post Anonymously", hint: () => "Shown as “Anonymous User”. Your name, email and account are never shared publicly.", Icon: EyeOff },
    ]
    const { user } = useAuth()
    return (
        <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-foreground mb-2">How would you like your identity to appear?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
                {options.map((option) => { const { value: v, label, hint } = option; const OptionIcon = option.Icon; return (
                    <label key={v} className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors ${value === v ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}>
                        <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="mt-1 accent-primary" />
                        <span>
                            <span className="flex items-center gap-1.5 font-medium text-foreground"><OptionIcon className="h-4 w-4" aria-hidden="true" /> {label}</span>
                            <span className="text-xs text-muted-foreground">{hint(user)}</span>
                        </span>
                    </label>
                ) })}
            </div>
        </fieldset>
    )
}

function PostComposer({ onPublished }) {
    const { user } = useAuth()
    const empty = { title: "", content: "", category: "General", identity: "" }
    const [form, setForm] = useState(empty)
    const [preview, setPreview] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const [done, setDone] = useState(null)

    if (!user) {
        return (
            <Card className="p-6 bg-card/50 backdrop-blur border-border shadow-lg text-sm text-muted-foreground">
                <h3 className="font-semibold text-foreground mb-2">Create a Post</h3>
                <Link to="/login" className="text-primary underline">Sign in</Link> or <Link to="/register" className="text-primary underline">create an account</Link> to share a post. You can choose to post anonymously.
            </Card>
        )
    }

    const valid = form.title.trim() && form.content.trim() && form.content.length <= CONTENT_MAX && form.identity
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
    const publish = async () => {
        setError("")
        if (!form.identity) { setError("Please choose how your identity should appear."); return }
        setBusy(true)
        try {
            const { data } = await api.post("/community/posts", { ...form, title: form.title.trim(), content: form.content.trim() })
            setDone({ supportPrompt: data.supportPrompt, anonymous: form.identity === "anonymous" })
            setForm(empty)
            setPreview(false)
            onPublished(data.data)
        } catch (err) {
            setError(errorMessage(err, "Unable to publish your post."))
        } finally {
            setBusy(false)
        }
    }

    const previewAuthor = form.identity === "anonymous" ? { name: "Anonymous User", initial: "A", anonymous: true } : { name: user.name, initial: user.name.charAt(0).toUpperCase(), anonymous: false }

    return (
        <Card className="p-6 bg-card/50 backdrop-blur border-border shadow-lg space-y-4">
            <h3 className="font-semibold">Create a Post</h3>
            {error && <Notice type="error">{error}</Notice>}
            {done && <Notice type="success">Post published{done.anonymous ? " anonymously" : ""}.</Notice>}
            {done?.supportPrompt && <SupportPrompt />}
            {!preview ? (
                <>
                    <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
                        <label className="space-y-1 text-sm">
                            <span className="font-medium">Title</span>
                            <Input value={form.title} onChange={set("title")} maxLength={TITLE_MAX} placeholder="A short title" className="border-primary/20 bg-background/50" />
                        </label>
                        <label className="space-y-1 text-sm">
                            <span className="font-medium">Category</span>
                            <select value={form.category} onChange={set("category")} className="h-10 w-full rounded-md border border-primary/20 bg-background px-3">
                                {POST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                            </select>
                        </label>
                    </div>
                    <label className="block space-y-1 text-sm">
                        <span className="font-medium">Description</span>
                        <Textarea value={form.content} onChange={set("content")} maxLength={CONTENT_MAX} placeholder="Share an experience, recovery story, or question..." className="border-primary/20 bg-background/50 min-h-[110px]" />
                        <span className={`block text-right text-xs ${form.content.length > CONTENT_MAX - 50 ? "text-amber-600" : "text-muted-foreground"}`}>{form.content.length}/{CONTENT_MAX}</span>
                    </label>
                    <IdentityChoice value={form.identity} onChange={(identity) => setForm({ ...form, identity })} name="new-post-identity" />
                    <p className="text-xs text-muted-foreground">Please don't share phone numbers, emails or other personal details. Posts with abusive language are not published.</p>
                </>
            ) : (
                <div className="rounded-lg border border-dashed border-primary/40 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-primary">Preview – this is how others will see your post</p>
                    <div className="flex items-center gap-3 mb-3">
                        <Avatar author={previewAuthor} />
                        <div>
                            <p className="font-semibold text-foreground">{previewAuthor.name}</p>
                            <p className="text-xs text-muted-foreground">Just now · {form.category}</p>
                        </div>
                    </div>
                    <h4 className="font-semibold text-foreground">{form.title || "(no title)"}</h4>
                    <p className="mt-1 whitespace-pre-wrap text-foreground/90">{form.content || "(empty)"}</p>
                </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setPreview(!preview)} disabled={!form.title.trim() && !form.content.trim()}>
                    {preview ? <><Pencil className="mr-2 h-4 w-4" /> Keep editing</> : <><Eye className="mr-2 h-4 w-4" /> Preview</>}
                </Button>
                <Button onClick={publish} disabled={!valid || busy} className="bg-gradient-primary hover:opacity-90 text-white">
                    <Send className="mr-2 h-4 w-4" /> {busy ? "Publishing..." : "Publish"}
                </Button>
            </div>
        </Card>
    )
}

function CommentForm({ placeholder, onSubmit, small }) {
    const [text, setText] = useState("")
    const [anonymous, setAnonymous] = useState(false)
    const [busy, setBusy] = useState(false)
    const submit = async (e) => {
        e.preventDefault()
        if (!text.trim()) return
        setBusy(true)
        const ok = await onSubmit(text.trim(), anonymous)
        setBusy(false)
        if (ok) setText("")
    }
    return (
        <form onSubmit={submit} className="space-y-1.5">
            <div className="flex gap-2">
                <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={placeholder} aria-label={placeholder} className={`bg-background/70 ${small ? "h-9" : ""}`} />
                <Button type="submit" size={small ? "sm" : "default"} variant="outline" disabled={busy || !text.trim()}>{small ? "Reply" : "Comment"}</Button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="accent-primary" /> {small ? "Reply" : "Comment"} anonymously
            </label>
        </form>
    )
}

function PostCard({ post, onChange, onRemove, setMessage, showStatus }) {
    const { user } = useAuth()
    const [editing, setEditing] = useState(false)
    const [edit, setEdit] = useState({ title: post.title, content: post.content, category: post.category })
    const [reporting, setReporting] = useState(false)
    const [reason, setReason] = useState(REPORT_REASONS[0])
    const [showComments, setShowComments] = useState(false)
    const [supportPrompt, setSupportPrompt] = useState(false)

    const guard = () => { if (!user) { setMessage({ type: "info", text: "Please sign in to take part in the community." }); return false } return true }

    const like = async () => {
        if (!guard()) return
        try {
            const { data } = await api.put(`/community/posts/${post._id}/like`)
            onChange({ ...post, likesCount: data.likesCount, likedByMe: data.liked })
        } catch (err) { setMessage({ type: "error", text: errorMessage(err, "Unable to update like.") }) }
    }
    const saveEdit = async () => {
        try {
            const { data } = await api.patch(`/community/posts/${post._id}`, edit)
            onChange({ ...post, ...data.data, comments: post.comments })
            setEditing(false)
            setSupportPrompt(!!data.supportPrompt)
            setMessage({ type: "success", text: "Post updated." })
        } catch (err) { setMessage({ type: "error", text: errorMessage(err, "Unable to update the post.") }) }
    }
    const remove = async () => {
        if (!window.confirm("Delete this post and its comments? This cannot be undone.")) return
        try {
            await api.delete(`/community/posts/${post._id}`)
            onRemove(post._id)
            setMessage({ type: "success", text: "Post deleted." })
        } catch (err) { setMessage({ type: "error", text: errorMessage(err, "Unable to delete the post.") }) }
    }
    const report = async () => {
        try {
            const { data } = await api.post(`/community/posts/${post._id}/report`, { reason })
            setReporting(false)
            setMessage({ type: "success", text: data.message })
        } catch (err) { setMessage({ type: "error", text: errorMessage(err, "Unable to report the post.") }) }
    }
    const addComment = async (content, anonymous) => {
        if (!guard()) return false
        try {
            const { data } = await api.post(`/community/posts/${post._id}/comments`, { content, anonymous })
            onChange({ ...post, comments: [...(post.comments || []), data.data], commentsCount: post.commentsCount + 1 })
            if (data.supportPrompt) setSupportPrompt(true)
            return true
        } catch (err) { setMessage({ type: "error", text: errorMessage(err, "Unable to add comment.") }); return false }
    }
    const addReply = async (commentId, content, anonymous) => {
        if (!guard()) return false
        try {
            const { data } = await api.post(`/community/comments/${commentId}/replies`, { content, anonymous })
            onChange({ ...post, commentsCount: post.commentsCount + 1, comments: post.comments.map((c) => c._id === commentId ? { ...c, replies: [...(c.replies || []), data.data] } : c) })
            if (data.supportPrompt) setSupportPrompt(true)
            return true
        } catch (err) { setMessage({ type: "error", text: errorMessage(err, "Unable to add reply.") }); return false }
    }
    const deleteComment = async (commentId) => {
        try {
            await api.delete(`/community/comments/${commentId}`)
            onChange({ ...post, comments: post.comments.filter((c) => c._id !== commentId), commentsCount: Math.max(post.commentsCount - 1, 0) })
        } catch (err) { setMessage({ type: "error", text: errorMessage(err, "Unable to delete comment.") }) }
    }

    const status = post.status && post.status !== "published" ? post.status : null
    return (
        <Card className="p-6 border-border bg-card/30 hover:bg-card/50 transition-colors" data-post-id={post._id}>
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                    <Avatar author={post.author} />
                    <div>
                        <p className="font-semibold text-foreground">{post.author.name}{post.isMine && <span className="ml-2 text-xs font-normal text-primary">(you)</span>}</p>
                        <p className="text-xs text-muted-foreground">{timeAgo(post.createdAt)}{post.editedAt ? " · edited" : ""}</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{post.category}</span>
                    {showStatus && status && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">{status === "hidden" ? "Hidden – under review" : "Removed by a moderator"}</span>}
                </div>
            </div>
            {showStatus && status === "removed" && post.moderationNote && <p className="mb-3 text-xs text-muted-foreground">Moderator note: {post.moderationNote}</p>}

            {editing ? (
                <div className="space-y-3 mb-4">
                    <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} maxLength={TITLE_MAX} aria-label="Title" />
                    <Textarea value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} maxLength={CONTENT_MAX} aria-label="Description" className="min-h-[100px]" />
                    <select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} className="h-10 rounded-md border border-primary/20 bg-background px-3 text-sm" aria-label="Category">
                        {POST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                    <div className="flex gap-2">
                        <Button size="sm" onClick={saveEdit} disabled={!edit.title.trim() || !edit.content.trim()}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                    </div>
                </div>
            ) : (
                <>
                    {post.title && <h3 className="font-semibold text-lg text-foreground mb-1">{post.title}</h3>}
                    <p className="text-foreground/90 mb-5 leading-relaxed whitespace-pre-wrap">{post.content}</p>
                </>
            )}
            {supportPrompt && <div className="mb-4"><SupportPrompt /></div>}

            <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-border">
                <button onClick={like} aria-pressed={!!post.likedByMe} className={`flex items-center gap-2 text-sm transition-colors ${post.likedByMe ? "text-pink-500" : "text-muted-foreground hover:text-pink-500"}`}>
                    <Heart className={`w-4 h-4 ${post.likedByMe ? "fill-current" : ""}`} /> {post.likesCount}<span className="sr-only"> likes</span>
                </button>
                <button onClick={() => setShowComments(!showComments)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary" aria-expanded={showComments}>
                    <MessageCircle className="w-4 h-4" /> {post.commentsCount}<span className="sr-only"> comments</span>
                </button>
                <div className="ml-auto flex items-center gap-1">
                    {post.isMine && status !== "removed" && !editing && <Button variant="ghost" size="sm" onClick={() => setEditing(true)}><Pencil className="mr-1 h-4 w-4" /> Edit</Button>}
                    {post.isMine && <Button variant="ghost" size="sm" onClick={remove} className="hover:text-destructive"><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>}
                    {!post.isMine && !showStatus && (
                        <Button variant="ghost" size="sm" onClick={() => guard() && setReporting(!reporting)}><Flag className="mr-1 h-4 w-4" /> Report</Button>
                    )}
                </div>
            </div>
            {reporting && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-3 text-sm">
                    <label htmlFor={`reason-${post._id}`}>Reason</label>
                    <select id={`reason-${post._id}`} value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2">
                        {REPORT_REASONS.map((r) => <option key={r}>{r}</option>)}
                    </select>
                    <Button size="sm" onClick={report}>Submit report</Button>
                    <Button size="sm" variant="ghost" onClick={() => setReporting(false)} aria-label="Cancel report"><X className="h-4 w-4" /></Button>
                </div>
            )}

            {showComments && !showStatus && (
                <div className="mt-5 space-y-4">
                    {(post.comments || []).map((comment) => (
                        <div key={comment._id} className="rounded-lg bg-muted/40 p-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium">{comment.author.name}{comment.isMine && <span className="ml-1 text-xs font-normal text-primary">(you)</span>}</p>
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{comment.content}</p>
                                </div>
                                {comment.isMine && (
                                    <button onClick={() => deleteComment(comment._id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete comment"><Trash2 className="h-4 w-4" /></button>
                                )}
                            </div>
                            <div className="ml-4 mt-3 space-y-2 border-l border-border pl-3">
                                {(comment.replies || []).map((reply) => (
                                    <p key={reply._id} className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{reply.author.name}:</span> {reply.content}</p>
                                ))}
                                {user && <CommentForm small placeholder="Reply..." onSubmit={(content, anonymous) => addReply(comment._id, content, anonymous)} />}
                            </div>
                        </div>
                    ))}
                    {user ? <CommentForm placeholder="Add a supportive comment..." onSubmit={addComment} /> : <p className="text-sm text-muted-foreground"><Link to="/login" className="text-primary underline">Sign in</Link> to comment.</p>}
                </div>
            )}
        </Card>
    )
}

export default function CommunityComponent() {
    const { user } = useAuth()
    const [view, setView] = useState("all") // all | mine
    const [feed, setFeed] = useState("latest")
    const [category, setCategory] = useState("")
    const [posts, setPosts] = useState([])
    const [page, setPage] = useState(1)
    const [pages, setPages] = useState(1)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState("")
    const [message, setMessage] = useState(null)

    const load = useCallback(async (nextPage = 1) => {
        setLoading(true)
        setLoadError("")
        try {
            const params = new URLSearchParams({ page: String(nextPage), limit: "10" })
            if (view === "all") { params.set("feed", feed); if (category) params.set("category", category) }
            const { data } = await api.get(view === "mine" ? `/community/posts/mine?${params}` : `/community/posts?${params}`)
            setPosts((prev) => (nextPage === 1 ? data.data : [...prev, ...data.data]))
            setPage(nextPage)
            setPages(data.pagination?.pages || 1)
        } catch (err) {
            setLoadError(errorMessage(err, "The community feed is unavailable right now."))
        } finally {
            setLoading(false)
        }
    }, [view, feed, category])
    useEffect(() => { load(1) }, [load])
    useEffect(() => { if (!user && view === "mine") setView("all") }, [user, view])

    const update = (p) => setPosts((list) => list.map((x) => (x._id === p._id ? p : x)))
    const removeOne = (id) => setPosts((list) => list.filter((x) => x._id !== id))

    return (
        <div className="space-y-8">
            <PostComposer onPublished={(p) => { if (view === "mine" || !category || category === p.category) setPosts((list) => [p, ...list]) }} />

            {message && <Notice type={message.type}>{message.text}</Notice>}

            <div className="space-y-3">
                {user && (
                    <Tabs value={view} onValueChange={setView}>
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="all"><Users className="mr-2 h-4 w-4" /> Community posts</TabsTrigger>
                            <TabsTrigger value="mine"><UserRound className="mr-2 h-4 w-4" /> My posts</TabsTrigger>
                        </TabsList>
                    </Tabs>
                )}
                {view === "all" && (
                    <>
                        <Tabs value={feed} onValueChange={setFeed}>
                            <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="latest">Latest</TabsTrigger>
                                <TabsTrigger value="most-liked">Most liked</TabsTrigger>
                                <TabsTrigger value="trending">Trending</TabsTrigger>
                            </TabsList>
                        </Tabs>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
                            {["", ...POST_CATEGORIES].map((c) => (
                                <button key={c || "all"} onClick={() => setCategory(c)} aria-pressed={category === c}
                                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${category === c ? "border-transparent bg-gradient-primary text-white" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                                    {c || "All"}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {loadError && <Notice type="error">{loadError}</Notice>}
            {loading && posts.length === 0 ? (
                <LoadingState label="Loading posts..." />
            ) : posts.length === 0 && !loadError ? (
                <EmptyState icon={MessageCircle} title={view === "mine" ? "You haven't posted yet" : "No posts here yet"}>
                    {view === "mine" ? "Your posts – including anonymous ones – will appear here." : "Be the first to share something supportive."}
                </EmptyState>
            ) : (
                <div className="space-y-4">
                    {posts.map((post) => <PostCard key={post._id} post={post} onChange={update} onRemove={removeOne} setMessage={setMessage} showStatus={view === "mine"} />)}
                    {page < pages && (
                        <div className="text-center"><Button variant="outline" onClick={() => load(page + 1)} disabled={loading}>{loading ? "Loading..." : "Load more"}</Button></div>
                    )}
                </div>
            )}
        </div>
    )
}
