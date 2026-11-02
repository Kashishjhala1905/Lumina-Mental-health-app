import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Bell, CheckCheck } from "lucide-react"
import api from "@/lib/api"
import { useAuth } from "@/context/AuthContext"
import { cn } from "@/lib/utils"

const POLL_MS = 60000

export default function NotificationBell() {
    const { user } = useAuth()
    const [open, setOpen] = useState(false)
    const [items, setItems] = useState([])
    const [unread, setUnread] = useState(0)
    const [error, setError] = useState("")
    const ref = useRef(null)
    const navigate = useNavigate()

    const load = useCallback(async () => {
        try {
            const { data } = await api.get("/notifications?limit=15")
            setItems(data.data)
            setUnread(data.unreadCount)
            setError("")
        } catch {
            setError("Could not load notifications")
        }
    }, [])

    useEffect(() => {
        if (!user) return undefined
        load()
        const timer = setInterval(() => { if (document.visibilityState === "visible") load() }, POLL_MS)
        return () => clearInterval(timer)
    }, [user, load])

    useEffect(() => {
        const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
        const onKey = (e) => { if (e.key === "Escape") setOpen(false) }
        document.addEventListener("mousedown", onClick)
        document.addEventListener("keydown", onKey)
        return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey) }
    }, [])

    if (!user) return null

    const openItem = async (n) => {
        setOpen(false)
        if (!n.read) {
            api.patch(`/notifications/${n._id}/read`).then(load).catch(() => {})
        }
        if (n.link) navigate(n.link)
    }

    const markAll = async () => {
        await api.patch("/notifications/read-all").catch(() => {})
        load()
    }

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => { setOpen(!open); if (!open) load() }}
                className="relative p-2 rounded-lg text-foreground dark:text-white hover:bg-primary/10 dark:hover:bg-gray-700 transition-colors"
                aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
                aria-expanded={open}
            >
                <Bell className="w-5 h-5" />
                {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-primary text-white text-[10px] font-bold flex items-center justify-center">
                        {unread > 9 ? "9+" : unread}
                    </span>
                )}
            </button>
            {open && (
                <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] rounded-xl bg-popover border border-border shadow-lg overflow-hidden" role="dialog" aria-label="Notifications">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                        <p className="font-semibold text-sm">Notifications</p>
                        {unread > 0 && (
                            <button onClick={markAll} className="text-xs text-primary hover:underline flex items-center gap-1">
                                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                            </button>
                        )}
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                        {error && <p className="px-4 py-3 text-sm text-destructive">{error}</p>}
                        {!error && items.length === 0 && <p className="px-4 py-6 text-sm text-center text-muted-foreground">You're all caught up.</p>}
                        {items.map((n) => (
                            <button
                                key={n._id}
                                onClick={() => openItem(n)}
                                className={cn("w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-primary/5 transition-colors", !n.read && "bg-primary/5")}
                            >
                                <div className="flex items-start gap-2">
                                    {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-gradient-primary shrink-0" aria-label="Unread" />}
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-foreground">{n.title}</p>
                                        {n.message && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>}
                                        <p className="text-[11px] text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
