import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, Modal, AnimatedNumber, spring, tapFlat, tap } from '../lib/motion';
import { useAppData } from '../lib/appData';
import { useAutosave } from '../lib/hooks';
import { getSession, updateSession, addItem, updateItem, deleteItem, deleteSession, Item, Session } from '../lib/api';
import { computeSplit } from '../lib/calc';
import { CATEGORIES, SplitMethod, convertSplit, everyoneEqual } from '../lib/expenses';
import { fmt, memberTones } from '../lib/people';
import { Avatar, Button, Card, DraftBar, Icon, SplitByTabs } from './ui';

interface SplitProps {
    sessionId: string;
    narrow: boolean;
    onBack: () => void;
    onImport: () => void;
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

const smallInput = 'w-16 h-7 px-1.5 border border-edge rounded-md text-right font-mono text-sm bg-wash';
const selectCls = 'h-[34px] px-2.5 border border-line rounded-lg bg-white text-sm font-semibold text-ink max-w-[190px]';

export default function Split({ sessionId, narrow, onBack, onImport, onSaved, onDiscard, onSwitched }: SplitProps) {
    const { me, groups, sessions: sharedSessions, refresh, patchSession } = useAppData();
    const [record, setRecord] = useState<Session | null>(null);
    const [items, setItems] = useState<Item[]>([]);
    const [name, setName] = useState('');
    const [date, setDate] = useState('');
    const [tax, setTax] = useState('');
    const [tip, setTip] = useState('');
    const [paidBy, setPaidBy] = useState('');
    const [category, setCategory] = useState('groceries');
    const [paint, setPaint] = useState<string | null>(null);
    const [editing, setEditing] = useState<{ id: string; name: string; price: string } | null>(null);
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const baseline = useRef('');
    const autosave = useAutosave(600);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const group = groups.find(g => g.id === record?.group_id);
    const members = group?.members ?? [];
    const names = useMemo(() => members.map(m => m.name), [members]);
    const tones = useMemo(() => memberTones(members, me), [members, me]);

    const flash = (message: string, type: 'success' | 'error' = 'error') => {
        setToast({ message, type });
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 3500);
    };

    // Load the receipt. Everyone in the group is on every receipt, so keep the stored list in step.
    useEffect(() => {
        let cancelled = false;
        getSession(sessionId).then(s => {
            if (cancelled) return;
            setRecord(s);
            setItems(s.items);
            setName(s.name);
            setDate(s.session_date);
            setTax(s.tax ? String(s.tax) : '');
            setTip(s.tip ? String(s.tip) : '');
            setPaidBy(s.paid_by ?? s.user_id ?? '');
            setCategory(s.category || 'groceries');
            baseline.current = JSON.stringify([s.name, s.session_date, s.tax || 0, s.tip || 0, s.paid_by ?? s.user_id ?? '', s.category || 'groceries']);
        }).catch(err => !cancelled && setLoadError(err.message || 'Failed to load the receipt'));
        return () => { cancelled = true; };
    }, [sessionId]);

    useEffect(() => {
        if (!record || !group) return;
        const everyone = group.members.map(m => m.name);
        if (everyone.length !== record.participants.length || everyone.some(n => !record.participants.includes(n))) {
            // Reflect it locally first so this effect doesn't write the same change again on every refresh.
            setRecord(r => (r ? { ...r, participants: everyone } : r));
            updateSession(sessionId, { participants: everyone }).catch(err => console.error('Participant sync failed', err));
        }
    }, [record, group, sessionId]);

    // Mirror every edit into the shared copy right away (assignments, items, tax, tip, payer...) so balances
    // elsewhere update immediately. Re-runs when a server refresh replaces the shared copy with older data.
    useEffect(() => {
        if (!record) return;
        patchSession(sessionId, s => ({
            ...s, items, name: name.trim() || s.name, session_date: date || s.session_date, tax: num(tax), tip: num(tip),
            paid_by: paidBy || s.paid_by, category,
        }));
    }, [record, items, name, date, tax, tip, paidBy, category, sessionId, patchSession, sharedSessions]);

