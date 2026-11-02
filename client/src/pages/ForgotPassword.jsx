import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import BrandLogo from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { Notice } from '@/components/ui/notice'
import { MailCheck } from 'lucide-react'
import api, { errorMessage, fieldErrors } from '@/lib/api'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default function ForgotPassword() {
    const [email, setEmail] = useState('')
    const [state, setState] = useState({ loading: false, error: '', fieldError: '', sent: '' })

    const submit = async (e) => {
        e.preventDefault()
        if (!EMAIL_RE.test(email.trim())) {
            setState({ loading: false, error: '', fieldError: 'Please enter a valid email address', sent: '' })
            return
        }
        setState({ loading: true, error: '', fieldError: '', sent: '' })
        try {
            const { data } = await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() })
            setState({ loading: false, error: '', fieldError: '', sent: data.message })
        } catch (err) {
            setState({ loading: false, error: errorMessage(err), fieldError: fieldErrors(err).email || '', sent: '' })
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
                    <CardTitle className="text-2xl font-bold gradient-text">Forgot Password</CardTitle>
                    <CardDescription>Enter the email address you registered with and we'll send you a link to reset your password.</CardDescription>
                </CardHeader>
                <CardContent>
                    {state.sent ? (
                        <div className="text-center space-y-4" role="status">
                            <MailCheck className="w-12 h-12 mx-auto text-primary" aria-hidden="true" />
                            <p className="text-sm">{state.sent}</p>
                            <p className="text-xs text-muted-foreground">Check your inbox and spam folder. The link can be used once and expires in 15 minutes.</p>
                            <Button variant="outline" className="w-full" onClick={() => setState({ loading: false, error: '', fieldError: '', sent: '' })}>Send another link</Button>
                        </div>
                    ) : (
                        <form onSubmit={submit} className="space-y-4" noValidate>
                            {state.error && !state.fieldError && <Notice type="error">{state.error}</Notice>}
                            <Field id="forgot-email" label="Email Address" required error={state.fieldError}>
                                <Input type="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
                            </Field>
                            <Button type="submit" disabled={state.loading} className="w-full bg-gradient-primary text-white">
                                {state.loading ? 'Sending...' : 'Send reset link'}
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
