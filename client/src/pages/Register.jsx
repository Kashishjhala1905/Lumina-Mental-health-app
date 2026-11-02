import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import BrandLogo from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { Notice } from '@/components/ui/notice'
import { PasswordInput, PasswordStrength } from '@/components/ui/password-input'
import { passwordChecks } from '@/lib/password'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { User, Stethoscope } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { errorMessage, fieldErrors } from '@/lib/api'
import { homeFor } from '@/lib/roles'

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function validate(form, applyAsCounselor) {
    const errors = {}
    const username = form.username.trim().toLowerCase()
    if (form.name.trim().length < 2) errors.name = 'Please enter your full name'
    if (!username) errors.username = 'Username is required'
    else if (!USERNAME_RE.test(username)) errors.username = '3-30 characters: letters, numbers, dots, dashes or underscores'
    if (!EMAIL_RE.test(form.email.trim())) errors.email = 'Please enter a valid email address'
    if (passwordChecks(form.password).some((c) => !c.ok)) errors.password = 'Password does not meet the requirements below'
    if (!form.confirmPassword) errors.confirmPassword = 'Please confirm your password'
    else if (form.password !== form.confirmPassword) errors.confirmPassword = 'Passwords do not match'
    if (applyAsCounselor) {
        if (!form.speciality.trim()) errors.speciality = 'Speciality is required'
        if (!form.credentials.trim()) errors.credentials = 'Proof of credentials is required'
    }
    return errors
}

export default function Register() {
    const [accountType, setAccountType] = useState('member')
    const [formData, setFormData] = useState({
        name: '',
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        speciality: '',
        credentials: '',
    })
    const [errors, setErrors] = useState({})
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const { user, register } = useAuth()
    const navigate = useNavigate()
    const applyAsCounselor = accountType === 'counselor'

    if (user) return <Navigate to={homeFor(user)} replace />

    const handleRegister = async (e) => {
        e.preventDefault()
        setError('')
        const clientErrors = validate(formData, applyAsCounselor)
        setErrors(clientErrors)
        if (Object.keys(clientErrors).length) {
            setError('Please fix the highlighted fields')
            return
        }
        setLoading(true)
        try {
            const payload = {
                name: formData.name.trim(),
                username: formData.username.trim().toLowerCase(),
                email: formData.email.trim().toLowerCase(),
                password: formData.password,
                confirmPassword: formData.confirmPassword,
                applyAsCounselor,
                ...(applyAsCounselor ? { speciality: formData.speciality.trim(), credentials: formData.credentials.trim() } : {}),
            }
            const { user: created } = await register(payload)
            navigate(homeFor(created), { replace: true, state: applyAsCounselor ? { notice: 'Your counselor application has been submitted and is pending administrator review.' } : undefined })
        } catch (err) {
            setErrors(fieldErrors(err))
            setError(errorMessage(err, 'Registration failed'))
        } finally {
            setLoading(false)
        }
    }

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value })
        if (errors[e.target.name]) setErrors({ ...errors, [e.target.name]: undefined })
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
                    <CardTitle className="text-2xl font-bold gradient-text">Create Account</CardTitle>
                    <CardDescription>
                        Join Lumina to start your journey
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs value={accountType} className="w-full" onValueChange={setAccountType}>
                        <TabsList className="grid w-full grid-cols-2 mb-6">
                            <TabsTrigger value="member" className="flex items-center gap-2">
                                <User className="w-4 h-4" /> Member
                            </TabsTrigger>
                            <TabsTrigger value="counselor" className="flex items-center gap-2">
                                <Stethoscope className="w-4 h-4" /> Counselor
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>

                    <form onSubmit={handleRegister} className="space-y-4" noValidate>
                        {error && <Notice type="error">{error}</Notice>}

                        <Field id="name" label="Full Name" required error={errors.name}>
                            <Input name="name" type="text" autoComplete="name" placeholder="John Doe" value={formData.name} onChange={handleChange} />
                        </Field>
                        <Field id="username" label="Username / User ID" required error={errors.username} hint="Used to sign in. Letters, numbers, dots, dashes or underscores.">
                            <Input name="username" type="text" autoComplete="username" placeholder="john_doe" value={formData.username} onChange={handleChange} />
                        </Field>
                        <Field id="email" label="Email Address" required error={errors.email}>
                            <Input name="email" type="email" autoComplete="email" placeholder="name@example.com" value={formData.email} onChange={handleChange} />
                        </Field>
                        <Field id="password" label="Password" required error={errors.password}>
                            <PasswordInput name="password" autoComplete="new-password" value={formData.password} onChange={handleChange} />
                        </Field>
                        <PasswordStrength password={formData.password} />
                        <Field id="confirmPassword" label="Confirm Password" required error={errors.confirmPassword}>
                            <PasswordInput name="confirmPassword" autoComplete="new-password" value={formData.confirmPassword} onChange={handleChange} />
                        </Field>

                        {applyAsCounselor && (
                            <>
                                <Field id="speciality" label="Speciality" required error={errors.speciality}>
                                    <Input name="speciality" placeholder="e.g. Trauma, Anxiety, Grief" value={formData.speciality} onChange={handleChange} />
                                </Field>
                                <Field id="credentials" label="Proof of Credibility" required error={errors.credentials}>
                                    <Input name="credentials" placeholder="License No. or LinkedIn URL" value={formData.credentials} onChange={handleChange} />
                                </Field>
                                <p className="text-xs text-muted-foreground">
                                    Your account is created as a regular member. Counselor tools unlock only after an administrator verifies and approves your application.
                                </p>
                            </>
                        )}

                        <Button type="submit" disabled={loading} className="w-full bg-gradient-primary text-white transition-all duration-300">
                            {loading ? 'Creating account...' : applyAsCounselor ? 'Sign Up & Apply as Counselor' : 'Sign Up'}
                        </Button>
                    </form>
                </CardContent>
                <CardFooter className="flex flex-col gap-4 text-center text-sm text-muted-foreground">
                    <div>
                        Already have an account?{' '}
                        <Link to="/login" className="text-primary hover:underline font-medium">
                            Sign in
                        </Link>
                    </div>
                </CardFooter>
            </Card>
        </div>
    )
}
