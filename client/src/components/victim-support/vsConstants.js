// Shared copy and option lists for the Confidential Victim Support module.

// Reserved status palette (never used for ordinary series)
export const CATEGORY_STYLE = {
    "Low Concern": { color: "#0ca30c", short: "Low", tone: "green" },
    "Moderate Concern": { color: "#fab219", short: "Moderate", tone: "amber" },
    "High Concern": { color: "#ec835a", short: "High", tone: "orange" },
    "Urgent Support Needed": { color: "#d03b3b", short: "Urgent", tone: "red" },
}
export const CATEGORY_ORDER = ["Low Concern", "Moderate Concern", "High Concern", "Urgent Support Needed"]

export const SCALE_QUESTIONS = [
    {
        key: "emotionalState",
        label: "How are you feeling emotionally today?",
        required: true,
        low: "Very low",
        high: "Very good",
        labels: ["Very low", "Low", "Okay", "Good", "Very good"],
    },
    {
        key: "stressLevel",
        label: "How stressed do you feel?",
        required: true,
        low: "Not at all",
        high: "Extremely",
        labels: ["Not at all", "A little", "Moderately", "Very", "Extremely"],
    },
    {
        key: "anxietyLevel",
        label: "How anxious or on edge do you feel?",
        required: true,
        low: "Not at all",
        high: "Extremely",
        labels: ["Not at all", "A little", "Moderately", "Very", "Extremely"],
    },
    {
        key: "sleepQuality",
        label: "How well have you been sleeping?",
        required: false,
        low: "Very poorly",
        high: "Very well",
        labels: ["Very poorly", "Poorly", "Okay", "Well", "Very well"],
    },
    {
        key: "dailyFunctioning",
        label: "How well are you managing daily activities (eating, work, chores, caring for others)?",
        required: false,
        low: "Unable to manage",
        high: "Fully managing",
        labels: ["Unable", "With great difficulty", "Somewhat", "Mostly", "Fully"],
    },
]

export const CHOICE_QUESTIONS = [
    {
        key: "safetyConcern",
        label: "Do you feel safe where you are right now?",
        options: [
            { value: "safe", label: "Yes, I feel safe" },
            { value: "somewhat_unsafe", label: "Somewhat unsafe" },
            { value: "unsafe", label: "No, I feel unsafe" },
            { value: "prefer_not_to_say", label: "Prefer not to say" },
        ],
    },
    {
        key: "socialSupport",
        label: "Do you have people you can turn to for emotional support?",
        options: [
            { value: "strong", label: "Yes, I have good support" },
            { value: "some", label: "Some support" },
            { value: "none", label: "No one right now" },
            { value: "prefer_not_to_say", label: "Prefer not to say" },
        ],
    },
    {
        key: "needsProfessionalHelp",
        label: "Do you feel you need professional help (counseling, medical or other)?",
        options: [
            { value: "yes", label: "Yes" },
            { value: "unsure", label: "Not sure" },
            { value: "no", label: "Not at the moment" },
        ],
    },
]

export const ANSWER_LABELS = {
    safe: "Feels safe",
    somewhat_unsafe: "Somewhat unsafe",
    unsafe: "Feels unsafe",
    prefer_not_to_say: "Prefer not to say",
    strong: "Good support",
    some: "Some support",
    none: "No support",
    yes: "Yes",
    no: "No",
    unsure: "Not sure",
}

export const ALERT_STATUS_TONE = {
    New: "red",
    "Under Review": "amber",
    "Contact Initiated": "blue",
    Resolved: "green",
}

export const PLAN_STATUS_TONE = {
    Suggested: "neutral",
    Accepted: "primary",
    Referred: "blue",
    "Follow-up Pending": "amber",
    Completed: "green",
    "Unable to Connect": "red",
}

export const FREQUENCY_LABELS = {
    daily: "Every day",
    every_3_days: "Every 3 days",
    weekly: "Once a week",
}

// Official helplines (India) with their source pages. Lumina is NOT connected to these services and never
// contacts them automatically. Verified against the official sites on 2026-10-31 (112.gov.in was unreachable).
// Keep in sync with server/config/supportDirectory.js.
export const HELPLINES = [
    { name: "Emergency (Police / Ambulance / Fire)", number: "112", tel: "112", note: "Immediate danger", source: "https://112.gov.in" },
    { name: "National Helpline Against Atrocities (SC/ST)", number: "14566", tel: "14566", note: "Toll-free", source: "https://socialjustice.gov.in" },
    { name: "Tele-MANAS Mental Health Helpline", number: "14416 / 1-800-891-4416", tel: "14416", note: "Toll-free, 24×7", source: "https://telemanas.mohfw.gov.in" },
    { name: "Women Helpline", number: "181", tel: "181", note: "Women in distress", source: "https://wcd.gov.in" },
    { name: "NALSA Free Legal Aid", number: "15100", tel: "15100", note: "Legal services", source: "https://nalsa.gov.in" },
    { name: "Childline", number: "1098", tel: "1098", note: "Children in distress", source: "https://wcd.gov.in" },
]

export const REFERRAL_STATUSES = ["Suggested", "Accepted", "Referred", "Follow-up Pending", "Completed", "Unable to Connect"]
export const REFERRAL_STATUS_TONE = {
    Suggested: "neutral",
    Accepted: "primary",
    Referred: "blue",
    "Follow-up Pending": "amber",
    Completed: "green",
    "Unable to Connect": "red",
}

export const PROTOTYPE_NOTICE =
    "The monitoring score is a prototype, rule-based indicator to help trained counselors prioritise support. It is not a medical diagnosis or a clinically validated prediction."
