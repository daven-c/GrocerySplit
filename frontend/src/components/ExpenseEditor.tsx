import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, Modal, AnimatedNumber, tap, tapFlat } from '../lib/motion';
import { useAppData } from '../lib/appData';
import { useAutosave } from '../lib/hooks';
import { getSession, updateSession, deleteSession, Session } from '../lib/api';
import { allocate } from '../lib/calc';
import { CATEGORIES, METHODS, SplitBy, SplitData, SplitMethod, categoryOf, convertSplit, splitExpense } from '../lib/expenses';
import { fmt, memberTones } from '../lib/people';
import { Avatar, Button, Card, DraftBar, Icon, SplitByTabs } from './ui';

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
const selectCls = 'h-[34px] px-2.5 border border-line rounded-lg bg-white text-sm font-semibold text-ink max-w-[190px]';
const UNIT: Record<SplitMethod, string> = { equal: '', exact: '$', percent: '%', shares: '×' };

export default function ExpenseEditor({ sessionId, narrow, onBack, onSaved, onDiscard, onSwitched }: ExpenseEditorProps) {
    const { me, groups, sessions: sharedSessions, refresh, patchSession } = useAppData();
    const [record, setRecord] = useState<Session | null>(null);
    const [name, setName] = useState('');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState('');
    const [category, setCategory] = useState('other');
    const [paidBy, setPaidBy] = useState('');
    const [method, setMethod] = useState<SplitMethod>('exact');
    // While true (amounts mode), amounts follow the total and are shared evenly among the people included.
    const [even, setEven] = useState(true);
    const [included, setIncluded] = useState<string[]>([]);
    const [values, setValues] = useState<Record<string, string>>({});
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [error, setError] = useState('');
    const savedMeta = useRef('');
    const savedSplit = useRef('');
    const legacyRef = useRef<{ method: SplitMethod; data: SplitData } | null>(null);
    const autosave = useAutosave(600);

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
            // Equal/shares expenses (from before those were removed) open as the same amounts, once members are known.
            const legacy = s.split_method === 'equal' || s.split_method === 'shares';
            const ids = Object.keys(data);
            const evenParts = allocate(Math.round((s.amount ?? 0) * 100), ids.map(() => 1));
            legacyRef.current = legacy ? { method: s.split_method!, data } : null;
            setMethod(legacy ? 'exact' : s.split_method ?? 'exact');
            setEven(s.split_method === 'equal' || (!legacy && (!s.split_method || s.split_method === 'exact') && ids.every((id, i) => Math.round((data[id] ?? 0) * 100) === evenParts[i])));
            setIncluded(ids);
            setValues(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])));
            savedMeta.current = JSON.stringify([s.name.trim() || 'Expense', s.session_date, s.category, s.paid_by ?? s.user_id ?? '']);
            savedSplit.current = JSON.stringify([s.amount ?? 0, s.split_method ?? 'exact', s.split_data ?? {}]);
        }).catch(err => !cancelled && setLoadError(err.message || 'Failed to load the expense'));
        return () => { cancelled = true; };
    }, [sessionId]);

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

    // Even amounts follow the total and who is included, until someone types an amount.
    const activeKey = active.join(',');
    useEffect(() => {
        if (method !== 'exact' || !even) return;
        const ids = activeKey ? activeKey.split(',') : [];
        const parts = allocate(Math.round(total * 100), ids.map(() => 1));
        setValues(Object.fromEntries(ids.map((id, i) => [id, String(parts[i] / 100)])));
    }, [method, even, total, activeKey]);

    // Mirror edits into the shared copy right away so balances elsewhere update immediately. The amount and split
    // are only mirrored while the split adds up, matching what will actually be saved.
    useEffect(() => {
        if (!record) return;
        patchSession(sessionId, s => ({
            ...s, name: name.trim() || s.name, session_date: date || s.session_date, category, paid_by: paidBy || s.paid_by,
            ...(split.valid ? { amount: total, split_method: method, split_data: data } : {}),
        }));
    }, [record, name, date, category, paidBy, total, method, data, split.valid, sessionId, patchSession, sharedSessions]);

    // Details (name, date, category, payer) always autosave. The amount and split only save when the split
    // adds up, so a half-edited split is never written; edits made meanwhile are not lost either.
    useEffect(() => {
        if (!record || record.draft) return; // a new draft saves when you press Save
        const metaSig = JSON.stringify([name.trim() || 'Expense', date || record.session_date, category, paidBy]);
        const splitSig = JSON.stringify([total, method, data]);
        const metaDirty = metaSig !== savedMeta.current;
        const splitDirty = split.valid && splitSig !== savedSplit.current;
        if (!metaDirty && !splitDirty) { autosave.cancel(); return; } // nothing to write (or only an invalid split)
        autosave.schedule(async () => {
            await updateSession(sessionId, {
                ...(metaDirty ? { name: name.trim() || 'Expense', session_date: date || record.session_date, category, ...(paidBy ? { paid_by: paidBy } : {}) } : {}),
                ...(splitDirty ? { amount: total, split_method: method, split_data: data } : {}),
            });
            if (metaDirty) savedMeta.current = metaSig;
            if (splitDirty) savedSplit.current = splitSig;
            void refresh();
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name, total, date, category, paidBy, method, data, record, split.valid]);

    // "By item" turns this into an itemized record; any items it had before are still there.
    const switchToItems = async () => {
        if (!record || saving) return;
        autosave.cancel();
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
    const pickSplitBy = (to: SplitBy) => (to === 'items' ? switchToItems() : changeMethod(to));

    const changeMethod = (to: SplitMethod) => {
        const next = convertSplit(method, to, data, total);
        setMethod(to);
        setEven(to === 'exact');
        setValues(Object.fromEntries(Object.entries(next).map(([k, v]) => [k, String(v)])));
    };

    const toggleMember = (id: string) => {
        if (active.includes(id)) {
            setIncluded(inc => inc.filter(i => i !== id));
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
    const payerLabel = paidBy === me ? 'you' : payer?.name ?? 'someone';
    const display = (id: string, n: string) => (id === me ? 'You' : n);
    const maxShare = Math.max(...Object.values(split.shares), 0.01);
    const status = record.draft
        ? { text: split.valid ? 'Not saved yet' : `Not saved yet: ${split.problem}`, bad: !split.valid }
        : !split.valid
        ? { text: `Not saved yet: ${split.problem}`, bad: true }
        : { text: autosave.state === 'saving' ? 'Saving…' : autosave.state === 'error' ? "Couldn't save changes" : autosave.state === 'saved' ? 'All changes saved' : 'Changes save automatically', bad: autosave.state === 'error' };
    const hint = METHODS.find(m => m.value === method)?.hint;

    return (
        <div className="max-w-[1080px] mx-auto flex flex-col gap-6">
            <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)}>
                <h3 className="m-0 mb-2 text-xl font-semibold">Delete expense?</h3>
                <p className="m-0 mb-6 text-muted leading-relaxed">This permanently deletes <strong className="text-ink">{name || 'this expense'}</strong> for everyone in the group.</p>
                <div className="flex gap-3">
                    <Button variant="secondary" wide height={42} onClick={() => setConfirmDelete(false)}>Cancel</Button>
                    <Button wide height={42} className="!bg-coral-strong hover:opacity-90" onClick={handleDelete}>Delete</Button>
                </div>
            </Modal>

            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-col gap-2 min-w-0 flex-1">
                    {!narrow && (
                        <motion.button {...tapFlat} onClick={onBack} className="self-start flex items-center gap-1 text-[13px] text-muted hover:text-ink"><Icon name="arrow_back" size={16} />{group.name}</motion.button>
                    )}
                    <input value={name} onChange={e => setName(e.target.value)} aria-label="Expense name" className="m-0 p-0 border-0 border-b border-dashed border-transparent hover:border-dash bg-transparent text-[30px] font-semibold tracking-title w-full max-w-[420px]" />
                    <span className="text-sm text-muted">{dateMeta(date)} · {categoryOf(category).label} · paid by {payerLabel}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-[13px] text-faint">Total</span>
                    <AnimatedNumber value={total} prefix="$" className="text-[34px] font-semibold tracking-[-0.03em]" />
                </div>
            </div>

            {record.draft && <DraftBar what="expense" canSave={split.valid} problem={split.valid ? null : split.problem} saving={saving} onSave={handleSaveDraft} onDiscard={onDiscard} />}

            {error && <p role="alert" className="m-0 text-[13px] text-coral-strong">{error}</p>}

            <div className="flex flex-wrap gap-6 items-start">
                <div className="flex-[999_1_440px] min-w-0 flex flex-col gap-3.5">
                    <Card className="p-5 flex flex-col gap-3">
                        <label htmlFor="amount" className="text-sm font-semibold">How much was it?</label>
                        <div className="flex items-center gap-2 h-14 px-4 border border-line rounded-xl bg-white focus-within:border-ink">
                            <span className="font-mono text-2xl text-faint">$</span>
                            <input id="amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="flex-1 min-w-0 border-0 bg-transparent font-mono text-[28px] font-medium text-ink" />
                        </div>
                    </Card>

                    <Card className="p-5 flex flex-col gap-4">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold">Split by</span>
                            <motion.button {...tapFlat} onClick={toggleEveryone} className="text-[13px] font-semibold text-body hover:text-ink underline underline-offset-[3px]">{everyone ? 'Clear everyone' : 'Select everyone'}</motion.button>
                        </div>
                        <SplitByTabs value={method} onChange={pickSplitBy} disabled={saving} />
                        <span className="text-[13px] text-muted -mt-1">{hint}</span>

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
                                            className="w-9 h-9 rounded-full grid place-items-center text-sm font-semibold p-0 shrink-0"
                                            style={{ background: on ? t.bg : 'transparent', color: on ? t.fg : '#B3AFA6', border: `1px ${on ? 'solid' : 'dashed'} ${on ? t.bg : '#CFCBC2'}` }}
                                        >
                                            {m.name[0].toUpperCase()}
                                        </motion.button>
                                        <span className={`flex-1 min-w-0 text-[15px] font-medium truncate ${on ? '' : 'text-ghost'}`}>{display(m.user_id, m.name)}</span>
                                        {on && (
                                            <span className="flex items-center gap-1 font-mono text-sm text-muted">
                                                {method === 'exact' && '$'}
                                                <input
                                                    aria-label={`${m.name} ${method === 'exact' ? 'amount' : method === 'percent' ? 'percent' : 'shares'}`}
                                                    inputMode="decimal"
                                                    value={values[m.user_id] ?? ''}
                                                    onChange={e => { setEven(false); setValues(v => ({ ...v, [m.user_id]: e.target.value })); }}
                                                    className="w-20 h-9 px-2 border border-line rounded-lg text-right font-mono text-sm text-ink bg-white"
                                                />
                                                {method !== 'exact' && UNIT[method]}
                                            </span>
                                        )}
                                        <span className={`w-[84px] text-right font-mono text-sm ${on ? 'font-medium' : 'text-ghost'}`}>{on ? fmt(split.shares[m.user_id] ?? 0) : '—'}</span>
                                    </div>
                                );
                            })}
                        </div>

                        <AnimatePresence initial={false} mode="popLayout">
                            <motion.div key={split.valid ? 'ok' : split.problem} layout initial={{ opacity: 0.8, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                                className={`flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-[13px] ${split.valid ? 'bg-green-tint text-green-on' : 'bg-coral-tint text-coral-on'}`} role="status">
                                <Icon name={split.valid ? 'check_circle' : 'error'} size={18} fill />
                                {split.valid ? `Adds up to ${fmt(total)}` : split.problem}
                            </motion.div>
                        </AnimatePresence>
                    </Card>
                </div>

                <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-3.5 min-[760px]:sticky min-[760px]:top-6">
                    <Card className="p-5 flex flex-col gap-4">
                        <span className="text-[15px] font-semibold">Who pays what</span>
                        {members.filter(m => active.includes(m.user_id)).map(m => {
                            const amt = split.shares[m.user_id] ?? 0;
                            const t = tones[m.user_id];
                            return (
                                <div key={m.user_id} className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2.5">
                                        <Avatar name={m.name} tone={t} size={28} />
                                        <span className="flex-1 flex flex-col">
                                            <span className="text-sm font-semibold">{display(m.user_id, m.name)}</span>
                                            <span className="text-xs text-faint">{m.user_id === paidBy ? 'paid the bill' : `owes ${payerLabel}`}</span>
                                        </span>
                                        <AnimatedNumber value={amt} prefix="$" className="font-mono text-sm font-medium" />
                                    </div>
                                    <div className="h-[3px] ml-[38px] rounded-sm bg-surface">
                                        <motion.div className="h-full rounded-sm opacity-55" style={{ background: t.fg }} initial={false} animate={{ width: `${(amt / maxShare) * 100}%` }} transition={{ duration: 0.25 }} />
                                    </div>
                                </div>
                            );
                        })}
                        {active.length === 0 && <span className="text-sm text-faint">Choose who shares this cost.</span>}
                        <div className="border-t border-rule pt-3.5 flex justify-between font-semibold text-[15px]"><span>Total</span><AnimatedNumber value={total} prefix="$" className="font-mono" /></div>
                        <p className="m-0 text-xs leading-normal text-faint">Pennies always add up: any leftover cent goes to one person rather than disappearing.</p>
                    </Card>

                    <Card className="px-5 py-4 flex flex-col gap-3">
                        <label className="flex items-center justify-between gap-3 text-sm text-body">Paid by
                            <select value={paidBy} onChange={e => setPaidBy(e.target.value)} className={selectCls}>
                                {!members.some(m => m.user_id === paidBy) && <option value="">Unknown</option>}
                                {members.map(m => <option key={m.user_id} value={m.user_id}>{m.user_id === me ? 'You' : m.name}</option>)}
                            </select>
                        </label>
                        <label className="flex items-center justify-between gap-3 text-sm text-body">Date
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-[34px] px-2.5 border border-line rounded-lg bg-white text-sm text-ink" />
                        </label>
                        <label className="flex items-center justify-between gap-3 text-sm text-body">Category
                            <select value={category} onChange={e => setCategory(e.target.value)} className={selectCls}>
                                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                            </select>
                        </label>
                        <div className="flex items-center justify-between pt-1 gap-3">
                            {record.draft ? <span /> : <motion.button {...tapFlat} onClick={() => setConfirmDelete(true)} className="text-[13px] font-semibold text-coral shrink-0">Delete expense</motion.button>}
                            <span className={`text-xs text-right ${status.bad ? 'text-coral' : 'text-faint'}`} aria-live="polite">{status.text}</span>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
