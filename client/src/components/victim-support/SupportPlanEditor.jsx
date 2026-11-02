import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, Select } from '@/components/ui/field'
import { Notice } from '@/components/ui/notice'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Lock } from 'lucide-react'
import api, { errorMessage } from '@/lib/api'
import { PLAN_STATUS_TONE } from './vsConstants'

const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '')

function ItemEditor({ plan, item, options, onSaved }) {
    const isExternal = options.externalCategories.includes(item.category)
    const [form, setForm] = useState({
        status: item.status,
        description: item.description || '',
        organization: item.referral?.organization || '',
        contactInfo: item.referral?.contactInfo || '',
        confirmed: !!item.externalConfirmation?.confirmed,
        confirmationNote: item.externalConfirmation?.note || '',
        followUpDate: toDateInput(item.followUpDate),
        privateNote: item.privateNote || '',
    })
    const [state, setState] = useState({ saving: false, error: '', msg: '' })
    const [open, setOpen] = useState(false)

    const save = async (e) => {
        e.preventDefault()
        setState({ saving: true, error: '', msg: '' })
        try {
            const { data } = await api.patch(`/counselor/support-plans/${plan._id}/items/${item._id}`, {
                status: form.status,
                description: form.description,
                referral: { organization: form.organization, contactInfo: form.contactInfo },
                externalConfirmation: { confirmed: form.confirmed, note: form.confirmationNote },
                followUpDate: form.followUpDate || null,
                privateNote: form.privateNote,
            })
            setState({ saving: false, error: '', msg: 'Saved' })
            onSaved(data.data)
        } catch (err) {
            setState({ saving: false, error: errorMessage(err), msg: '' })
        }
    }

    return (
        <li className="rounded-lg border border-border p-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                    <p className="font-medium text-sm">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.category}{isExternal && ' · external service'}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge tone={PLAN_STATUS_TONE[item.status]}>{item.status}{item.status === 'Completed' && item.externalConfirmation?.confirmed ? ' · confirmed' : ''}</Badge>
                    <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? 'Close' : 'Update'}</Button>
                </div>
            </div>
            {open && (
                <form onSubmit={save} className="mt-3 grid sm:grid-cols-2 gap-3">
                    <Field id={`st-${item._id}`} label="Status">
                        <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                            {options.itemStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                        </Select>
                    </Field>
                    <Field id={`fu-${item._id}`} label="Follow-up date">
                        <Input type="date" value={form.followUpDate} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} />
                    </Field>
                    <Field id={`ds-${item._id}`} label="Description (visible to the user)" className="sm:col-span-2">
                        <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={1000} />
                    </Field>
                    <Field id={`org-${item._id}`} label="Referred to (organisation)">
                        <Input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} maxLength={140} />
                    </Field>
                    <Field id={`ct-${item._id}`} label="Referral contact info">
                        <Input value={form.contactInfo} onChange={(e) => setForm({ ...form, contactInfo: e.target.value })} maxLength={200} />
                    </Field>
                    {isExternal && (
                        <div className="sm:col-span-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
                            <label className="flex items-start gap-2 text-sm">
                                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.confirmed} onChange={(e) => setForm({ ...form, confirmed: e.target.checked })} />
                                <span>Delivery of this external service has been confirmed<span className="block text-xs text-muted-foreground">Required before marking it Completed. Never mark a referral complete on assumption.</span></span>
                            </label>
                            <Input placeholder="Who confirmed it and how (e.g. user confirmed by phone on 12 Oct)" value={form.confirmationNote} onChange={(e) => setForm({ ...form, confirmationNote: e.target.value })} maxLength={500} aria-label="Confirmation note" />
                        </div>
                    )}
                    <Field id={`pn-${item._id}`} label={<span className="inline-flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> Private counselor note (never shown to the user)</span>} className="sm:col-span-2">
                        <Textarea rows={2} value={form.privateNote} onChange={(e) => setForm({ ...form, privateNote: e.target.value })} maxLength={2000} />
                    </Field>
                    <div className="sm:col-span-2 flex items-center gap-3">
                        <Button type="submit" size="sm" disabled={state.saving}>{state.saving ? 'Saving...' : 'Save item'}</Button>
                        {state.msg && <span className="text-xs text-green-600">{state.msg}</span>}
                    </div>
                    {state.error && <Notice type="error" className="sm:col-span-2">{state.error}</Notice>}
                </form>
            )}
        </li>
    )
}

function NewItemRow({ value, onChange, onRemove, options, index }) {
    return (
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <Field id={`ni-cat-${index}`} label="Category">
                <Select value={value.category} onChange={(e) => onChange({ ...value, category: e.target.value })}>
                    {options.supportCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
            </Field>
            <Field id={`ni-title-${index}`} label="Title">
                <Input value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} maxLength={140} placeholder="e.g. Weekly counseling sessions" />
            </Field>
            {onRemove ? <Button type="button" size="icon" variant="ghost" onClick={onRemove} aria-label="Remove item"><Trash2 className="w-4 h-4" /></Button> : <span />}
            <Field id={`ni-desc-${index}`} label="Description (visible to the user)" className="sm:col-span-3">
                <Input value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} maxLength={1000} />
            </Field>
        </div>
    )
}

