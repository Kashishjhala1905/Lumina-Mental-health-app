import { useState } from 'react'
import PageShell from '@/components/PageShell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { Notice } from '@/components/ui/notice'
import { Badge } from '@/components/ui/badge'
import { PasswordInput, PasswordStrength } from '@/components/ui/password-input'
import { BellRing, KeyRound, LogOut, UserCog } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import api, { errorMessage, fieldErrors } from '@/lib/api'
import { ROLE_LABEL } from '@/lib/roles'

export default function Profile() {
    const { user, setUser, logout } = useAuth()
    const [profile, setProfile] = useState({ name: user?.name || '', username: user?.username || '' })
    const [profileState, setProfileState] = useState({ saving: false, message: '', error: '', errors: {} })
    const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
    const [pwState, setPwState] = useState({ saving: false, message: '', error: '', errors: {} })
    const [signingOutAll, setSigningOutAll] = useState(false)
    const [emailPref, setEmailPref] = useState({ saving: false, message: '', error: '' })

    const toggleEmailNotifications = async (enabled) => {
        setEmailPref({ saving: true, message: '', error: '' })
        try {
            const { data } = await api.patch('/auth/profile', { emailNotifications: enabled })
            setUser(data.user)
            setEmailPref({ saving: false, message: enabled ? 'Email notifications turned on' : 'Email notifications turned off', error: '' })
        } catch (err) {
            setEmailPref({ saving: false, message: '', error: errorMessage(err) })
        }
    }

    const saveProfile = async (e) => {
        e.preventDefault()
        setProfileState({ saving: true, message: '', error: '', errors: {} })
        try {
            const { data } = await api.patch('/auth/profile', { name: profile.name.trim(), username: profile.username.trim().toLowerCase() })
            setUser(data.user)
            setProfileState({ saving: false, message: data.message, error: '', errors: {} })
        } catch (err) {
            setProfileState({ saving: false, message: '', error: errorMessage(err), errors: fieldErrors(err) })
        }
    }

    const changePassword = async (e) => {
        e.preventDefault()
        if (pw.newPassword !== pw.confirmPassword) {
            setPwState({ saving: false, message: '', error: 'Passwords do not match', errors: { confirmPassword: 'Passwords do not match' } })
            return
        }
        setPwState({ saving: true, message: '', error: '', errors: {} })
        try {
            const { data } = await api.patch('/auth/password', pw)
            setPw({ currentPassword: '', newPassword: '', confirmPassword: '' })
            setPwState({ saving: false, message: data.message, error: '', errors: {} })
        } catch (err) {
            setPwState({ saving: false, message: '', error: errorMessage(err), errors: fieldErrors(err) })
        }
    }

    const signOutEverywhere = async () => {
        if (!window.confirm('Sign out of Lumina on every device, including this one?')) return
        setSigningOutAll(true)
        // Revokes every session, then returns to the public homepage
        await logout({ everywhere: true })
    }

    return (
        <PageShell title="Profile &" highlight="Security" subtitle="Manage your account details and sign-in security." maxWidth="max-w-4xl">
            <div className="grid gap-6">
                <Card className="bg-card/50 backdrop-blur border-border">
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2"><UserCog className="w-5 h-5 text-primary" /> Account</CardTitle>
                        <CardDescription>
                            <span className="mr-2">{user?.email}</span>
                            <Badge tone="primary">{ROLE_LABEL[user?.role] || user?.role}</Badge>
                            {user?.counselorApplication?.status === 'pending' && <Badge tone="amber" className="ml-2">Counselor application pending</Badge>}
                            {user?.counselorApplication?.status === 'rejected' && <Badge tone="neutral" className="ml-2">Counselor application not approved</Badge>}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={saveProfile} className="grid gap-4 md:grid-cols-2" noValidate>
                            <Field id="profile-name" label="Full Name" error={profileState.errors.name}>
                                <Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} autoComplete="name" />
                            </Field>
                            <Field id="profile-username" label="Username / User ID" error={profileState.errors.username} hint={user?.username ? undefined : 'Set a username to sign in without your email.'}>
                                <Input value={profile.username} onChange={(e) => setProfile({ ...profile, username: e.target.value })} autoComplete="username" />
                            </Field>
                            <div className="md:col-span-2 space-y-3">
                                {profileState.error && <Notice type="error">{profileState.error}</Notice>}
                                {profileState.message && <Notice type="success">{profileState.message}</Notice>}
                                <Button type="submit" disabled={profileState.saving}>{profileState.saving ? 'Saving...' : 'Save changes'}</Button>
                            </div>
                        </form>
                        <p className="text-xs text-muted-foreground mt-4">
                            Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                            {user?.lastLoginAt && ` · Last sign-in ${new Date(user.lastLoginAt).toLocaleString()}`}
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur border-border">
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2"><KeyRound className="w-5 h-5 text-primary" /> Change password</CardTitle>
                        <CardDescription>Changing your password signs you out on all other devices.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={changePassword} className="grid gap-4 max-w-md" noValidate>
                            <Field id="currentPassword" label="Current password" error={pwState.errors.currentPassword}>
                                <PasswordInput autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
                            </Field>
                            <Field id="newPassword" label="New password" error={pwState.errors.newPassword}>
                                <PasswordInput autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
                            </Field>
                            <PasswordStrength password={pw.newPassword} />
                            <Field id="confirmNewPassword" label="Confirm new password" error={pwState.errors.confirmPassword}>
                                <PasswordInput autoComplete="new-password" value={pw.confirmPassword} onChange={(e) => setPw({ ...pw, confirmPassword: e.target.value })} />
                            </Field>
                            {pwState.error && <Notice type="error">{pwState.error}</Notice>}
                            {pwState.message && <Notice type="success">{pwState.message}</Notice>}
                            <Button type="submit" disabled={pwState.saving || !pw.currentPassword || !pw.newPassword}>{pwState.saving ? 'Updating...' : 'Update password'}</Button>
                        </form>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur border-border">
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2"><BellRing className="w-5 h-5 text-primary" /> Email notifications</CardTitle>
                        <CardDescription>
                            Receive a short email when something important happens in Lumina{user?.role === 'counselor' ? ' (for example, a new alert on a case assigned to you)' : ' (for example, a counselor update)'}.
                            Emails never include details – you sign in to read them. Password and security emails are always sent.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <label className="flex items-center gap-3 text-sm">
                            <input type="checkbox" className="h-4 w-4" checked={!!user?.emailNotifications} disabled={emailPref.saving} onChange={(e) => toggleEmailNotifications(e.target.checked)} />
                            Email me about important updates
                        </label>
                        {emailPref.error && <Notice type="error">{emailPref.error}</Notice>}
                        {emailPref.message && <Notice type="success">{emailPref.message}</Notice>}
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur border-border">
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2"><LogOut className="w-5 h-5 text-primary" /> Sessions</CardTitle>
                        <CardDescription>If you signed in on a shared or lost device, sign out everywhere.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button variant="outline" onClick={signOutEverywhere} disabled={signingOutAll}>{signingOutAll ? 'Signing out...' : 'Sign out on all devices'}</Button>
                    </CardContent>
                </Card>
            </div>
        </PageShell>
    )
}
