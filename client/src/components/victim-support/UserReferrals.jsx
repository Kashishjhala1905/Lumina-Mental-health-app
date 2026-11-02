import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/notice'
import { ExternalLink, Link2Off, Send } from 'lucide-react'
import api, { errorMessage } from '@/lib/api'
import { REFERRAL_STATUS_TONE } from './vsConstants'

/** User view of referrals: status and non-sensitive updates only (no counselor notes). */
export default function UserReferrals({ referrals, onChanged }) {
    const [state, setState] = useState({ busy: '', error: '', msg: '' })

    const setShare = async (ref, share) => {
        setState({ busy: ref, error: '', msg: '' })
        try {
            const { data } = await api.patch(`/victim-support/referrals/${ref}/consent`, { share })
            setState({ busy: '', error: '', msg: data.message })
            onChanged?.()
        } catch (err) {
            setState({ busy: '', error: errorMessage(err), msg: '' })
        }
    }

    return (
        <Card className="p-6 bg-card/50 backdrop-blur border-border">
            <h3 className="font-semibold text-lg text-foreground flex items-center gap-2"><Send className="w-5 h-5 text-primary" /> Referrals to support services</h3>
            <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1">
                <Link2Off className="w-3.5 h-3.5" aria-hidden="true" />
                Lumina is not connected to outside services. Your counselor contacts them directly and never shares your details without your permission.
            </p>
            {state.error && <Notice type="error" className="mb-3">{state.error}</Notice>}
            {state.msg && <Notice type="success" className="mb-3">{state.msg}</Notice>}
            {referrals.length === 0 ? (
                <p className="text-sm text-muted-foreground">Your counselor has not made any referrals yet.</p>
            ) : (
                <ul className="space-y-3">
                    {referrals.map((r) => (
                        <li key={r.referralRef} className="rounded-lg border border-border p-4">
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                                <div>
                                    <p className="font-medium">{r.title}</p>
                                    <p className="text-xs text-muted-foreground">{r.referralRef} · {r.category}{r.isSynthetic && ' · Synthetic'}</p>
                                </div>
                                <Badge tone={REFERRAL_STATUS_TONE[r.status]}>{r.status}</Badge>
                            </div>
                            <p className="text-sm mt-2">{r.statusMessage}</p>
                            {r.update && <p className="text-sm mt-1 rounded-md bg-primary/5 border border-primary/20 px-3 py-2">Counselor update: {r.update}</p>}
                            {r.description && <p className="text-sm text-muted-foreground mt-2">{r.description}</p>}
                            {r.organization?.name && (
                                <p className="text-sm mt-2">
                                    <span className="font-medium">{r.organization.name}</span>
                                    {r.organization.contact && <> · <span className="tabular-nums">{r.organization.contact}</span></>}
                                    {r.organization.website && (
                                        <a href={r.organization.website} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-primary hover:underline">
                                            Website <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                        </a>
                                    )}
                                </p>
                            )}
                            {r.followUpDate && <p className="text-xs text-muted-foreground mt-1">Next follow-up: {new Date(r.followUpDate).toLocaleDateString()}</p>}
                            <label className="flex items-start gap-2 text-xs mt-3 text-muted-foreground">
                                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={r.userConsentToShare} disabled={state.busy === r.referralRef} onChange={(e) => setShare(r.referralRef, e.target.checked)} />
                                <span>I allow my counselor to share my name and contact details with this organisation for this referral. You can withdraw this at any time.</span>
                            </label>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    )
}
