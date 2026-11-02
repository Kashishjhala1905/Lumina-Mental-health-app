// Base URL of the Lumina API (without /api).
// - Development default: http://localhost:5000
// - Production: set VITE_API_URL, or leave it empty to call the same origin (e.g. Vercel rewrites).
const configured = import.meta.env.VITE_API_URL;
const API_URL = (configured !== undefined ? configured : (import.meta.env.DEV ? "http://localhost:5000" : ""))
    .trim()
    .replace(/\/+$/, "");

export default API_URL;
