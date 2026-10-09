import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, Modal, AnimatedNumber, tap, tapFlat } from '../lib/motion';
import { useAppData } from '../lib/appData';
import { getSession, updateSession, deleteSession, Session } from '../lib/api';
import { allocate } from '../lib/calc';
import { CATEGORIES, METHODS, SplitData, SplitMethod, categoryOf, convertSplit, splitExpense } from '../lib/expenses';
import { fmt, memberTones } from '../lib/people';
import { Avatar, Button, Card, ChangesBar, DraftBar, Icon, SplitByTabs, cellCls, selectPillCls } from './ui';
import { toast } from './Toast';
import ReceiptPhotos from './ReceiptPhotos';

interface ExpenseEditorProps {
    sessionId: string;
    narrow: boolean;
    onBack: () => void;
    onSaved: () => void;
    onDiscard: () => void;
    /** The record changed between an itemized split and the other methods; reopen it in the right body. */
    onSwitched: (kind: 'receipt' | 'expense') => void;
}

const num = (s: string) => Math.max(0, parseFloat(s) || 0);
const dateMeta = (iso: string) => {
    const d = new Date(iso + 'T00:00');
    return iso && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date';
};
const UNIT: Record<SplitMethod, string> = { equal: '', exact: '$', percent: '%', shares: '×' };

