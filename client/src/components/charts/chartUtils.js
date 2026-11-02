// Non-component chart helpers (kept separate from ChartKit.jsx for fast refresh).
import { useContext } from "react"
import { ThemeContext } from "@/context/ThemeContext"
import { CATEGORY_STYLE } from "@/components/victim-support/vsConstants"

export { CATEGORY_STYLE }
export const CATEGORY_BANDS = [
    { name: "Low Concern", y1: 0, y2: 25 },
    { name: "Moderate Concern", y1: 25, y2: 50 },
    { name: "High Concern", y1: 50, y2: 70 },
    { name: "Urgent Support Needed", y1: 70, y2: 100 },
]

export const THEMES = {
    light: {
        surface: "#ffffff",
        series: ["#a855f7", "#ec4899"],
        grid: "#e7e5ef",
        axis: "#c9c6d6",
        muted: "#6b7280",
        text: "#0f172a",
        tooltipBg: "#ffffff",
        tooltipBorder: "rgba(15,23,42,0.12)",
    },
    dark: {
        surface: "#0f172a",
        series: ["#a855f7", "#ec4899"],
        grid: "#1e293b",
        axis: "#334155",
        muted: "#9ca3af",
        text: "#f3f4f6",
        tooltipBg: "#111827",
        tooltipBorder: "rgba(255,255,255,0.12)",
    },
}

export function useChartTheme() {
    const { darkMode } = useContext(ThemeContext)
    return THEMES[darkMode ? "dark" : "light"]
}

export const formatDay = (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" })
export const formatMonth = (m) => {
    const [y, mo] = String(m).split("-").map(Number)
    return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" })
}