const blankItem = (options) => ({ category: options.supportCategories[0], title: '', description: '', status: 'Suggested' })

export function CreatePlanForm({ caseRef, options, onCreated }) {
    const [title, setTitle] = useState('')
    const [summary, setSummary] = useState('')
    const [items, setItems] = useState([blankItem(options)])
    const [state, setState] = useState({ saving: false, error: '' })

    const submit = async (e) => {
        e.preventDefault()
        setState({ saving: true, error: '' })
        try {
            const { data } = await api.post(`/counselor/cases/${caseRef}/support-plans`, {
                title, summary, items: items.filter((i) => i.title.trim()),
            })
            setTitle(''); setSummary(''); setItems([blankItem(options)])
            setState({ saving: false, error: '' })
            onCreated(data.data)
        } catch (err) {
            setState({ saving: false, error: errorMessage(err) })
        }
    }

    return (
        <Card className="p-5 bg-card/50 backdrop-blur border-primary/30">
            <h3 className="font-semibold mb-3">Create a support plan</h3>
            <form onSubmit={submit} className="space-y-4">
                <Field id="plan-title" label="Plan title" required>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="e.g. Safety and recovery plan" />
                </Field>
                <Field id="plan-summary" label="Summary (visible to the user)">
                    <Textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} />
                </Field>
                <div className="space-y-4">
                    <p className="text-sm font-medium">Support items</p>
                    {items.map((it, i) => (
                        <NewItemRow key={i} index={i} value={it} options={options}
                            onChange={(v) => setItems(items.map((x, j) => (j === i ? v : x)))}
                            onRemove={items.length > 1 ? () => setItems(items.filter((_, j) => j !== i)) : null} />
                    ))}
                    <Button type="button" size="sm" variant="outline" onClick={() => setItems([...items, blankItem(options)])}><Plus className="w-4 h-4 mr-1" /> Add item</Button>
                </div>
                {state.error && <Notice type="error">{state.error}</Notice>}
                <Button type="submit" disabled={state.saving || !title.trim()}>{state.saving ? 'Creating...' : 'Create plan'}</Button>
            </form>
        </Card>
    )
}

export function SupportPlanCard({ plan, options, onUpdated }) {
    const [newItem, setNewItem] = useState(null)
    const [state, setState] = useState({ saving: false, error: '' })

    const addItem = async () => {
        setState({ saving: true, error: '' })
        try {
            const { data } = await api.post(`/counselor/support-plans/${plan._id}/items`, newItem)
            setNewItem(null)
            setState({ saving: false, error: '' })
            onUpdated(data.data)
        } catch (err) {
            setState({ saving: false, error: errorMessage(err) })
        }
    }

    const setStatus = async (status) => {
        try {
            const { data } = await api.patch(`/counselor/support-plans/${plan._id}`, { status })
            onUpdated(data.data)
        } catch (err) {
            setState({ saving: false, error: errorMessage(err) })
        }
    }

    return (
        <Card className="p-5 bg-card/50 backdrop-blur border-border">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                <div>
                    <h3 className="font-semibold text-lg">{plan.title}</h3>
                    <p className="text-xs text-muted-foreground">Updated {new Date(plan.updatedAt).toLocaleString()}{plan.isSynthetic && ' · Synthetic'}</p>
                    {plan.summary && <p className="text-sm text-muted-foreground mt-2">{plan.summary}</p>}
                </div>
                <label className="text-sm shrink-0">Plan status
                    <Select className="mt-1 w-36" value={plan.status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                        <option value="archived">Archived</option>
                    </Select>
                </label>
            </div>
            <ul className="space-y-2">
                {plan.items.map((item) => <ItemEditor key={item._id + item.updatedAt} plan={plan} item={item} options={options} onSaved={onUpdated} />)}
            </ul>
            <div className="mt-4">
                {newItem ? (
                    <div className="space-y-3 rounded-lg border border-border p-3">
                        <NewItemRow index="new" value={newItem} options={options} onChange={setNewItem} onRemove={() => setNewItem(null)} />
                        <Button size="sm" onClick={addItem} disabled={state.saving || !newItem.title.trim()}>{state.saving ? 'Adding...' : 'Add to plan'}</Button>
                    </div>
                ) : (
                    <Button size="sm" variant="outline" onClick={() => setNewItem(blankItem(options))}><Plus className="w-4 h-4 mr-1" /> Add support item</Button>
                )}
                {state.error && <Notice type="error" className="mt-3">{state.error}</Notice>}
            </div>
        </Card>
    )
}