    // Debounced autosave of the receipt's details (existing receipts only; a new draft saves when you press Save).
    useEffect(() => {
        if (!record || record.draft) return;
        const current = JSON.stringify([name, date, num(tax), num(tip), paidBy, category]);
        if (current === baseline.current) return;
        autosave.schedule(async () => {
            await updateSession(sessionId, {
                name: name.trim() || 'Receipt', session_date: date || record.session_date, tax: num(tax), tip: num(tip),
                ...(paidBy ? { paid_by: paidBy } : {}), category,
            });
            baseline.current = current;
            void refresh();
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name, date, tax, tip, paidBy, category, record]);

    const split = useMemo(() => computeSplit(items, names, num(tax), num(tip)), [items, names, tax, tip]);
    const subtotal = items.reduce((a, i) => a + i.price, 0);
    const total = Math.round((subtotal + num(tax) + num(tip)) * 100) / 100;
    const assignedCount = items.filter(i => i.assigned_users.some(u => names.includes(u))).length;
    const memberByName = (n: string) => members.find(m => m.name === n);
    const payer = members.find(m => m.user_id === paidBy);
    const payerLabel = paidBy === me ? 'you' : payer?.name ?? 'someone';
    const display = (n: string) => (memberByName(n)?.user_id === me ? 'You' : n);

    const setAssigned = async (itemId: string, next: string[]) => {
        const prev = items;
        setItems(it => it.map(i => (i.id === itemId ? { ...i, assigned_users: next } : i)));
        try {
            await updateItem(sessionId, itemId, { assigned_users: next });
        } catch (err) {
            console.error(err);
            setItems(prev); // rollback
            flash('Could not save that change.');
        }
    };
    const toggle = (item: Item, who: string) =>
        setAssigned(item.id, item.assigned_users.includes(who) ? item.assigned_users.filter(u => u !== who) : [...item.assigned_users, who]);
    const toggleAll = (item: Item) => setAssigned(item.id, names.every(n => item.assigned_users.includes(n)) ? [] : [...names]);

    const handleAddItem = async () => {
        try {
            const created = await addItem(sessionId, 'New item', 0);
            setItems(it => [...it, created]);
            setEditing({ id: created.id, name: created.name, price: '' });
        } catch (err) { console.error(err); flash('Could not add an item.'); }
    };

    const saveEdit = async () => {
        if (!editing) return;
        const e = editing;
        const nextName = e.name.trim() || 'Item';
        const price = Math.round(num(e.price) * 100) / 100;
        const prev = items;
        setItems(it => it.map(i => (i.id === e.id ? { ...i, name: nextName, price } : i)));
        setEditing(null);
        try { await updateItem(sessionId, e.id, { name: nextName, price }); void refresh(); }
        catch (err) { console.error(err); setItems(prev); flash('Could not save that item.'); }
    };

    const confirmDeleteItem = async () => {
        const id = itemToDelete;
        if (!id) return;
        const prev = items;
        setItemToDelete(null);
        setEditing(null);
        setItems(it => it.filter(i => i.id !== id));
        try { await deleteItem(sessionId, id); void refresh(); }
        catch (err) { console.error(err); setItems(prev); flash('Could not delete that item.'); }
    };

    // Splitting some other way turns this into a standalone expense with the same total; the items are kept
    // (dormant) so switching back to "By item" brings them back.
    const switchTo = async (to: SplitMethod) => {
        if (!record || saving) return;
        autosave.cancel();
        setSaving(true);
        try {
            const amount = Math.round((subtotal + num(tax) + num(tip)) * 100) / 100;
            await updateSession(sessionId, {
                kind: 'expense', amount, split_method: to, split_data: convertSplit('equal', to, everyoneEqual(members.map(m => m.user_id)), amount),
                name: name.trim() || 'Expense', session_date: date || record.session_date, category, ...(paidBy ? { paid_by: paidBy } : {}),
            });
            await refresh();
            onSwitched('expense');
        } catch (err) {
            console.error(err);
            flash('Could not switch how this is split.');
            setSaving(false);
        }
    };

    const handleSaveDraft = async () => {
        if (!record) return;
        setSaving(true);
        try {
            await updateSession(sessionId, {
                name: name.trim() || 'Receipt', session_date: date || record.session_date, tax: num(tax), tip: num(tip),
                ...(paidBy ? { paid_by: paidBy } : {}), category, draft: false,
            });
            await refresh();
            onSaved();
        } catch (err) {
            console.error(err);
            flash('Could not save the receipt.');
            setSaving(false);
        }
    };

    const handleDeleteReceipt = async () => {
        setConfirmDelete(false);
        try { await deleteSession(sessionId); await refresh(); onBack(); }
        catch (err) { console.error(err); flash('Could not delete the receipt.'); }
    };

    if (loadError) return <p className="text-center text-coral py-16">{loadError}</p>;
    if (!record || !group) return <p className="text-center text-faint py-16 animate-pulse">Loading receipt…</p>;

    const maxShare = Math.max(...split.totals.map(([, v]) => v), 0.01);
    const paintTone = paint ? tones[memberByName(paint)?.user_id ?? ''] : null;
    const saveText = record.draft ? 'Not saved yet' : autosave.state === 'saving' ? 'Saving…' : autosave.state === 'error' ? "Couldn't save changes" : autosave.state === 'saved' ? 'All changes saved' : 'Changes save automatically';

    return (
        <div className="max-w-[1080px] mx-auto flex flex-col gap-6">
            <AnimatePresence>
                {toast && (
                    <motion.div key="toast" initial={{ opacity: 0.8, y: -24, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: -16, x: '-50%' }} transition={spring}
                        role="status" className={`fixed top-6 left-1/2 px-6 py-3 rounded-full font-semibold text-sm z-[100] text-white ${toast.type === 'success' ? 'bg-ink' : 'bg-coral-strong'}`}>
                        {toast.message}
                    </motion.div>
                )}
            </AnimatePresence>

            <Modal open={!!itemToDelete} onClose={() => setItemToDelete(null)}>
                <h3 className="m-0 mb-2 text-xl font-semibold">Delete item?</h3>
                <p className="m-0 mb-6 text-muted leading-relaxed">Remove this item from the receipt? Everyone's totals update.</p>
                <div className="flex gap-3">
                    <Button variant="secondary" wide height={42} onClick={() => setItemToDelete(null)}>Cancel</Button>
                    <Button wide height={42} className="!bg-coral-strong hover:opacity-90" onClick={confirmDeleteItem}>Delete</Button>
                </div>
            </Modal>
            <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)}>
                <h3 className="m-0 mb-2 text-xl font-semibold">Delete expense?</h3>
                <p className="m-0 mb-6 text-muted leading-relaxed">This permanently deletes <strong className="text-ink">{name || 'this receipt'}</strong> and its {items.length} items for everyone in the group.</p>
                <div className="flex gap-3">
                    <Button variant="secondary" wide height={42} onClick={() => setConfirmDelete(false)}>Cancel</Button>
                    <Button wide height={42} className="!bg-coral-strong hover:opacity-90" onClick={handleDeleteReceipt}>Delete</Button>
                </div>
            </Modal>

            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-col gap-2 min-w-0 flex-1">
                    {!narrow && (
                        <motion.button {...tapFlat} onClick={onBack} className="self-start flex items-center gap-1 text-[13px] text-muted hover:text-ink"><Icon name="arrow_back" size={16} />{group.name}</motion.button>
                    )}
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        aria-label="Receipt name"
                        className="m-0 p-0 border-0 border-b border-dashed border-transparent hover:border-dash bg-transparent text-[30px] font-semibold tracking-title w-full max-w-[420px]"
                    />
                    <span className="text-sm text-muted">{dateMeta(date)} · {items.length} {items.length === 1 ? 'item' : 'items'} · paid by {payerLabel}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-[13px] text-faint">Total</span>
                    <AnimatedNumber value={total} prefix="$" className="text-[34px] font-semibold tracking-[-0.03em]" />
                </div>
            </div>

            {record.draft && <DraftBar what="expense" canSave saving={saving} onSave={handleSaveDraft} onDiscard={onDiscard} />}

            <div className="flex flex-wrap gap-6 items-start">
                <div className="flex-[999_1_440px] min-w-0 flex flex-col gap-3.5">
                    <Card className="p-4 flex flex-col gap-3">
                        <span className="text-sm font-semibold">Split by</span>
                        <SplitByTabs value="items" onChange={m => { if (m !== 'items') void switchTo(m); }} disabled={saving} />
                    </Card>

                    <Card className="p-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold">{paint ? `Tap the items ${display(paint) === 'You' ? 'you' : paint} had` : 'Pick a person, then tap their items'}</span>
                            <span className="text-[13px] text-muted whitespace-nowrap">{assignedCount} of {items.length} assigned</span>
                        </div>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Who to assign">
                            {members.map(m => {
                                const on = paint === m.name;
                                return (
                                    <motion.button
                                        key={m.user_id}
                                        {...tap}
                                        aria-pressed={on}
                                        onClick={() => setPaint(on ? null : m.name)}
                                        className={`flex items-center gap-2 h-9 pl-1 pr-3.5 rounded-full border text-sm font-semibold transition-colors ${on ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-line'}`}
                                    >
                                        <Avatar name={m.name} tone={tones[m.user_id]} size={28} />{display(m.name)}
                                    </motion.button>
                                );
                            })}
                        </div>
                        <div className="h-1 rounded-sm bg-rule overflow-hidden">
                            <motion.div className="h-full rounded-sm bg-green-brand" initial={false} animate={{ width: `${items.length ? (assignedCount / items.length) * 100 : 0}%` }} transition={{ duration: 0.25 }} />
                        </div>
                    </Card>

                    <Card className="overflow-hidden">
                        <AnimatePresence initial={false} mode="popLayout">
                            {items.map((item, i) => {
                                const n = item.assigned_users.filter(u => names.includes(u)).length;
                                const hit = !!paint && item.assigned_users.includes(paint);
                                const isEditing = editing?.id === item.id;
                                const only = n === 1 ? item.assigned_users.find(u => names.includes(u)) : null;
                                return (
                                    <motion.div
                                        key={item.id}
                                        layout
                                        initial={{ opacity: 0.8, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                                        transition={spring}
                                        onClick={() => { if (paint && !isEditing) void toggle(item, paint); }}
                                        className={`flex flex-col gap-2.5 px-[18px] py-3.5 transition-colors ${i ? 'border-t border-rule' : ''} ${paint && !isEditing ? 'cursor-pointer' : ''}`}
                                        style={{ background: hit && paintTone ? paintTone.tint : '#fff' }}
                                    >
                                        {isEditing && editing ? (
                                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                <input autoFocus aria-label="Item name" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && saveEdit()} className="flex-1 min-w-0 h-9 px-2.5 border border-line rounded-lg text-[15px]" />
                                                <span className="flex items-center gap-1 font-mono text-sm">$<input aria-label="Item price" inputMode="decimal" placeholder="0.00" value={editing.price} onChange={e => setEditing({ ...editing, price: e.target.value })} onKeyDown={e => e.key === 'Enter' && saveEdit()} className="w-20 h-9 px-2 border border-line rounded-lg text-right font-mono text-sm" /></span>
                                                <motion.button {...tap} aria-label="Save item" onClick={saveEdit} className="w-9 h-9 grid place-items-center rounded-lg bg-ink text-white"><Icon name="check" size={18} /></motion.button>
                                                <motion.button {...tap} aria-label="Delete item" onClick={() => setItemToDelete(item.id)} className="w-9 h-9 grid place-items-center rounded-lg text-coral hover:bg-coral-tint"><Icon name="delete" size={18} /></motion.button>
                                            </div>
                                        ) : (
                                            <div className="flex items-baseline gap-3">
                                                <button type="button" onClick={e => { if (paint) return; /* in paint mode the row handles the tap */ e.stopPropagation(); setEditing({ id: item.id, name: item.name, price: String(item.price) }); }} className="flex-1 min-w-0 text-left text-[15px] font-medium truncate hover:underline decoration-dash underline-offset-4" title="Edit item">{item.name}</button>
                                                <span className="font-mono text-sm">{fmt(item.price)}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {members.map(m => {
                                                const on = item.assigned_users.includes(m.name);
                                                const t = tones[m.user_id];
                                                return (
                                                    <motion.button
                                                        key={m.user_id}
                                                        {...tap}
                                                        title={m.name}
                                                        aria-label={`${m.name} on ${item.name}`}
                                                        aria-pressed={on}
                                                        onClick={e => { e.stopPropagation(); void toggle(item, m.name); }}
                                                        className="w-[30px] h-[30px] rounded-full grid place-items-center text-xs font-semibold p-0"
                                                        style={{ background: on ? t.bg : 'transparent', color: on ? t.fg : '#B3AFA6', border: `1px ${on ? 'solid' : 'dashed'} ${on ? t.bg : '#CFCBC2'}` }}
                                                    >
                                                        {m.name[0].toUpperCase()}
                                                    </motion.button>
                                                );
                                            })}
                                            <motion.button {...tap} onClick={e => { e.stopPropagation(); void toggleAll(item); }} className="h-[30px] px-2.5 rounded-full bg-transparent text-xs font-semibold text-muted hover:bg-surface">All</motion.button>
                                            <span className={`ml-auto text-xs ${n === 0 ? 'text-coral' : 'text-faint'}`}>
                                                {n === 0 ? 'Not assigned yet' : n === 1 ? `Just ${display(only!) === 'You' ? 'you' : only}` : `${fmt(item.price / n)} each`}
                                            </span>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                        {items.length === 0 && (
                            <p className="m-0 px-[18px] py-6 text-center text-sm text-faint">No items yet. Add one by hand, or import them from a receipt.</p>
                        )}
                        <div className="flex bg-wash border-t border-rule">
                            <motion.button {...tapFlat} onClick={handleAddItem} className="flex-1 flex items-center gap-2 px-[18px] py-3.5 text-sm font-semibold text-body hover:bg-surface transition-colors">
                                <Icon name="add" size={18} />Add an item
                            </motion.button>
                            <motion.button {...tapFlat} onClick={onImport} className="flex items-center gap-2 px-[18px] py-3.5 border-l border-rule text-sm font-semibold text-body hover:bg-surface transition-colors">
                                <Icon name="upload_file" size={18} />Import from JSON
                            </motion.button>
                        </div>
                    </Card>
                </div>

                <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-3.5 min-[760px]:sticky min-[760px]:top-6">
                    <Card className="p-5 flex flex-col gap-4">
                        <span className="text-[15px] font-semibold">Who pays what</span>
                        {split.totals.map(([n, amt]) => {
                            const m = memberByName(n);
                            const t = m ? tones[m.user_id] : null;
                            if (!m || !t) return null;
                            return (
                                <div key={m.user_id} className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2.5">
                                        <Avatar name={n} tone={t} size={28} />
                                        <span className="flex-1 flex flex-col">
                                            <span className="text-sm font-semibold">{display(n)}</span>
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
                        <div className="border-t border-rule pt-3.5 flex flex-col gap-2.5 text-sm">
                            <div className="flex justify-between text-body"><span>Items</span><span className="font-mono">{fmt(subtotal)}</span></div>
                            {split.unassignedSubtotal > 0.004 && <div className="flex justify-between text-coral"><span>Not assigned yet</span><span className="font-mono">{fmt(split.unassignedSubtotal)}</span></div>}
                            <label className="flex justify-between items-center text-body">Tax<span className="flex items-center gap-0.5 font-mono">$<input aria-label="Tax" inputMode="decimal" value={tax} placeholder="0.00" onChange={e => setTax(e.target.value)} className={smallInput} /></span></label>
                            <label className="flex justify-between items-center text-body">Tip<span className="flex items-center gap-0.5 font-mono">$<input aria-label="Tip" inputMode="decimal" value={tip} placeholder="0.00" onChange={e => setTip(e.target.value)} className={smallInput} /></span></label>
                            <div className="flex justify-between font-semibold text-[15px] pt-1"><span>Total</span><AnimatedNumber value={total} prefix="$" className="font-mono" /></div>
                        </div>
                        <p className="m-0 text-xs leading-normal text-faint">Tax and tip are shared in proportion to what each person had. Pennies always add up.</p>
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
                        <div className="flex items-center justify-between pt-1">
                            {record.draft ? <span /> : <motion.button {...tapFlat} onClick={() => setConfirmDelete(true)} className="text-[13px] font-semibold text-coral">Delete expense</motion.button>}
                            <span className="text-xs text-faint" aria-live="polite">{saveText}</span>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
