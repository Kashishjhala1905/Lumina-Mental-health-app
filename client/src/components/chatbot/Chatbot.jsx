import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Send, Loader, Bot, AlertCircle, MessageSquarePlus, Trash2, Lock } from "lucide-react"
import api, { errorMessage } from "@/lib/api"
import { useAuth } from "@/context/AuthContext"

const GREETING = { role: "assistant", content: "Hello! I'm Lumina, Your mental Health Companion😊 How can I help you today?" }
const quickSuggestions = ["I'm feeling anxious", "How do I manage stress?", "I'm having trouble sleeping", "Tell me about mindfulness"]
const shortDate = (d) => new Date(d).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })

/** Saved conversations of the signed-in user (owner-only on the server). */
function ConversationList({ items, activeId, onOpen, onNew, onDelete, loading }) {
    return (
        <Card className="p-3 bg-card/50 backdrop-blur border-border md:h-[500px] flex flex-col">
            <Button onClick={onNew} className="mb-3 w-full bg-gradient-primary text-white hover:opacity-90 gap-2"><MessageSquarePlus className="h-4 w-4" /> New chat</Button>
            <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your conversations</p>
            <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar max-h-60 md:max-h-none">
                {loading && <p className="px-2 py-3 text-sm text-muted-foreground">Loading…</p>}
                {!loading && items.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">No saved conversations yet. Your chats are saved here automatically.</p>}
                {items.map((c) => (
                    <div key={c._id} className={`group flex items-center gap-1 rounded-lg ${c._id === activeId ? "bg-primary/10" : "hover:bg-muted"}`}>
                        <button onClick={() => onOpen(c._id)} className="min-w-0 flex-1 px-2 py-2 text-left" aria-current={c._id === activeId ? "true" : undefined}>
                            <p className="truncate text-sm font-medium text-foreground">{c.title}</p>
                            <p className="text-xs text-muted-foreground">{shortDate(c.lastMessageAt || c.updatedAt)} · {c.messageCount} messages</p>
                        </button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 opacity-60 hover:opacity-100" onClick={() => onDelete(c)} aria-label={`Delete conversation ${c.title}`}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                ))}
            </div>
        </Card>
    )
}

export default function ChatbotComponent() {
    const { user } = useAuth()
    const [params, setParams] = useSearchParams()
    const activeId = user ? params.get("c") : null
    const [messages, setMessages] = useState([GREETING])
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState(null)
    const [conversations, setConversations] = useState([])
    const [listLoading, setListLoading] = useState(false)
    const [opening, setOpening] = useState(false)
    const scroller = useRef(null)

    const loadList = useCallback(async () => {
        if (!user) return
        setListLoading(true)
        try {
            const { data } = await api.get("/chatbot/conversations?limit=50")
            setConversations(data.data || [])
        } catch { /* list is optional */ } finally { setListLoading(false) }
    }, [user])
    useEffect(() => { loadList() }, [loadList])

    // Open a saved conversation (?c=<id>) – only the owner can load it
    useEffect(() => {
        if (!activeId) { setMessages([GREETING]); return }
        let cancelled = false
        setOpening(true)
        setError(null)
        api.get(`/chatbot/conversations/${activeId}`)
            .then(({ data }) => { if (!cancelled) setMessages([GREETING, ...data.data.messages]) })
            .catch((err) => { if (!cancelled) { setError(errorMessage(err, "This conversation could not be opened.")); setMessages([GREETING]) } })
            .finally(() => { if (!cancelled) setOpening(false) })
        return () => { cancelled = true }
    }, [activeId])

    useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }) }, [messages, isLoading])

    const handleSendMessage = async (text) => {
        if (!text.trim() || isLoading) return
        const userMessage = text.trim()
        setMessages((prev) => [...prev, { role: "user", content: userMessage }])
        setInput("")
        setIsLoading(true)
        setError(null)
        try {
            if (user) {
                // Signed in: the message is stored in the user's own conversation (encrypted at rest)
                let id = activeId
                if (!id) {
                    const { data } = await api.post("/chatbot/conversations", {})
                    id = data.data._id
                    setParams({ c: id }, { replace: true })
                }
                try {
                    const { data } = await api.post(`/chatbot/conversations/${id}/messages`, { message: userMessage })
                    setMessages((prev) => [...prev, { role: "assistant", content: data.message }])
                } catch (err) {
                    const saved = err.response?.data?.data?.userMessageSaved
                    throw Object.assign(err, { savedNote: saved ? " Your message was saved – you can try again later." : "" })
                } finally {
                    loadList()
                }
            } else {
                const conversationHistory = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }))
                const { data } = await api.post("/chatbot/message", { message: userMessage, conversationHistory })
                if (!data.success) throw new Error(data.message || "Failed to get response")
                setMessages((prev) => [...prev, { role: "assistant", content: data.message }])
            }
        } catch (err) {
            setError(errorMessage(err, "Failed to get AI response. Please try again.") + (err.savedNote || ""))
            setMessages((prev) => [...prev, { role: "assistant", content: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment." }])
        } finally {
            setIsLoading(false)
        }
    }

    const newChat = () => { setParams({}); setMessages([GREETING]); setError(null) }
    const openChat = (id) => setParams({ c: id })
    const deleteChat = async (c) => {
        if (!window.confirm(`Delete "${c.title}"? This removes the conversation permanently.`)) return
        try {
            await api.delete(`/chatbot/conversations/${c._id}`)
            if (c._id === activeId) newChat()
            loadList()
        } catch (err) { setError(errorMessage(err, "Could not delete the conversation.")) }
    }

    const chat = (
        <div className="space-y-6 min-w-0">
            {error && (
                <div role="alert" className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}
            <Card className="h-[500px] flex flex-col p-6 bg-card/50 backdrop-blur border-border shadow-xl">
                <div ref={scroller} className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar" aria-live="polite">
                    {opening && <p className="text-sm text-muted-foreground">Opening conversation…</p>}
                    {messages.map((msg, i) => (
                        <div key={msg._id || i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`flex items-end gap-2 max-w-[80%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                                {msg.role === "assistant" && (
                                    <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center shrink-0">
                                        <Bot className="w-4 h-4 text-white" />
                                    </div>
                                )}
                                <div className={`px-4 py-3 rounded-2xl whitespace-pre-wrap ${msg.role === "user" ? "bg-gradient-primary text-white rounded-br-none" : "bg-muted text-foreground rounded-bl-none"}`}>
                                    {msg.content}
                                </div>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="flex items-end gap-2">
                                <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center shrink-0"><Bot className="w-4 h-4 text-white" /></div>
                                <div className="bg-muted text-foreground px-4 py-3 rounded-2xl rounded-bl-none flex gap-2 items-center">
                                    <Loader className="w-4 h-4 animate-spin" />
                                    <span className="text-sm">Thinking...</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </Card>

            <div className="grid grid-cols-2 gap-3">
                {quickSuggestions.map((suggestion) => (
                    <Button key={suggestion} variant="outline" size="sm" onClick={() => handleSendMessage(suggestion)} className="text-left justify-start h-auto py-3 px-4 text-sm hover:border-primary/50 transition-colors">
                        {suggestion}
                    </Button>
                ))}
            </div>

            <form className="flex gap-3" onSubmit={(e) => { e.preventDefault(); handleSendMessage(input) }}>
                <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your message..." disabled={isLoading} maxLength={2000} aria-label="Message" className="h-12 border-border focus-visible:ring-primary/50" />
                <Button type="submit" disabled={isLoading} aria-label="Send message" className="h-12 w-12 rounded-xl bg-gradient-primary hover:opacity-90"><Send className="w-5 h-5" /></Button>
            </form>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" aria-hidden="true" />
                {user ? "Your conversations are private to your account and stored encrypted. Counselors and administrators cannot read them." : <>Guest chats are not saved. <Link to="/login" className="underline">Sign in</Link> to keep and continue your conversations.</>}
            </p>
        </div>
    )

    if (!user) return chat
    return (
        <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
            <ConversationList items={conversations} activeId={activeId} onOpen={openChat} onNew={newChat} onDelete={deleteChat} loading={listLoading} />
            {chat}
        </div>
    )
}

