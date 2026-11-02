import { Activity, Anchor, Clock, Eye, Hash, Heart, HeartHandshake, Leaf, ListChecks, PersonStanding, ScanLine, Smile, Sparkles, Square, Target, Waves, Wind } from 'lucide-react'

const ICONS = { Activity, Anchor, Clock, Eye, Hash, Heart, HeartHandshake, Leaf, ListChecks, PersonStanding, ScanLine, Smile, Square, Target, Waves, Wind }

/** Renders the lucide icon named by the exercise catalogue (falls back to a neutral icon). */
export function ExerciseIcon({ name, ...props }) {
    const Icon = ICONS[name] || Sparkles
    return <Icon aria-hidden="true" {...props} />
}
