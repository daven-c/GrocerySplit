import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, Modal, AnimatedNumber, spring, tapFlat, tap } from '../lib/motion';
import { useAppData } from '../lib/appData';
import { getSession, updateSession, saveReceipt, addItem, updateItem, deleteItem, deleteSession, Item, Session } from '../lib/api';
import { ParsedReceipt } from '../lib/receiptImport';
import ReceiptUpload from './ReceiptUpload';
import { computeSplit } from '../lib/calc';
import { CATEGORIES, SplitMethod, categoryOf, convertSplit, everyoneEqual } from '../lib/expenses';
import { fmt, memberTones } from '../lib/people';
import { Avatar, Button, Card, ChangesBar, DraftBar, Icon, cellCls, selectPillCls } from './ui';
import { toast as notify } from './Toast';

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


export default function Split({ sessionId, narrow, onBack, onImport, onSaved, onDiscard, onSwitched }: SplitProps) {
    const { me, groups, refresh } = useAppData();
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
    const [reload, setReload] = useState(0); // bumped by Cancel and after Save to take the saved version
    const [importing, setImporting] = useState(false);
    const tempId = useRef(0);
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
            baseline.current = JSON.stringify([s.name, s.session_date, s.tax || 0, s.tip || 0, s.paid_by ?? s.user_id ?? '', s.category || 'groceries', s.items.map(i => [i.id, i.name, i.price, i.assigned_users])]);
        }).catch(err => !cancelled && setLoadError(err.message || 'Failed to load the receipt'));
        return () => { cancelled = true; };
    }, [sessionId, reload]);

    useEffect(() => {
        if (!record || !group) return;
        const everyone = group.members.map(m => m.name);
        if (everyone.length !== record.participants.length || everyone.some(n => !record.participants.includes(n))) {
            // Reflect it locally first so this effect doesn't write the same change again on every refresh.
            setRecord(r => (r ? { ...r, participants: everyone } : r));
            updateSession(sessionId, { participants: everyone }).catch(err => console.error('Participant sync failed', err));
        }
    }, [record, group, sessionId]);

    // An existing receipt is edited in place but written only when you press Save (one entry in Activity per save);
    // Cancel puts the saved version back. A new draft already lives hidden in the database and has its own Save / Discard,
    // so its items are written as you go.
    const live = !!record?.draft;
    const current = JSON.stringify([name, date, num(tax), num(tip), paidBy, category, items.map(i => [i.id, i.name, i.price, i.assigned_users])]);
    const dirty = !!record && !live && current !== baseline.current;

    const split = useMemo(() => computeSplit(items, names, num(tax), num(tip)), [items, names, tax, tip]);
    const subtotal = items.reduce((a, i) => a + i.price, 0);
    const total = Math.round((subtotal + num(tax) + num(tip)) * 100) / 100;
    const assignedCount = items.filter(i => i.assigned_users.some(u => names.includes(u))).length;
    const memberByName = (n: string) => members.find(m => m.name === n);
    const payer = members.find(m => m.user_id === paidBy);
    const payerLabel = payer?.name ?? 'someone';
    const display = (n: string) => n;

    const setAssigned = async (itemId: string, next: string[]) => {
        const prev = items;
        setItems(it => it.map(i => (i.id === itemId ? { ...i, assigned_users: next } : i)));
        if (!live) return; // saved with the rest when you press Save
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
        if (!live) {
            const id = `new-${++tempId.current}`;
            setItems(it => [...it, { id, session_id: sessionId, name: 'New item', price: 0, assigned_users: [] } as Item]);
            setEditing({ id, name: 'New item', price: '' });
            return;
        }
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
        if (!live) return;
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
        if (!live) return;
        try { await deleteItem(sessionId, id); void refresh(); }
        catch (err) { console.error(err); setItems(prev); flash('Could not delete that item.'); }
    };

    // Splitting some other way turns this into a standalone expense with the same total; the items are kept
    // (dormant) so switching back to "By item" brings them back.
    const switchTo = async (to: SplitMethod) => {
        if (!record || saving) return;
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

    const handleSaveChanges = async () => {
        if (!record || !dirty) return;
        setSaving(true);
        try {
            await saveReceipt(
                sessionId,
                { name: name.trim() || 'Receipt', session_date: date || record.session_date, tax: num(tax), tip: num(tip), category, ...(paidBy ? { paid_by: paidBy } : {}) },
                items.map(i => ({ id: i.id.startsWith('new-') ? undefined : i.id, name: i.name, price: i.price, assigned_users: i.assigned_users }))
            );
            await refresh();
            setReload(r => r + 1); // pick up the saved version (real ids for new items)
            notify('Changes saved');
        } catch (err) {
            console.error(err);
            flash('Could not save the changes.');
        } finally {
            setSaving(false);
        }
    };

    // Items parsed from pasted JSON join this receipt as unsaved changes.
    const applyImport = (r: ParsedReceipt) => {
        setItems(it => [...it, ...r.items.map(i => ({ id: `new-${++tempId.current}`, session_id: sessionId, name: i.name, price: i.price, assigned_users: [] } as Item))]);
        if (r.tax) setTax(String(Math.round((num(tax) + r.tax) * 100) / 100));
        if (r.tip) setTip(String(Math.round((num(tip) + r.tip) * 100) / 100));
        if (r.date) setDate(r.date);
        if (r.store && ['Receipt', 'Manual Receipt', 'Grocery Trip'].includes(name)) setName(r.store);
        setImporting(false);
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
            notify('Receipt saved');
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
    if (importing) return <ReceiptUpload groupId={record.group_id} sessionId={sessionId} narrow={narrow} onImported={() => setImporting(false)} onParsed={applyImport} onBack={() => setImporting(false)} />;

    const maxShare = Math.max(...split.totals.map(([, v]) => v), 0.01);
    const paintTone = paint ? tones[memberByName(paint)?.user_id ?? ''] : null;
    const labelCls2 = 'flex items-center justify-between gap-3 text-[14.5px] font-bold text-body';

    return (
        <div className="max-w-[1080px] mx-auto flex flex-col gap-5">
            <AnimatePresence>
                {toast && (
                    <motion.div key="toast" initial={{ opacity: 0.8, y: -24, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: -16, x: '-50%' }} transition={spring}
                        role="status" className={`fixed top-6 left-1/2 px-6 py-3 rounded-full font-extrabold text-sm z-[100] text-white ${toast.type === 'success' ? 'bg-ink' : 'bg-coral-strong'}`}>
                        {toast.message}
                    </motion.div>
                )}
            </AnimatePresence>

            <Modal open={!!itemToDelete} onClose={() => setItemToDelete(null)}>
                <h3 className="m-0 mb-2 text-xl font-black">Delete item?</h3>
                <p className="m-0 mb-6 text-muted font-semibold leading-relaxed">Remove this item from the receipt? Everyone's totals update.</p>
                <div className="flex gap-3">
                    <Button variant="secondary" wide height={44} onClick={() => setItemToDelete(null)}>Cancel</Button>
                    <Button wide height={44} className="!bg-coral-strong hover:opacity-90" onClick={confirmDeleteItem}>Delete</Button>
                </div>
            </Modal>
            <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)}>
                <h3 className="m-0 mb-2 text-xl font-black">Delete expense?</h3>
                <p className="m-0 mb-6 text-muted font-semibold leading-relaxed">This permanently deletes <strong className="text-ink">{name || 'this receipt'}</strong> and its {items.length} items for everyone in the group.</p>
                <div className="flex gap-3">
                    <Button variant="secondary" wide height={44} onClick={() => setConfirmDelete(false)}>Cancel</Button>
                    <Button wide height={44} className="!bg-coral-strong hover:opacity-90" onClick={handleDeleteReceipt}>Delete</Button>
                </div>
            </Modal>

            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-col gap-2 min-w-0 flex-1">
                    {!narrow && (
                        <motion.button {...tapFlat} onClick={onBack} className="self-start h-[34px] pl-2 pr-3.5 flex items-center gap-1 rounded-full bg-soft text-[13.5px] font-extrabold text-body"><Icon name="arrow_back" size={17} />{group.personal ? 'Personal' : group.name}</motion.button>
                    )}
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        aria-label="Receipt name"
                        className="m-0 p-0 border-0 border-b-2 border-dashed border-transparent hover:border-line bg-transparent text-[32px] font-black tracking-title w-full max-w-[440px]"
                    />
                    <span className="text-[14.5px] font-semibold text-muted">{dateMeta(date)} · {categoryOf(category).label} · {items.length} {items.length === 1 ? 'item' : 'items'} · paid by {payerLabel}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-[13.5px] font-bold text-faint">Total</span>
                    <AnimatedNumber value={total} prefix="$" className="text-4xl font-black tracking-[-0.03em] leading-[1.1]" />
                </div>
            </div>

            {record.draft && <DraftBar what="expense" canSave saving={saving} onSave={handleSaveDraft} onDiscard={onDiscard} />}
            {dirty && <ChangesBar canSave saving={saving} onSave={handleSaveChanges} onCancel={() => setReload(r => r + 1)} />}

            <div className="flex flex-wrap gap-5 items-start">
                <div className="flex-[999_1_440px] min-w-0 flex flex-col gap-3.5">
                    <div className="flex flex-col gap-3 py-4 px-[18px] rounded-[24px] bg-wash">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[15px] font-black">{paint ? `Tap the items ${paint} had` : 'Pick a person, then tap their items'}</span>
                            <span className="text-[13.5px] font-bold text-muted whitespace-nowrap">{assignedCount} of {items.length} assigned</span>
                        </div>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Who to assign">
                            {members.map(m => {
                                const on = paint === m.name;
                                return (
                                    <motion.button
                                        key={m.user_id}
                                        {...tapFlat}
                                        aria-pressed={on}
                                        onClick={() => setPaint(on ? null : m.name)}
                                        className={`flex items-center gap-2 h-[42px] pl-[5px] pr-4 rounded-full text-[15px] font-extrabold transition-colors ${on ? 'bg-ink text-white' : 'bg-white text-ink shadow-[0_1px_3px_rgba(38,34,30,0.1)]'}`}
                                    >
                                        <Avatar name={m.name} tone={tones[m.user_id]} size={32} />{display(m.name)}
                                    </motion.button>
                                );
                            })}
                        </div>
                        <div className="h-1.5 rounded-[3px] bg-line overflow-hidden">
                            <motion.div className="h-full rounded-[3px] bg-[oklch(0.62_0.15_155)]" initial={false} animate={{ width: `${items.length ? (assignedCount / items.length) * 100 : 0}%` }} transition={{ duration: 0.25 }} />
                        </div>
                    </div>

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
                                        className={`flex flex-col gap-2.5 px-5 py-3.5 transition-colors duration-150 ${i ? 'border-t border-rule' : ''} ${paint && !isEditing ? 'cursor-pointer' : ''}`}
                                        style={{ background: hit && paintTone ? paintTone.tint : '#fff' }}
                                    >
                                        {isEditing && editing ? (
                                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                <input autoFocus aria-label="Item name" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && saveEdit()} className="flex-1 min-w-0 h-10 px-4 border-[1.5px] border-line rounded-full bg-field text-[15px] font-bold" />
                                                <span className="flex items-center gap-1 text-sm font-extrabold text-muted">$<input aria-label="Item price" inputMode="decimal" placeholder="0.00" value={editing.price} onChange={e => setEditing({ ...editing, price: e.target.value })} onKeyDown={e => e.key === 'Enter' && saveEdit()} className={`w-20 ${cellCls} !h-10`} /></span>
                                                <motion.button {...tap} aria-label="Save item" onClick={saveEdit} className="w-10 h-10 grid place-items-center rounded-full bg-ink text-white"><Icon name="check" size={18} /></motion.button>
                                                <motion.button {...tap} aria-label="Delete item" onClick={() => setItemToDelete(item.id)} className="w-10 h-10 grid place-items-center rounded-full text-coral hover:bg-coral-tint"><Icon name="delete" size={18} /></motion.button>
                                            </div>
                                        ) : (
                                            <div className="flex items-baseline gap-3">
                                                <button type="button" onClick={e => { if (paint) return; /* in paint mode the row handles the tap */ e.stopPropagation(); setEditing({ id: item.id, name: item.name, price: String(item.price) }); }} className="flex-1 min-w-0 text-left text-base font-extrabold truncate hover:underline decoration-dash underline-offset-4" title="Edit item">{item.name}</button>
                                                <span className="text-[15.5px] font-extrabold">{fmt(item.price)}</span>
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
                                                        className="w-[34px] h-[34px] rounded-full grid place-items-center text-[13px] font-black p-0"
                                                        style={{ background: on ? t.bg : '#fff', color: on ? t.fg : '#C2B8AC', border: `1.5px ${on ? 'solid' : 'dashed'} ${on ? t.bg : '#E3DBD0'}` }}
                                                    >
                                                        {m.name[0].toUpperCase()}
                                                    </motion.button>
                                                );
                                            })}
                                            <motion.button {...tapFlat} onClick={e => { e.stopPropagation(); void toggleAll(item); }} className="h-[34px] px-3 rounded-full bg-soft text-[13px] font-extrabold text-body">Everyone</motion.button>
                                            <span className={`ml-auto text-[13px] font-bold ${n === 0 ? 'text-coral' : 'text-faint'}`}>
                                                {n === 0 ? 'Nobody yet' : n === 1 ? `Just ${only}` : `${fmt(item.price / n)} each`}
                                            </span>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                        {items.length === 0 && (
                            <p className="m-0 px-5 py-6 text-center text-sm font-bold text-faint">No items yet. Add one by hand, or import them from a receipt.</p>
                        )}
                        <motion.button {...tapFlat} onClick={handleAddItem} className="w-full flex items-center gap-2 px-5 py-4 border-t border-rule bg-field text-[15px] font-extrabold text-body hover:bg-wash transition-colors">
                            <Icon name="add_circle" size={20} />Add an item
                        </motion.button>
                    </Card>
                </div>

                <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-3.5 min-[760px]:sticky min-[760px]:top-6">
                    <Card className="p-5 flex flex-col gap-4">
                        <span className="text-lg font-black">Who pays what</span>
                        {split.totals.map(([n, amt]) => {
                            const m = memberByName(n);
                            const t = m ? tones[m.user_id] : null;
                            if (!m || !t) return null;
                            return (
                                <div key={m.user_id} className="flex items-center gap-3">
                                    <Avatar name={n} tone={t} size={36} />
                                    <span className="flex-1 flex flex-col gap-[5px]">
                                        <span className="flex justify-between"><span className="text-[15px] font-extrabold">{display(n)}</span><AnimatedNumber value={amt} prefix="$" className="text-[15.5px] font-black" /></span>
                                        <span className="h-1.5 rounded-[3px] bg-soft"><motion.span className="block h-full rounded-[3px] opacity-50" style={{ background: t.fg }} initial={false} animate={{ width: `${(amt / maxShare) * 100}%` }} transition={{ duration: 0.25 }} /></span>
                                        <span className="text-[12.5px] font-bold text-faint">{m.user_id === paidBy ? 'paid the bill' : `owes ${payerLabel}`}</span>
                                    </span>
                                </div>
                            );
                        })}
                        <div className="border-t border-rule pt-3.5 flex flex-col gap-2.5 text-[15px] font-bold text-body">
                            <div className="flex justify-between"><span>Items</span><span>{fmt(subtotal)}</span></div>
                            {split.unassignedSubtotal > 0.004 && <div className="flex justify-between text-coral"><span>Not assigned yet</span><span>{fmt(split.unassignedSubtotal)}</span></div>}
                            <label className="flex justify-between items-center">Tax<span className="flex items-center gap-1">$<input aria-label="Tax" inputMode="decimal" value={tax} placeholder="0.00" onChange={e => setTax(e.target.value)} className={`w-20 ${cellCls}`} /></span></label>
                            <label className="flex justify-between items-center">Tip<span className="flex items-center gap-1">$<input aria-label="Tip" inputMode="decimal" value={tip} placeholder="0.00" onChange={e => setTip(e.target.value)} className={`w-20 ${cellCls}`} /></span></label>
                            <div className="flex justify-between text-[17px] font-black text-ink pt-0.5"><span>Total</span><AnimatedNumber value={total} prefix="$" /></div>
                        </div>
                        <p className="m-0 text-[13px] font-semibold leading-[1.5] text-faint">Tax and tip are shared in proportion to what each person had. Pennies always add up.</p>
                    </Card>

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
                        <div className="flex justify-between items-center pt-1 gap-3">
                            <motion.button {...tapFlat} onClick={live ? onImport : () => setImporting(true)} className="text-[13.5px] font-extrabold text-body underline underline-offset-[3px]">Import items from a photo</motion.button>
                            {!record.draft && <motion.button {...tapFlat} onClick={() => setConfirmDelete(true)} className="text-[13.5px] font-extrabold text-coral">Delete expense</motion.button>}
                        </div>
                    </div>

                    <div className="border-[1.5px] border-dashed border-line rounded-[24px] py-4 px-[18px] flex flex-col gap-2.5">
                        <span className="text-[15px] font-black">Itemized receipt</span>
                        <span className="text-[13.5px] font-semibold text-muted leading-[1.45]">Tap who had each item. Tax and tip are shared by what each person had.</span>
                        <Button variant="secondary" height={38} className="self-start px-4 text-sm" disabled={saving} onClick={() => void switchTo('exact')}>Split one total instead</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
