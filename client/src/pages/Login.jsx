import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import BrandLogo from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { Notice } from '@/components/ui/notice'
import { PasswordInput } from '@/components/ui/password-input'
import { GraduationCap, Shield, User } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { errorMessage } from '@/lib/api'
import { redirectAfterLogin } from '@/lib/roles'

export default function Login() {
    const [formData, setFormData] = useState({ identifier: '', password: '', rememberMe: true })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const { user, login, sessionMessage, clearSessionMessage } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const from = location.state?.from

    useEffect(() => () => clearSessionMessage(), [clearSessionMessage])

    if (user) return <Navigate to={redirectAfterLogin(from, user)} replace />

    const handleLogin = async (e) => {
        e.preventDefault()
        setError('')
        if (!formData.identifier.trim() || !formData.password) {
            setError('Please enter your username or email and your password')
            return
        }
        setLoading(true)
        try {
            const signedIn = await login({ ...formData, identifier: formData.identifier.trim() })
            navigate(redirectAfterLogin(from, signedIn), { replace: true })
        } catch (err) {
            setError(errorMessage(err, 'Sign in failed'))
        } finally {
            setLoading(false)
        }
    }

    const handleChange = (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
        setFormData({ ...formData, [e.target.name]: value })
    }

    return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Elements */}
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
                    <CardTitle className="text-2xl font-bold gradient-text">Welcome Back</CardTitle>
                    <CardDescription>
                        Sign in to access your dashboard
                    </CardDescription>
                    <div className="flex justify-center gap-4 pt-2 text-xs text-muted-foreground" aria-hidden="true">
                        <span className="flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" /> Members</span>
                        <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> Counselors</span>
                        <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" /> Admins</span>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4" noValidate>
                        {sessionMessage && <Notice type="warning">{sessionMessage}</Notice>}
                        {location.state?.notice && <Notice type="success">{location.state.notice}</Notice>}
                        {from && !sessionMessage && <Notice type="info">Please sign in to continue.</Notice>}
                        {error && <Notice type="error">{error}</Notice>}

                        <Field id="identifier" label="Username or Email" required>
                            <Input
                                name="identifier"
                                type="text"
                                autoComplete="username"
                                placeholder="your_username or name@example.com"
                                value={formData.identifier}
                                onChange={handleChange}
                                autoFocus
                            />
                        </Field>
                        <Field id="password" label="Password" required>
                            <PasswordInput
                                name="password"
                                autoComplete="current-password"
                                value={formData.password}
                                onChange={handleChange}
                            />
                        </Field>
                        <div className="flex justify-end -mt-2">
                            <Link to="/forgot-password" className="text-sm text-primary hover:underline">Forgot password?</Link>
                        </div>
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input
                                type="checkbox"
                                name="rememberMe"
                                checked={formData.rememberMe}
                                onChange={handleChange}
                                className="h-4 w-4 rounded border-primary/30 text-primary focus:ring-primary"
                            />
                            Keep me signed in on this device for 7 days
                        </label>

                        <Button type="submit" disabled={loading} className="w-full bg-gradient-primary text-white transition-all duration-300">
                            {loading ? 'Signing in...' : 'Sign In'}
                        </Button>
                    </form>
                </CardContent>
                <CardFooter className="flex flex-col gap-4 text-center text-sm text-muted-foreground">
                    <div>
                        Don't have an account?{' '}
                        <Link to="/register" className="text-primary hover:underline font-medium">
                            Sign up
                        </Link>
                    </div>
                </CardFooter>
            </Card>
        </div>
    )
}
