import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, Select } from '@/components/ui/field'
import { Notice, EmptyState } from '@/components/ui/notice'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, Link2Off, Lock, Plus, Send, ShieldCheck } from 'lucide-react'
import api, { errorMessage } from '@/lib/api'
import { REFERRAL_STATUSES, REFERRAL_STATUS_TONE } from './vsConstants'

const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '')

function DirectoryHint({ entry }) {
    if (!entry) return null
    return (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1">
            <p><span className="font-medium">{entry.name}</span> · <span className="tabular-nums">{entry.phone}</span></p>
            <p className="flex flex-wrap items-center gap-2">
                <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Official source <ExternalLink className="w-3 h-3" /></a>
                <Badge tone={entry.verification.status === 'verified' ? 'green' : 'amber'}>{entry.verification.status === 'verified' ? `Verified ${entry.verification.checkedOn}` : 'Not re-verified'}</Badge>
                <Badge tone="neutral"><Link2Off className="w-3 h-3" /> {entry.integration.available ? 'Integration connected' : 'No integration – contact manually'}</Badge>
            </p>
            {entry.verification.note && <p className="text-muted-foreground">{entry.verification.note}</p>}
        </div>
    )
}

function CreateReferralForm({ caseRef, directory, categories, supportPlans, onCreated }) {
    const blank = { category: categories[0] || '', title: '', description: '', directoryId: '', orgName: '', orgContact: '', orgWebsite: '', followUpDate: '', userVisibleUpdate: '', counselorNote: '', supportPlanId: '' }
    const [form, setForm] = useState(blank)
    const [state, setState] = useState({ saving: false, error: '' })
    const entry = directory.find((d) => d.id === form.directoryId)
    const suggested = directory.filter((d) => d.categories.includes(form.category))

    const submit = async (e) => {
        e.preventDefault()
        setState({ saving: true, error: '' })
        try {
            const { data } = await api.post(`/counselor/cases/${caseRef}/referrals`, {
                category: form.category,
                title: form.title,
                description: form.description,
                organization: form.directoryId ? { directoryId: form.directoryId } : { name: form.orgName, contact: form.orgContact, website: form.orgWebsite },
                followUpDate: form.followUpDate || undefined,
                userVisibleUpdate: form.userVisibleUpdate,
                counselorNote: form.counselorNote,
                supportPlanId: form.supportPlanId || undefined,
            })
            setForm(blank)
            setState({ saving: false, error: '' })
            onCreated(data.data)
        } catch (err) {
            setState({ saving: false, error: errorMessage(err) })
        }
    }

    return (
        <Card className="p-5 bg-card/50 backdrop-blur border-primary/30">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Plus className="w-4 h-4 text-primary" /> New referral</h3>
            <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
                <Field id="rf-category" label="Category" required>
                    <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </Select>
                </Field>
                <Field id="rf-title" label="Title" required>
                    <Input value={form.title} maxLength={140} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Free legal aid consultation" />
                </Field>
                <Field id="rf-org" label="Organisation" className="sm:col-span-2" hint={suggested.length ? `Suggested for this category: ${suggested.map((d) => d.name).join(', ')}` : undefined}>
                    <Select value={form.directoryId} onChange={(e) => setForm({ ...form, directoryId: e.target.value })}>
                        <option value="">Other organisation (enter details)</option>
                        {directory.map((d) => <option key={d.id} value={d.id}>{d.name} – {d.phone}</option>)}
                    </Select>
                </Field>
                {entry ? <div className="sm:col-span-2"><DirectoryHint entry={entry} /></div> : (
                    <>
                        <Field id="rf-org-name" label="Organisation name">
                            <Input value={form.orgName} maxLength={140} onChange={(e) => setForm({ ...form, orgName: e.target.value })} />
                        </Field>
                        <Field id="rf-org-contact" label="Contact (phone / email)">
                            <Input value={form.orgContact} maxLength={200} onChange={(e) => setForm({ ...form, orgContact: e.target.value })} />
                        </Field>
                        <Field id="rf-org-web" label="Website" className="sm:col-span-2">
                            <Input value={form.orgWebsite} maxLength={300} placeholder="https://" onChange={(e) => setForm({ ...form, orgWebsite: e.target.value })} />
                        </Field>
                    </>
                )}
                <Field id="rf-desc" label="Description (visible to the user)" className="sm:col-span-2">
                    <Textarea rows={2} maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </Field>
                <Field id="rf-update" label="Short update for the user (optional)" className="sm:col-span-2">
                    <Input maxLength={300} value={form.userVisibleUpdate} onChange={(e) => setForm({ ...form, userVisibleUpdate: e.target.value })} />
                </Field>
                <Field id="rf-followup" label="Follow-up date">
                    <Input type="date" value={form.followUpDate} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} />
                </Field>
                <Field id="rf-plan" label="Link to support plan (optional)">
                    <Select value={form.supportPlanId} onChange={(e) => setForm({ ...form, supportPlanId: e.target.value })}>
                        <option value="">Not linked</option>
                        {supportPlans.map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}
                    </Select>
                </Field>
                <Field id="rf-note" label={<span className="inline-flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> Private counselor note</span>} className="sm:col-span-2">
                    <Textarea rows={2} maxLength={2000} value={form.counselorNote} onChange={(e) => setForm({ ...form, counselorNote: e.target.value })} />
                </Field>
                {state.error && <Notice type="error" className="sm:col-span-2">{state.error}</Notice>}
                <div className="sm:col-span-2">
                    <Button type="submit" disabled={state.saving || !form.title.trim()}>{state.saving ? 'Creating...' : 'Create referral'}</Button>
                </div>
            </form>
        </Card>
    )
}