export default function ExpenseEditor({ sessionId, narrow, onBack, onSaved, onDiscard, onSwitched }: ExpenseEditorProps) {
    const { me, groups, refresh } = useAppData();
    const [record, setRecord] = useState<Session | null>(null);
    const [name, setName] = useState('');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState('');
    const [category, setCategory] = useState('other');
    const [paidBy, setPaidBy] = useState('');
    const [method, setMethod] = useState<SplitMethod>('exact');
    // Amounts mode: anyone whose amount you typed is fixed; everyone else shares what is left, evenly.
    const [fixed, setFixed] = useState<string[]>([]);
    const [included, setIncluded] = useState<string[]>([]);
    const [values, setValues] = useState<Record<string, string>>({});
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [error, setError] = useState('');
    const savedMeta = useRef('');
    const savedSplit = useRef('');
    const legacyRef = useRef<{ method: SplitMethod; data: SplitData } | null>(null);
    const [reload, setReload] = useState(0); // bumped by Cancel to put the saved version back

    const group = groups.find(g => g.id === record?.group_id);
    const members = group?.members ?? [];
    const tones = useMemo(() => memberTones(members, me), [members, me]);

    useEffect(() => {
        let cancelled = false;
        getSession(sessionId).then(s => {
            if (cancelled) return;
            const data = s.split_data ?? {};
            setRecord(s);
            setName(s.name);
            setAmount(s.amount ? String(s.amount) : '');
            setDate(s.session_date);
            setCategory(s.category || 'other');
            setPaidBy(s.paid_by ?? s.user_id ?? '');
            // Equal/percent expenses (from before those were removed) open as the same amounts, once members are known.
            const legacy = s.split_method === 'equal' || s.split_method === 'percent';
            const ids = Object.keys(data);
            const evenParts = allocate(Math.round((s.amount ?? 0) * 100), ids.map(() => 1));
            legacyRef.current = legacy ? { method: s.split_method!, data } : null;
            setMethod(legacy ? 'exact' : s.split_method ?? 'exact');
            const isEven = s.split_method === 'equal' || (!legacy && (!s.split_method || s.split_method === 'exact') && ids.every((id, i) => Math.round((data[id] ?? 0) * 100) === evenParts[i]));
            setFixed(isEven ? [] : ids);
            setIncluded(ids);
            setValues(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])));
            savedMeta.current = JSON.stringify([s.name.trim() || 'Expense', s.session_date, s.category, s.paid_by ?? s.user_id ?? '']);
            savedSplit.current = JSON.stringify([s.amount ?? 0, s.split_method ?? 'exact', s.split_data ?? {}]);
        }).catch(err => !cancelled && setLoadError(err.message || 'Failed to load the expense'));
        return () => { cancelled = true; };
    }, [sessionId, reload]);

    // Someone who has left the group can't owe anything, so drop them (saving then cleans the stored split).
    const active = useMemo(() => {
        const ids = new Set(members.map(m => m.user_id));
        return ids.size ? included.filter(id => ids.has(id)) : included;
    }, [included, members]);
    const data: SplitData = useMemo(
        () => Object.fromEntries(active.map(id => [id, num(values[id] ?? '')])),
        [active, values]
    );
    const total = num(amount);
    const split = useMemo(() => splitExpense(total, method, data), [total, method, data]);

    // Convert an older equal/shares split into amounts, dropping anyone who has left. Nothing is written unless
    // someone was dropped (then the cleaned split is saved).
    useEffect(() => {
        const old = legacyRef.current;
        if (!old || !record || members.length === 0) return;
        legacyRef.current = null;
        const kept = Object.fromEntries(active.map(id => [id, old.data[id] ?? 0]));
        const shares = splitExpense(total, old.method, kept).shares;
        setValues(Object.fromEntries(active.map(id => [id, String(shares[id] ?? 0)])));
        savedSplit.current = active.length === Object.keys(old.data).length
            ? JSON.stringify([total, 'exact', Object.fromEntries(active.map(id => [id, shares[id] ?? 0]))])
            : '';
    }, [record, members, active, total]);

    // Amounts you typed stay put; the rest share what is left evenly, following the total and who is included.
    const activeKey = active.join(',');
    const fixedKey = fixed.join(',');
    const fixedTotal = active.reduce((sum, id) => sum + (fixed.includes(id) ? Math.round(num(values[id] ?? '') * 100) : 0), 0);
    useEffect(() => {
        if (method !== 'exact') return;
        const ids = activeKey ? activeKey.split(',') : [];
        const free = ids.filter(id => !fixedKey.split(',').includes(id));
        if (!free.length) return;
        const parts = allocate(Math.max(0, Math.round(total * 100) - fixedTotal), free.map(() => 1));
        setValues(v => {
            const next = { ...v };
            let changed = false;
            free.forEach((id, i) => { const t = String(parts[i] / 100); if (next[id] !== t) { next[id] = t; changed = true; } });
            return changed ? next : v;
        });
    }, [method, total, activeKey, fixedKey, fixedTotal]);

    // Existing expenses are edited in place but written only when you press Save (one entry in Activity per save);
    // Cancel puts the saved version back. A new draft has its own Save / Discard.
    const metaSig = JSON.stringify([name.trim() || 'Expense', date || record?.session_date, category, paidBy]);
    const splitSig = JSON.stringify([total, method, data]);
    const dirty = !!record && !record.draft && (metaSig !== savedMeta.current || splitSig !== savedSplit.current);

    const handleSaveChanges = async () => {
        if (!record || !dirty || !split.valid) return;
        setSaving(true);
        setError('');
        try {
            await updateSession(sessionId, {
                name: name.trim() || 'Expense', session_date: date || record.session_date, category, ...(paidBy ? { paid_by: paidBy } : {}),
                amount: total, split_method: method, split_data: data,
            });
            savedMeta.current = metaSig;
            savedSplit.current = splitSig;
            await refresh();
            toast('Changes saved');
        } catch (err: any) {
            setError(err.message || 'Could not save the changes');
        } finally {
            setSaving(false);
        }
    };

    // "By item" turns this into an itemized record; any items it had before are still there.
    const switchToItems = async () => {
        if (!record || saving) return;
        setSaving(true);
        setError('');
        try {
            await updateSession(sessionId, {
                kind: 'receipt', name: name.trim() || 'Expense', session_date: date || record.session_date, category,
                ...(paidBy ? { paid_by: paidBy } : {}), participants: members.map(m => m.name),
            });
            await refresh();
            onSwitched('receipt');
        } catch (err: any) {
            setError(err.message || 'Could not switch to splitting by item');
            setSaving(false);
        }
    };

    const changeMethod = (to: SplitMethod) => {
        const next = convertSplit(method, to, data, total);
        setMethod(to);
        setFixed(to === 'exact' && (method !== 'shares' || new Set(Object.values(data)).size <= 1) ? [] : Object.keys(next));
        setValues(Object.fromEntries(Object.entries(next).map(([k, v]) => [k, String(v)])));
    };

    const toggleMember = (id: string) => {
        if (active.includes(id)) {
            setIncluded(inc => inc.filter(i => i !== id));
            setFixed(f => f.filter(i => i !== id));
        } else {
            setIncluded(inc => [...inc, id]);
            setValues(v => ({ ...v, [id]: method === 'exact' || method === 'percent' ? '0' : '1' }));
        }
    };
    const everyone = members.length > 0 && members.every(m => active.includes(m.user_id));
    const toggleEveryone = () => {
        if (everyone) return setIncluded([]);
        setIncluded(members.map(m => m.user_id));
        setValues(v => ({ ...Object.fromEntries(members.map(m => [m.user_id, method === 'exact' || method === 'percent' ? '0' : '1'])), ...v }));
    };

    const handleSaveDraft = async () => {
        if (!record || !split.valid) return;
        setSaving(true);
        setError('');
        try {
            await updateSession(sessionId, {
                name: name.trim() || 'Expense', session_date: date || record.session_date, category, amount: total,
                ...(paidBy ? { paid_by: paidBy } : {}), split_method: method, split_data: data, draft: false,
            });
            await refresh();
            toast('Expense saved');
            onSaved();
        } catch (err: any) {
            setError(err.message || 'Could not save the expense');
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setConfirmDelete(false);
        try { await deleteSession(sessionId); await refresh(); onBack(); }
        catch (err: any) { setError(err.message || 'Could not delete the expense'); }
    };

    if (loadError) return <p className="text-center text-coral py-16">{loadError}</p>;
    if (!record || !group) return <p className="text-center text-faint py-16 animate-pulse">Loading expense…</p>;

    const payer = members.find(m => m.user_id === paidBy);
    const payerLabel = payer?.name ?? 'someone';
    const display = (_id: string, n: string) => n;
    const maxShare = Math.max(...Object.values(split.shares), 0.01);
    const hint = METHODS.find(m => m.value === method)?.hint;

    const labelCls2 = 'flex items-center justify-between gap-3 text-[14.5px] font-bold text-body';
    // Paid by / date / category / delete: the first card, above the cost.
    const details = (
        <div className="bg-wash rounded-[24px] py-4 px-[18px] flex flex-col gap-3">
            <label className={labelCls2}>Paid by
                <select value={paidBy} onChange={e => setPaidBy(e.target.value)} className={`${selectPillCls} max-w-[190px]`}>
                    {!members.some(m => m.user_id === paidBy) && <option value="">Unknown</option>}
                    {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                </select>
            </label>
            <label className={labelCls2}>Date
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-[38px] px-3 border-[1.5px] border-line rounded-full bg-white text-[14.5px] font-bold text-ink" />
            </label>
            <label className={labelCls2}>Category
                <select value={category} onChange={e => setCategory(e.target.value)} className={`${selectPillCls} max-w-[190px]`}>
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
            </label>
            {!record.draft && <motion.button {...tapFlat} onClick={() => setConfirmDelete(true)} className="self-start text-[13.5px] font-extrabold text-coral pt-1">Delete expense</motion.button>}
        </div>
    );

    return (
        <div className="max-w-[1080px] mx-auto flex flex-col gap-5">
            <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)}>
                <h3 className="m-0 mb-2 text-xl font-black">Delete expense?</h3>
                <p className="m-0 mb-6 text-muted font-semibold leading-relaxed">This permanently deletes <strong className="text-ink">{name || 'this expense'}</strong> for everyone in the group.</p>
                <div className="flex gap-3">
                    <Button variant="secondary" wide height={44} onClick={() => setConfirmDelete(false)}>Cancel</Button>
                    <Button wide height={44} className="!bg-coral-strong hover:opacity-90" onClick={handleDelete}>Delete</Button>
                </div>
            </Modal>

            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-col gap-2 min-w-0 flex-1">
                    {!narrow && (
                        <motion.button {...tapFlat} onClick={onBack} className="self-start h-[34px] pl-2 pr-3.5 flex items-center gap-1 rounded-full bg-soft text-[13.5px] font-extrabold text-body"><Icon name="arrow_back" size={17} />{group.personal ? 'Personal' : group.name}</motion.button>
                    )}
                    <input value={name} onChange={e => setName(e.target.value)} aria-label="Expense name" className="m-0 p-0 border-0 border-b-2 border-dashed border-transparent hover:border-line bg-transparent text-[32px] font-black tracking-title w-full max-w-[440px]" />
                    <span className="text-[14.5px] font-semibold text-muted">{dateMeta(date)} · {categoryOf(category).label} · paid by {payerLabel}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-[13.5px] font-bold text-faint">Total</span>
                    <AnimatedNumber value={total} prefix="$" className="text-4xl font-black tracking-[-0.03em] leading-[1.1]" />
                </div>
            </div>

            {record.draft && <DraftBar what="expense" canSave={split.valid} problem={split.valid ? null : split.problem} saving={saving} onSave={handleSaveDraft} onDiscard={onDiscard} />}
            {dirty && <ChangesBar canSave={split.valid} problem={split.valid ? null : split.problem} saving={saving} onSave={handleSaveChanges} onCancel={() => setReload(r => r + 1)} />}

            {error && <p role="alert" className="m-0 text-[13.5px] font-bold text-coral-strong">{error}</p>}

            <div className="flex flex-wrap gap-5 items-start">
                <div className="flex-[999_1_440px] min-w-0 flex flex-col gap-3.5">
                    {details}

                    <Card className="p-5 flex flex-col gap-4">
                        <label htmlFor="amount" className="text-base font-black">How much was it?</label>
                        <div className="flex items-center gap-1.5 h-[68px] px-[22px] rounded-[22px] bg-wash">
                            <span className="text-[30px] font-black text-ghost">$</span>
                            <input id="amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="flex-1 min-w-0 border-0 bg-transparent text-[34px] font-black tracking-[-0.02em] text-ink" />
                        </div>
                    </Card>

                    <Card className="p-5 flex flex-col gap-3.5">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <span className="text-base font-black">Split it</span>
                            <SplitByTabs value={method} onChange={changeMethod} disabled={saving} />
                        </div>
                        <span className="text-[13.5px] font-semibold text-muted -mt-1">{hint}</span>

                        <div className="flex flex-col">
                            {members.map((m, i) => {
                                const on = active.includes(m.user_id);
                                const t = tones[m.user_id];
                                return (
                                    <div key={m.user_id} className={`flex items-center gap-3 py-2.5 ${i ? 'border-t border-rule' : ''}`}>
                                        <motion.button
                                            {...tap}
                                            aria-pressed={on}
                                            aria-label={`${m.name} is in on this`}
                                            onClick={() => toggleMember(m.user_id)}
                                            className="w-10 h-10 rounded-full grid place-items-center text-[15px] font-black p-0 shrink-0"
                                            style={{ background: on ? t.bg : '#fff', color: on ? t.fg : '#C2B8AC', border: `1.5px ${on ? 'solid' : 'dashed'} ${on ? t.bg : '#E3DBD0'}` }}
                                        >
                                            {m.name[0].toUpperCase()}
                                        </motion.button>
                                        <span className={`flex-1 min-w-0 text-[15.5px] font-extrabold truncate ${on ? '' : 'text-ghost'}`}>{display(m.user_id, m.name)}</span>
                                        {on && (
                                            <span className="flex items-center gap-1 text-sm font-extrabold text-muted">
                                                {method === 'exact' && '$'}
                                                <input
                                                    aria-label={`${m.name} ${method === 'exact' ? 'amount' : method === 'percent' ? 'percent' : 'shares'}`}
                                                    inputMode="decimal"
                                                    value={values[m.user_id] ?? ''}
                                                    onChange={e => { setFixed(f => f.includes(m.user_id) ? f : [...f, m.user_id]); setValues(v => ({ ...v, [m.user_id]: e.target.value })); }}
                                                    className={`w-[84px] !h-[38px] ${cellCls}`}
                                                />
                                                {method !== 'exact' && UNIT[method]}
                                            </span>
                                        )}
                                        <span className={`w-[84px] text-right text-[15.5px] ${on ? 'font-black' : 'font-bold text-ghost'}`}>{on ? fmt(split.shares[m.user_id] ?? 0) : '—'}</span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex items-center justify-between gap-2.5 flex-wrap">
                            <AnimatePresence initial={false} mode="popLayout">
                                <motion.div key={split.valid ? 'ok' : split.problem} layout initial={{ opacity: 0.8, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                                    className={`flex items-center gap-2 px-3.5 py-2.5 rounded-full text-sm font-extrabold ${split.valid ? 'bg-green-tint text-[oklch(0.4_0.12_155)]' : 'bg-coral-tint text-[oklch(0.45_0.15_32)]'}`} role="status">
                                    <Icon name={split.valid ? 'check_circle' : 'error'} size={18} fill />
                                    {split.valid ? `Adds up to ${fmt(total)}` : split.problem}
                                </motion.div>
                            </AnimatePresence>
                            <motion.button {...tapFlat} onClick={toggleEveryone} className="text-[13.5px] font-extrabold text-body underline underline-offset-[3px]">{everyone ? 'Clear everyone' : 'Select everyone'}</motion.button>
                        </div>
                    </Card>
                </div>

                <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-3.5 min-[760px]:sticky min-[760px]:top-6">
                    <Card className="p-5 flex flex-col gap-4">
                        <span className="text-lg font-black">Who pays what</span>
                        {members.filter(m => active.includes(m.user_id)).map(m => {
                            const amt = split.shares[m.user_id] ?? 0;
                            const t = tones[m.user_id];
                            return (
                                <div key={m.user_id} className="flex items-center gap-3">
                                    <Avatar name={m.name} tone={t} size={36} />
                                    <span className="flex-1 flex flex-col gap-[5px]">
                                        <span className="flex justify-between"><span className="text-[15px] font-extrabold">{display(m.user_id, m.name)}</span><AnimatedNumber value={amt} prefix="$" className="text-[15.5px] font-black" /></span>
                                        <span className="h-1.5 rounded-[3px] bg-soft"><motion.span className="block h-full rounded-[3px] opacity-50" style={{ background: t.fg }} initial={false} animate={{ width: `${(amt / maxShare) * 100}%` }} transition={{ duration: 0.25 }} /></span>
                                        <span className="text-[12.5px] font-bold text-faint">{m.user_id === paidBy ? 'paid the bill' : `owes ${payerLabel}`}</span>
                                    </span>
                                </div>
                            );
                        })}
                        {active.length === 0 && <span className="text-sm font-bold text-faint">Choose who shares this cost.</span>}
                        <div className="border-t border-rule pt-3.5 flex justify-between text-[17px] font-black"><span>Total</span><AnimatedNumber value={total} prefix="$" /></div>
                        <p className="m-0 text-[13px] font-semibold leading-[1.5] text-faint">Pennies always add up: any leftover cent goes to one person rather than disappearing.</p>
                    </Card>

                    {record && <Card className="p-5"><ReceiptPhotos sessionId={sessionId} groupId={record.group_id} /></Card>}

                    <div className="border-[1.5px] border-dashed border-line rounded-[24px] py-4 px-[18px] flex flex-col gap-2.5">
                        <span className="text-[15px] font-black">Have a receipt with items?</span>
                        <span className="text-[13.5px] font-semibold text-muted leading-[1.45]">Tap who had each item instead of splitting one total. Tax and tip are shared by what each person had.</span>
                        <Button variant="secondary" height={38} className="self-start px-4 text-sm" disabled={saving} onClick={switchToItems}>Split by item</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
