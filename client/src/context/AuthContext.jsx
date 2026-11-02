import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { SESSION_EXPIRED_EVENT } from '@/lib/api';
import { normalizeRole } from '@/lib/roles';

const AuthContext = createContext(null);

// Tells other open tabs about sign-in / sign-out so none keeps showing a stale account
const AUTH_CHANNEL = 'lumina-auth';

const withRole = (user) => (user ? { ...user, role: normalizeRole(user.role) } : null);

/** Removes browser-stored data that belongs to the signed-in person. Device preferences (theme, volume) stay. */
function clearUserCache() {
    try {
        // `user` held the token in the previous (localStorage-based) auth flow
        localStorage.removeItem('user');
        sessionStorage.clear();
    } catch {
        // storage can be unavailable (private mode / blocked); nothing to clear then
    }
}

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sessionMessage, setSessionMessage] = useState('');
    const userRef = useRef(null);
    const signingOutRef = useRef(false);
    const channelRef = useRef(null);
    const navigate = useNavigate();
    const navigateRef = useRef(navigate);
    useEffect(() => { userRef.current = user; }, [user]);
    useEffect(() => { navigateRef.current = navigate; }, [navigate]);

    const broadcast = useCallback((message) => {
        try { channelRef.current?.postMessage(message); } catch { /* channel closed */ }
    }, []);

    const refreshUser = useCallback(async () => {
        try {
            const { data } = await api.get('/auth/me');
            const next = withRole(data.data);
            setUser(next);
            return next;
        } catch {
            setUser(null);
            return null;
        }
    }, []);

    // Restore the session on page load/refresh from the HttpOnly cookie
    useEffect(() => {
        try {
            localStorage.removeItem('user');
            sessionStorage.removeItem('user');
        } catch { /* storage unavailable */ }
        refreshUser().finally(() => setLoading(false));
    }, [refreshUser]);

    // A page restored from the browser's back/forward cache must re-check the session
    useEffect(() => {
        const onPageShow = (event) => { if (event.persisted) refreshUser(); };
        window.addEventListener('pageshow', onPageShow);
        return () => window.removeEventListener('pageshow', onPageShow);
    }, [refreshUser]);

    // Any API call that returns 401 means the session expired or was revoked
    useEffect(() => {
        const onExpired = (event) => {
            // Requests still in flight while signing out are expected to fail; that is not an expiry.
            // `userRef` is cleared at the start of sign-out, so late 401s from requests the page sent
            // before signing out are ignored too. Clearing the user again here (outside the sign-out
            // transition) would re-render the protected page signed-out and redirect to /login
            // instead of the homepage.
            if (signingOutRef.current || !userRef.current) return;
            setSessionMessage(event.detail?.code === 'TOKEN_EXPIRED'
                ? 'Your session has expired. Please sign in again.'
                : 'Your session is no longer valid. Please sign in again.');
            setUser(null);
        };
        window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
        return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    }, []);

    // Keep every open tab on the same account state
    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined') return undefined;
        const channel = new BroadcastChannel(AUTH_CHANNEL);
        channelRef.current = channel;
        channel.onmessage = ({ data }) => {
            if (data === 'signed-out') {
                clearUserCache();
                userRef.current = null;
                setSessionMessage('');
                setUser(null);
            } else if (data === 'signed-in') {
                refreshUser();
            }
        };
        return () => {
            channel.close();
            channelRef.current = null;
        };
    }, [refreshUser]);

    const login = useCallback(async ({ identifier, password, rememberMe }) => {
        const { data } = await api.post('/auth/login', { identifier, password, rememberMe });
        const next = withRole(data.user);
        setUser(next);
        setSessionMessage('');
        broadcast('signed-in');
        return next;
    }, [broadcast]);

    const register = useCallback(async (payload) => {
        const { data } = await api.post('/auth/register', payload);
        const next = withRole(data.user);
        setUser(next);
        setSessionMessage('');
        broadcast('signed-in');
        return { user: next, message: data.message };
    }, [broadcast]);

    /**
     * Ends the current session only (the account and all of its data are kept), clears
     * user-specific browser data and returns to the public homepage.
     */
    const logout = useCallback(async ({ everywhere = false, redirectTo = '/' } = {}) => {
        signingOutRef.current = true;
        try {
            await api.post('/auth/logout', { everywhere });
        } catch {
            // The cookie is cleared server-side when reachable; local state is cleared regardless
        }
        clearUserCache();
        userRef.current = null;
        // The router applies navigation as a transition. Clearing the user in the same transition
        // makes both changes render together; otherwise the protected page re-renders signed-out
        // for a moment and redirects to /login instead of the homepage.
        startTransition(() => {
            setSessionMessage('');
            setUser(null);
            if (redirectTo) navigateRef.current(redirectTo, { replace: true });
        });
        broadcast('signed-out');
        signingOutRef.current = false;
    }, [broadcast]);

    const value = useMemo(() => ({
        user,
        loading,
        login,
        register,
        logout,
        refreshUser,
        setUser: (u) => setUser(withRole(u)),
        sessionMessage,
        clearSessionMessage: () => setSessionMessage(''),
    }), [user, loading, login, register, logout, refreshUser, sessionMessage]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
