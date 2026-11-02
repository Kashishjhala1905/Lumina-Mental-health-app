import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import BrandLogo from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Notice, LoadingState } from '@/components/ui/notice'
import { PasswordInput, PasswordStrength } from '@/components/ui/password-input'
import { passwordChecks } from '@/lib/password'
import api, { errorMessage, fieldErrors } from '@/lib/api'

export default function ResetPassword() {
    const location = useLocation()
    const navigate = useNavigate()
    // Capture the token once, then remove it from the address bar
    const [token] = useState(() => new URLSearchParams(location.search).get('token') || '')
    const [tokenState, setTokenState] = useState(token ? 'checking' : 'invalid')
    const [form, setForm] = useState({ password: '', confirmPassword: '' })
    const [state, setState] = useState({ saving: false, error: '', errors: {} })

    useEffect(() => {
        if (location.search) navigate('/reset-password', { replace: true })
        if (!token) return
        api.post('/auth/reset-password/verify', { token })
            .then(() => setTokenState('valid'))
            .catch(() => setTokenState('invalid'))
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const submit = async (e) => {
        e.preventDefault()
        const errors = {}
        if (passwordChecks(form.password).some((c) => !c.ok)) errors.password = 'Password does not meet the requirements below'
        if (form.password !== form.confirmPassword) errors.confirmPassword = 'Passwords do not match'
        if (Object.keys(errors).length) { setState({ saving: false, error: 'Please fix the highlighted fields', errors }); return }
        setState({ saving: true, error: '', errors: {} })
        try {
            const { data } = await api.post('/auth/reset-password', { token, ...form })
            navigate('/login', { replace: true, state: { notice: data.message } })
        } catch (err) {
            if (err.response?.data?.code === 'INVALID_TOKEN') setTokenState('invalid')
            setState({ saving: false, error: errorMessage(err), errors: fieldErrors(err) })
        }
    }

    return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none -z-10">
                <div className="absolute top-20 left-10 w-72 h-72 bg-primary/20 rounded-full blur-[100px] animate-pulse" />
                <div className="absolute bottom-20 right-10 w-72 h-72 bg-secondary/20 rounded-full blur-[100px] animate-pulse delay-1000" />
            </div>

            <Card className="w-full max-w-md border-border bg-card/80 backdrop-blur-md">
                <CardHeader className="text-center space-y-2">
                    <Link to="/" className="mx-auto flex flex-col items-center gap-1.5" aria-label="Lumina home">
                        <BrandLogo size="lg" alt="" />
                        <span className="text-sm font-bold gradient-text">Lumina</span>
                    </Link>
                    <CardTitle className="text-2xl font-bold gradient-text">Choose a New Password</CardTitle>
                    <CardDescription>Your new password signs you out of every other device.</CardDescription>
                </CardHeader>
                <CardContent>
                    {tokenState === 'checking' && <LoadingState label="Checking your reset link..." className="py-6" />}
                    {tokenState === 'invalid' && (
                        <div className="space-y-4">
                            <Notice type="error" title="This link is invalid or has expired">
                                Reset links can be used once and expire after 15 minutes. Please request a new one.
                            </Notice>
                            <Button asChild className="w-full"><Link to="/forgot-password">Request a new link</Link></Button>
                        </div>
                    )}
                    {tokenState === 'valid' && (
                        <form onSubmit={submit} className="space-y-4" noValidate>
                            {state.error && <Notice type="error">{state.error}</Notice>}
                            <Field id="new-password" label="New Password" required error={state.errors.password}>
                                <PasswordInput autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoFocus />
                            </Field>
                            <PasswordStrength password={form.password} />
                            <Field id="confirm-new-password" label="Confirm New Password" required error={state.errors.confirmPassword}>
                                <PasswordInput autoComplete="new-password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} />
                            </Field>
                            <Button type="submit" disabled={state.saving} className="w-full bg-gradient-primary text-white">
                                {state.saving ? 'Saving...' : 'Reset password'}
                            </Button>
                        </form>
                    )}
                </CardContent>
                <CardFooter className="flex flex-col gap-2 text-center text-sm text-muted-foreground">
                    <Link to="/login" className="text-primary hover:underline font-medium">Back to sign in</Link>
                </CardFooter>
            </Card>
        </div>
    )
}