export function ReferralCard({ referral, onUpdated, showCase = false }) {
    const [form, setForm] = useState({ status: referral.status, outcomeNote: '', unableReason: '', followUpDate: toDateInput(referral.followUpDate), userVisibleUpdate: referral.userVisibleUpdate })
    const [note, setNote] = useState('')
    const [state, setState] = useState({ saving: false, error: '', msg: '' })
    const [open, setOpen] = useState(false)
    const closed = ['Completed', 'Unable to Connect'].includes(referral.status)

    const save = async (e) => {
        e.preventDefault()
        setState({ saving: true, error: '', msg: '' })
        const body = {}
        if (form.status !== referral.status) body.status = form.status
        if (form.status === 'Completed') body.outcomeNote = form.outcomeNote
        if (form.status === 'Unable to Connect') body.unableReason = form.unableReason
        if (form.followUpDate !== toDateInput(referral.followUpDate)) body.followUpDate = form.followUpDate || null
        if (form.userVisibleUpdate !== referral.userVisibleUpdate) body.userVisibleUpdate = form.userVisibleUpdate
        try {
            const { data } = await api.patch(`/counselor/referrals/${referral._id}`, body)
            setState({ saving: false, error: '', msg: data.message })
            onUpdated(data.data)
        } catch (err) {
            setState({ saving: false, error: errorMessage(err), msg: '' })
        }
    }
    const addNote = async () => {
        setState({ saving: true, error: '', msg: '' })
        try {
            const { data } = await api.post(`/counselor/referrals/${referral._id}/notes`, { note })
            setNote('')
            setState({ saving: false, error: '', msg: data.message })
            onUpdated(data.data)
        } catch (err) {
            setState({ saving: false, error: errorMessage(err), msg: '' })
        }
    }

    return (
        <Card className="p-4 bg-card/50 backdrop-blur border-border">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-semibold flex flex-wrap items-center gap-2">
                        {referral.title}
                        <span className="text-xs font-normal text-muted-foreground">{referral.referralRef}{showCase && ` · ${referral.caseRef}`}</span>
                        {referral.followUpDue && <Badge tone="amber">Follow-up due</Badge>}
                        {referral.isSynthetic && <Badge tone="blue">Synthetic</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">{referral.category} · created {new Date(referral.createdAt).toLocaleDateString()}{referral.followUpDate && ` · follow-up ${new Date(referral.followUpDate).toLocaleDateString()}`}</p>
                    {referral.organization?.name && (
                        <p className="text-sm mt-1">
                            {referral.organization.name}{referral.organization.contact && ` · ${referral.organization.contact}`}
                            {referral.organization.website && <a href={referral.organization.website} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary hover:underline inline-flex items-center gap-1">site <ExternalLink className="w-3 h-3" /></a>}
                        </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1"><Link2Off className="w-3 h-3" /> {referral.integration?.available ? referral.integration.label : 'External integration: not connected (manual referral)'}</span>
                        <span className="inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> User permission to share details: {referral.userConsentToShare ? 'given' : 'not given'}</span>
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Badge tone={REFERRAL_STATUS_TONE[referral.status]}>{referral.status}</Badge>
                    <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? 'Close' : 'Manage'}</Button>
                </div>
            </div>
            {open && (
                <div className="mt-4 grid lg:grid-cols-2 gap-5">
                    <form onSubmit={save} className="space-y-3">
                        <Field id={`rs-${referral._id}`} label="Status">
                            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                                {REFERRAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </Select>
                        </Field>
                        {form.status === 'Completed' && referral.status !== 'Completed' && (
                            <Field id={`ro-${referral._id}`} label="How was completion confirmed? (private, required)">
                                <Input value={form.outcomeNote} maxLength={1000} onChange={(e) => setForm({ ...form, outcomeNote: e.target.value })} placeholder="e.g. User confirmed by phone the appointment took place" />
                            </Field>
                        )}
                        {form.status === 'Unable to Connect' && referral.status !== 'Unable to Connect' && (
                            <Field id={`ru-${referral._id}`} label="Why could the connection not be made? (private, required)">
                                <Input value={form.unableReason} maxLength={1000} onChange={(e) => setForm({ ...form, unableReason: e.target.value })} />
                            </Field>
                        )}
                        <Field id={`rf-${referral._id}`} label="Follow-up date">
                            <Input type="date" value={form.followUpDate} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} />
                        </Field>
                        <Field id={`rv-${referral._id}`} label="Update visible to the user">
                            <Input value={form.userVisibleUpdate} maxLength={300} onChange={(e) => setForm({ ...form, userVisibleUpdate: e.target.value })} />
                        </Field>
                        <Button type="submit" size="sm" disabled={state.saving}>Save referral</Button>
                        {closed && referral.outcome?.note && <p className="text-xs text-muted-foreground">Completion confirmed: {referral.outcome.note}</p>}
                        {referral.unableReason && <p className="text-xs text-muted-foreground">Unable to connect: {referral.unableReason}</p>}
                    </form>
                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> Private counselor notes</h4>
                        {referral.counselorNotes.length === 0 ? <p className="text-xs text-muted-foreground">No notes yet.</p> : (
                            <ul className="space-y-2 max-h-40 overflow-y-auto">
                                {referral.counselorNotes.map((n) => (
                                    <li key={n._id} className="rounded-md bg-muted/50 p-2 text-sm">
                                        <p className="whitespace-pre-wrap">{n.note}</p>
                                        <p className="text-[11px] text-muted-foreground">{n.authorName} · {new Date(n.createdAt).toLocaleString()}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <Textarea rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a private note (never shown to the user)" aria-label="Private referral note" />
                        <Button size="sm" variant="outline" onClick={addNote} disabled={state.saving || !note.trim()}>Add note</Button>
                        <div>
                            <h4 className="text-sm font-semibold mb-1">Status history</h4>
                            <ul className="text-xs text-muted-foreground space-y-0.5">
                                {referral.statusHistory.map((h, i) => <li key={i}>{new Date(h.changedAt).toLocaleString()}: {h.from ? `${h.from} → ` : ''}{h.to}</li>)}
                            </ul>
                        </div>
                    </div>
                    {state.error && <Notice type="error" className="lg:col-span-2">{state.error}</Notice>}
                    {state.msg && <Notice type="success" className="lg:col-span-2">{state.msg}</Notice>}
                </div>
            )}
        </Card>
    )
}

/** Referral management for one case (counselor case page). */
export default function ReferralManager({ caseRef, referrals, categories, supportPlans, canCreate, onChanged }) {
    const [directory, setDirectory] = useState([])
    const [error, setError] = useState('')

    useEffect(() => {
        api.get('/counselor/referral-directory')
            .then(({ data }) => setDirectory(data.data.directory))
            .catch((err) => setError(errorMessage(err)))
    }, [])

    return (
        <div className="space-y-4">
            <Notice type="info" title="External integrations are not connected">
                No official government or helpline API is connected to Lumina. Refer people manually using the official contact details below, record progress here,
                and only share a person's details with an organisation when they have given permission.
            </Notice>
            {error && <Notice type="error">{error}</Notice>}
            {referrals.length === 0
                ? <Card className="bg-card/50 backdrop-blur border-border"><EmptyState icon={Send} title="No referrals for this case yet" /></Card>
                : referrals.map((r) => <ReferralCard key={r._id + r.updatedAt} referral={r} onUpdated={onChanged} />)}
            {canCreate && <CreateReferralForm caseRef={caseRef} directory={directory} categories={categories} supportPlans={supportPlans} onCreated={onChanged} />}
        </div>
    )
}
