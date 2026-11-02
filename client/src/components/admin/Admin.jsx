import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Users, Calendar, Trash2, AlertCircle } from "lucide-react"
import api, { errorMessage } from '@/lib/api'
import { Notice, LoadingState } from "@/components/ui/notice"
import { Select } from "@/components/ui/field"
import { useAuth } from "@/context/AuthContext"
import { VictimAnalytics, VictimCases, AuditLog } from "./VictimSupportAdmin"
import EmailRemindersAdmin from "./EmailRemindersAdmin"
import { CounsellorDirectoryAdmin, ModerationAdmin, FeedbackAdmin } from "./PlatformAdmin"

const ROLE_OPTIONS = [
    { value: 'user', label: 'Member' },
    { value: 'counselor', label: 'Counselor' },
    { value: 'admin', label: 'Admin' },
]

export default function AdminComponent() {
    const [stats, setStats] = useState({
        students: 0,
        counselors: 0,
        appointments: 0,
        pending: 0,
        pendingCounselors: 0
    })
    const [appointments, setAppointments] = useState([])
    const [users, setUsers] = useState([])
    const [pendingCounselors, setPendingCounselors] = useState([])
    const [loading, setLoading] = useState(true)
    const [message, setMessage] = useState({ type: '', text: '' })
    const { user: me } = useAuth()

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        try {
            const [statsRes, aptRes, usersRes, pendRes] = await Promise.all([
                api.get('/admin/stats'),
                api.get('/admin/appointments'),
                api.get('/admin/users'),
                api.get('/admin/pending-counselors')
            ])

            if (statsRes.data.success) setStats(statsRes.data.data)
            if (aptRes.data.success) setAppointments(aptRes.data.data)
            if (usersRes.data.success) setUsers(usersRes.data.data)
            if (pendRes.data.success) setPendingCounselors(pendRes.data.data)
        } catch (error) {
            setMessage({ type: 'error', text: errorMessage(error, 'Failed to load admin data') })
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteUser = async (id) => {
        if (!window.confirm("Are you sure you want to delete this user?")) return
        try {
            const { data } = await api.delete(`/admin/user/${id}`)
            if (data.success) {
                setUsers(users.filter(u => u._id !== id))
                // Refresh stats
                const statsRes = await api.get('/admin/stats');
                if (statsRes.data.success) setStats(statsRes.data.data)
            }
        } catch (error) {
            setMessage({ type: 'error', text: errorMessage(error, 'Failed to delete user') })
        }
    }

    const handleRoleChange = async (u, role) => {
        if (role === (u.role === 'student' ? 'user' : u.role)) return
        if (!window.confirm(`Change ${u.name}'s role to ${role}? They will need to sign in again.`)) return
        try {
            const { data } = await api.patch(`/admin/users/${u._id}/role`, { role })
            setMessage({ type: 'success', text: data.message })
            fetchData()
        } catch (error) {
            setMessage({ type: 'error', text: errorMessage(error, 'Failed to change role') })
        }
    }

    const handleApproveCounselor = async (id) => {
        try {
            const { data } = await api.patch(`/admin/approve-counselor/${id}`)
            if (data.success) {
                // Remove from pending list
                setPendingCounselors(pendingCounselors.filter(c => c._id !== id))
                // Refresh data to update stats and user list
                fetchData()
                setMessage({ type: 'success', text: 'Counselor approved successfully' })
            }
        } catch (error) {
            setMessage({ type: 'error', text: errorMessage(error, 'Failed to approve counselor') })
        }
    }

    const handleRejectCounselor = async (id) => {
        if (!window.confirm("Reject this counselor application? The account remains a regular member account.")) return
        try {
            const { data } = await api.delete(`/admin/reject-counselor/${id}`)
            if (data.success) {
                setPendingCounselors(pendingCounselors.filter(c => c._id !== id))
                fetchData()
                setMessage({ type: 'success', text: 'Counselor application rejected' })
            }
        } catch (error) {
            setMessage({ type: 'error', text: errorMessage(error, 'Failed to reject counselor') })
        }
    }

    const statCards = [
        { icon: Users, label: "Total Members", value: stats.users ?? stats.students, color: "text-blue-500", bg: "bg-blue-500/10" },
        { icon: Users, label: "Total Counselors", value: stats.counselors, color: "text-green-500", bg: "bg-green-500/10" },
        { icon: Calendar, label: "Total Appointments", value: stats.appointments, color: "text-purple-500", bg: "bg-purple-500/10" },
        { icon: AlertCircle, label: "Pending Requests", value: stats.pending, color: "text-yellow-500", bg: "bg-yellow-500/10" },
        { icon: Users, label: "Counselor Applications", value: stats.pendingCounselors, color: "text-orange-500", bg: "bg-orange-500/10" },
    ]

    if (loading) return <LoadingState label="Loading admin dashboard..." />

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {message.text && <Notice type={message.type}>{message.text} <button className="underline ml-2" onClick={() => setMessage({ type: '', text: '' })}>Dismiss</button></Notice>}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((stat, i) => {
                    const Icon = stat.icon
                    return (
                        <Card key={i} className="p-6 border-border bg-card/50 backdrop-blur">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-muted-foreground text-sm font-medium">{stat.label}</p>
                                    <p className="text-3xl font-bold text-foreground mt-2">{stat.value}</p>
                                </div>
                                <div className={`p-3 rounded-xl ${stat.bg}`}>
                                    <Icon className={`w-6 h-6 ${stat.color}`} />
                                </div>
                            </div>
                        </Card>
                    )
                })}
            </div>

            <Tabs defaultValue="appointments" className="w-full">
                <TabsList className="mb-4 flex-wrap h-auto">
                    <TabsTrigger value="appointments">Appointments</TabsTrigger>
                    <TabsTrigger value="requests" className="relative">
                        Counselor Requests
                        {stats.pendingCounselors > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full animate-pulse">
                                {stats.pendingCounselors}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="users">Manage Users</TabsTrigger>
                    <TabsTrigger value="vs-analytics">Victim Support Analytics</TabsTrigger>
                    <TabsTrigger value="vs-cases">Case Assignment</TabsTrigger>
                    <TabsTrigger value="audit">Audit Log</TabsTrigger>
                    <TabsTrigger value="email">Email & Reminders</TabsTrigger>
                    <TabsTrigger value="directory">Counsellor Directory</TabsTrigger>
                    <TabsTrigger value="moderation">Community Moderation</TabsTrigger>
                    <TabsTrigger value="feedback">Feedback</TabsTrigger>
                </TabsList>

                <TabsContent value="vs-analytics"><VictimAnalytics /></TabsContent>
                <TabsContent value="vs-cases"><VictimCases /></TabsContent>
                <TabsContent value="audit"><AuditLog /></TabsContent>
                <TabsContent value="email"><EmailRemindersAdmin /></TabsContent>
                <TabsContent value="directory"><CounsellorDirectoryAdmin /></TabsContent>
                <TabsContent value="moderation"><ModerationAdmin /></TabsContent>
                <TabsContent value="feedback"><FeedbackAdmin /></TabsContent>

                <TabsContent value="requests">
                    <Card className="border-border bg-card/50 backdrop-blur overflow-hidden">
                        <div className="p-6 border-b border-border">
                            <h2 className="text-xl font-bold text-foreground">Pending Counselor Approvals</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-border">
                                        <TableHead>Name</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Username</TableHead>
                                        <TableHead>Speciality</TableHead>
                                        <TableHead>Credentials</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pendingCounselors.map((c) => (
                                        <TableRow key={c._id} className="border-border hover:bg-muted/50">
                                            <TableCell className="font-medium">{c.name}</TableCell>
                                            <TableCell>{c.email}</TableCell>
                                            <TableCell>{c.username ? `@${c.username}` : '—'}</TableCell>
                                            <TableCell>{c.speciality}</TableCell>
                                            <TableCell>
                                                {/^https?:\/\//i.test(c.credentials || '') ? (
                                                    <a href={c.credentials} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px] block">
                                                        {c.credentials}
                                                    </a>
                                                ) : (
                                                    <span className="truncate max-w-[200px] block">{c.credentials}</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    className="bg-green-600 hover:bg-green-700 text-white"
                                                    onClick={() => handleApproveCounselor(c._id)}
                                                >
                                                    Approve
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={() => handleRejectCounselor(c._id)}
                                                >
                                                    Reject
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {pendingCounselors.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center text-muted-foreground h-24">
                                                No pending counselor requests.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </Card>
                </TabsContent>

                <TabsContent value="appointments">
                    <Card className="border-border bg-card/50 backdrop-blur overflow-hidden">
                        <div className="p-6 border-b border-border">
                            <h2 className="text-xl font-bold text-foreground">All Appointments</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-border">
                                        <TableHead>Member</TableHead>
                                        <TableHead>Counselor</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Time</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {appointments.map((apt) => (
                                        <TableRow key={apt._id} className="border-border hover:bg-muted/50">
                                            <TableCell className="font-medium">
                                                <div>{apt.userId?.name || 'Unknown'}</div>
                                                <div className="text-xs text-muted-foreground">{apt.userId?.email}</div>
                                            </TableCell>
                                            <TableCell>
                                                <div>{apt.counselorId?.name || 'Unknown'}</div>
                                                <div className="text-xs text-muted-foreground">{apt.counselorId?.email}</div>
                                            </TableCell>
                                            <TableCell>{new Date(apt.date).toLocaleDateString()}</TableCell>
                                            <TableCell>{apt.time}</TableCell>
                                            <TableCell>
                                                <span className={`px-2 py-1 rounded text-xs uppercase font-bold
                                                    ${apt.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : ''}
                                                    ${apt.status === 'approved' ? 'bg-green-100 text-green-800' : ''}
                                                    ${apt.status === 'rejected' ? 'bg-red-100 text-red-800' : ''}
                                                    ${apt.status === 'completed' ? 'bg-blue-100 text-blue-800' : ''}
                                                `}>
                                                    {apt.status}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {appointments.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-muted-foreground h-24">
                                                No appointments found.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </Card>
                </TabsContent>

                <TabsContent value="users">
                    <Card className="border-border bg-card/50 backdrop-blur overflow-hidden">
                        <div className="p-6 border-b border-border">
                            <h2 className="text-xl font-bold text-foreground">All Users</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-border">
                                        <TableHead>Name</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Joined</TableHead>
                                        <TableHead>Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users.map((u) => (
                                        <TableRow key={u._id} className="border-border hover:bg-muted/50">
                                            <TableCell className="font-medium">{u.name}{u.username && <span className="block text-xs text-muted-foreground">@{u.username}</span>}</TableCell>
                                            <TableCell>{u.email}</TableCell>
                                            <TableCell>
                                                {u._id === me?._id ? (
                                                    <span className="capitalize">{u.role} (you)</span>
                                                ) : (
                                                    <Select className="h-9 w-36" value={u.role === 'student' ? 'user' : u.role} onChange={(e) => handleRoleChange(u, e.target.value)} aria-label={`Role for ${u.name}`}>
                                                        {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                                                    </Select>
                                                )}
                                            </TableCell>
                                            <TableCell>{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                                            <TableCell>
                                                {u.role !== 'admin' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-red-500 hover:text-red-700 hover:bg-red-100"
                                                        onClick={() => handleDeleteUser(u._id)}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
