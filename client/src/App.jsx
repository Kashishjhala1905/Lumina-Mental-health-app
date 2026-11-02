import { lazy, Suspense } from 'react'
import { Navigate, Routes, Route, useLocation, Link } from 'react-router-dom'
import Home from './pages/Home'
import Chatbot from './pages/Chatbot'
import Assessment from './pages/Assessment'
import Resources from './pages/Resources'
import Community from './pages/Community'
import Counseling from './pages/Counseling'
import Emergency from './pages/Emergency'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import StudentDashboard from './pages/StudentDashboard'
import Profile from './pages/Profile'
import VictimSupport from './pages/VictimSupport'
import PageShell from './components/PageShell'
import { LoadingState } from './components/ui/notice'
import { Button } from './components/ui/button'
import { ShieldAlert } from 'lucide-react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AudioPlayerProvider } from './context/AudioPlayerContext'
import { MiniPlayer } from './components/audio/Player'
import { homeFor } from './lib/roles'

// Heavier dashboards (charts) are loaded on demand
const Admin = lazy(() => import('./pages/Admin'))
const CounselorDashboard = lazy(() => import('./pages/CounselorDashboard'))
const CounselorCase = lazy(() => import('./pages/CounselorCase'))
const VictimConsent = lazy(() => import('./pages/VictimConsent'))
const VictimCheckin = lazy(() => import('./pages/VictimCheckin'))
const VictimDashboard = lazy(() => import('./pages/VictimDashboard'))
const History = lazy(() => import('./pages/History'))
const Feedback = lazy(() => import('./pages/Feedback'))

function AccessDenied() {
    const { user } = useAuth()
    return (
        <PageShell maxWidth="max-w-xl">
            <div className="text-center py-16">
                <ShieldAlert className="w-14 h-14 mx-auto text-primary mb-4" aria-hidden="true" />
                <h1 className="text-2xl font-bold text-foreground mb-2">Access restricted</h1>
                <p className="text-muted-foreground mb-6">Your account does not have permission to view this page.</p>
                <Button asChild><Link to={homeFor(user)}>Go to my dashboard</Link></Button>
            </div>
        </PageShell>
    )
}

function ProtectedRoute({ children, roles }) {
    const { user, loading } = useAuth()
    const location = useLocation()

    if (loading) {
        return <div className="min-h-screen grid place-items-center"><LoadingState label="Checking your session..." /></div>
    }

    if (!user) {
        return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
    }

    if (roles && !roles.includes(user.role)) {
        return <AccessDenied />
    }

    return children
}

function NotFound() {
    return (
        <PageShell maxWidth="max-w-xl">
            <div className="text-center py-16">
                <h1 className="text-5xl font-bold gradient-text mb-2">404</h1>
                <p className="text-muted-foreground mb-6">We couldn't find that page.</p>
                <Button asChild><Link to="/">Back to home</Link></Button>
            </div>
        </PageShell>
    )
}

const lazyPage = (element) => (
    <Suspense fallback={<div className="min-h-screen grid place-items-center"><LoadingState /></div>}>{element}</Suspense>
)

function App() {
    return (
        <AuthProvider>
            <AudioPlayerProvider>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/chatbot" element={<Chatbot />} />
                <Route path="/assessment" element={<Assessment />} />
                <Route path="/resources" element={<Resources />} />
                <Route path="/community" element={<Community />} />
                <Route path="/counseling" element={<Counseling />} />
                <Route path="/emergency" element={<Emergency />} />

                <Route path="/dashboard" element={<ProtectedRoute roles={['user']}><StudentDashboard /></ProtectedRoute>} />
                <Route path="/student-dashboard" element={<Navigate to="/dashboard" replace />} />
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/history" element={<ProtectedRoute>{lazyPage(<History />)}</ProtectedRoute>} />
                <Route path="/feedback" element={<ProtectedRoute>{lazyPage(<Feedback />)}</ProtectedRoute>} />

                {/* Confidential Victim Support */}
                <Route path="/victim-support" element={<VictimSupport />} />
                <Route path="/victim-support/consent" element={<ProtectedRoute roles={['user']}>{lazyPage(<VictimConsent />)}</ProtectedRoute>} />
                <Route path="/victim-support/check-in" element={<ProtectedRoute roles={['user']}>{lazyPage(<VictimCheckin />)}</ProtectedRoute>} />
                <Route path="/victim-support/dashboard" element={<ProtectedRoute roles={['user']}>{lazyPage(<VictimDashboard />)}</ProtectedRoute>} />

                <Route path="/counselor-dashboard" element={<ProtectedRoute roles={['counselor']}>{lazyPage(<CounselorDashboard />)}</ProtectedRoute>} />
                <Route path="/counselor/cases/:caseRef" element={<ProtectedRoute roles={['counselor']}>{lazyPage(<CounselorCase />)}</ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute roles={['admin']}>{lazyPage(<Admin />)}</ProtectedRoute>} />

                <Route path="*" element={<NotFound />} />
            </Routes>
            {/* Keeps meditation audio playing (and controllable) on every page */}
            <MiniPlayer />
            </AudioPlayerProvider>
        </AuthProvider>
    )
}

export default App
