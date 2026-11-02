import axios from 'axios';
import API_URL from '../config/api';

// Sessions use a secure HttpOnly cookie set by the server, so no token is ever stored in
// localStorage or readable by JavaScript. `withCredentials` sends that cookie with each request.
const api = axios.create({
    baseURL: `${API_URL}/api`,
    withCredentials: true,
    timeout: 30000,
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
});

export const SESSION_EXPIRED_EVENT = 'lumina:session-expired';

const SILENT_401_PATHS = ['/auth/me', '/auth/login', '/auth/register', '/auth/logout', '/auth/password'];

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response?.status;
        const url = error.config?.url || '';
        if (status === 401 && !SILENT_401_PATHS.some((p) => url.startsWith(p))) {
            window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { code: error.response?.data?.code } }));
        }
        return Promise.reject(error);
    }
);

/** Human-readable error message from an axios error. */
export const errorMessage = (error, fallback = 'Something went wrong. Please try again.') => {
    if (error?.response?.data?.message) return error.response.data.message;
    if (error?.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
    if (error?.message === 'Network Error') return 'Cannot reach the Lumina server. Please check your connection.';
    return fallback;
};

/** Field-level validation errors returned by the API ({ field: message }). */
export const fieldErrors = (error) => {
    const errors = error?.response?.data?.errors;
    return errors && typeof errors === 'object' && !Array.isArray(errors) ? errors : {};
};

export default api;
