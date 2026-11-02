/** Returns the unmet password requirements (mirrors the server policy). */
export function passwordChecks(password = "") {
    return [
        { label: "8+ characters", ok: password.length >= 8 },
        { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
        { label: "Lowercase letter", ok: /[a-z]/.test(password) },
        { label: "Number", ok: /\d/.test(password) },
    ]
}
