import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, Pop, Modal, UnderlineTabs, SegmentedTabs, AnimatedNumber, listItem, spring, tapFlat } from '../lib/motion';
import { useAppData } from '../lib/appData';
import { useDismiss } from '../lib/hooks';
import { linkPersonalPerson, createSession, deleteGroup, removeMember, inviteToGroup, listPendingInvites, revokeInvite, recordSettlement, addGuest, renameGuest, removeGuest, updateSettlement, deleteSettlement, listSettlementLog, listExpenseLog, PendingInvite, Session, Settlement } from '../lib/api';
import { groupLedger } from '../lib/ledger';
import { ActivityItem, describeChange, mergeActivity } from '../lib/activity';
import { isEnabled } from '../lib/flags';
import { computeBalances } from '../lib/balances';
import { categoryOf, categoryTone, CATEGORIES, myShare, totalOf } from '../lib/expenses';
import { fmt, groupTile, labelMap, memberTones } from '../lib/people';
import { toast } from './Toast';
import { Avatar, AvatarStack, Button, Card, Icon } from './ui';
import { messageOf } from '../lib/errors';

export type GroupTab = 'expenses' | 'balances' | 'activity' | 'members';

interface GroupDetailProps {
    groupId: string;
    initialTab?: GroupTab;
    narrow: boolean;
    onBack: () => void;
    /** `draft` is true for a record that was just created and is not saved until its author says so. */
    onOpenRecord: (id: string, kind: 'receipt' | 'expense', draft?: boolean) => void;
}

type Confirm = null | { kind: 'leave' | 'delete' | 'remove'; userId?: string; name?: string };

/** One line in the list: an expense/receipt, or a transfer between two members. */
type Entry = { type: 'record'; date: string; at: string; rec: Session } | { type: 'transfer'; date: string; at: string; p: Settlement };
const localDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const monthLabel = (iso: string) => {
    const d = new Date(iso + 'T00:00');
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString('en-US', sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' });
};

export default function GroupDetail({ groupId, initialTab = 'expenses', onBack, onOpenRecord }: GroupDetailProps) {
    const { me, groups, sessions, settlements, refresh, loading } = useAppData();
    const group = groups.find(g => g.id === groupId);
    const [tab, setTab] = useState<GroupTab>(initialTab);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState<string | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [pending, setPending] = useState<PendingInvite[]>([]);
    const [email, setEmail] = useState('');
    const [personName, setPersonName] = useState('');
    const [personUser, setPersonUser] = useState('');
    const [side, setSide] = useState<'balances' | 'people'>(initialTab === 'members' ? 'people' : 'balances'); // Personal: balances by default, people are used less often
    const [guestOp, setGuestOp] = useState<null | { id: string; kind: 'rename' | 'link'; value: string }>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [confirm, setConfirm] = useState<Confirm>(null);
    const [settling, setSettling] = useState(false);
    const [pbOpen, setPbOpen] = useState(false);
    const [pbEditId, setPbEditId] = useState<string | null>(null);
    const [log, setLog] = useState<ActivityItem[] | null>(null);
    const [pbFrom, setPbFrom] = useState('');
    const [pbTo, setPbTo] = useState('');
    const [pbAmount, setPbAmount] = useState('');
    const creating = useRef(false);
    const addRef = useRef<HTMLDivElement>(null);

    // Keep the last dialog's content around while its exit animation plays.
    const lastConfirm = useRef(confirm);
    if (confirm) lastConfirm.current = confirm;
    const shownConfirm = confirm ?? lastConfirm.current;

    const closeAdd = useCallback(() => setAddOpen(false), []);
    useDismiss(addRef, addOpen, closeAdd);

    const isOwner = !!group && group.owner_id === me;
    // The transfer change log: reloaded whenever the transfers change or the tab is opened.
    useEffect(() => {
        if (tab !== 'activity' || !isEnabled('activity')) return;
        let cancelled = false;
        Promise.all([listExpenseLog(groupId), listSettlementLog(groupId)])
            .then(([e, t]) => !cancelled && setLog(mergeActivity(e, t)))
            .catch(() => !cancelled && setLog([]));
        return () => { cancelled = true; };
    }, [tab, groupId, settlements, sessions]);


    const records = useMemo(
        () => sessions.filter(s => s.group_id === groupId).sort((a, b) => b.session_date.localeCompare(a.session_date) || b.updated_at.localeCompare(a.updated_at)),
        [sessions, groupId]
    );

    useEffect(() => {
        if (!isOwner) { setPending([]); return; }
        listPendingInvites(groupId).then(setPending).catch(err => setError(messageOf(err, 'That did not work')));
    }, [groupId, isOwner]);

    const tones = useMemo(() => memberTones(group?.members ?? [], me), [group, me]);
    const labels = useMemo(() => labelMap(group?.members ?? []), [group]);
    const nameOf = (id: string | null) => (id ? labels[id] : undefined) ?? 'someone';
    const totalCost = useMemo(() => records.filter(r => !r.draft).reduce((a, r) => a + totalOf(r), 0), [records]);
    const net = useMemo(() => computeBalances(me, groups, sessions, settlements).byGroup[groupId] ?? 0, [me, groups, sessions, settlements, groupId]);
    const meMember = group?.members.find(m => m.user_id === me);

    const ledger = useMemo(
        () => (group ? groupLedger(group, records, settlements.filter(p => p.group_id === groupId)) : null),
        [group, records, settlements, groupId]
    );
    const maxNet = Math.max(0.01, ...(ledger?.members.map(m => Math.abs(m.net)) ?? []));

    const categoriesPresent = useMemo(() => CATEGORIES.filter(c => records.some(r => r.category === c.id)), [records]);

    const groupPaybacks = useMemo(() => settlements.filter(p => p.group_id === groupId), [settlements, groupId]);

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        const nm = (id: string) => (group?.members.find(m => m.user_id === id)?.name.toLowerCase() ?? '');
        const entries: Entry[] = [
            ...records
                .filter(r => {
                    if (category && r.category !== category) return false;
                    if (!q) return true;
                    return r.name.toLowerCase().includes(q) || categoryOf(r.category).label.toLowerCase().includes(q) || r.items.some(i => i.name.toLowerCase().includes(q));
                })
                .map(rec => ({ type: 'record' as const, date: rec.session_date, at: rec.updated_at, rec })),
            ...(category ? [] : groupPaybacks)
                .filter(p => !q || 'transfer'.includes(q) || nm(p.from_user).includes(q) || nm(p.to_user).includes(q))
                .map(p => ({ type: 'transfer' as const, date: localDate(p.created_at), at: p.created_at, p })),
        ];
        // Newest first: by date, and within a day by when it was added or last saved.
        return entries.sort((a, b) => b.date.localeCompare(a.date) || Date.parse(b.at) - Date.parse(a.at));
    }, [records, groupPaybacks, search, category, group]);

    const months = useMemo(() => {
        const out: { label: string; rows: Entry[] }[] = [];
        for (const e of shown) {
            const label = monthLabel(e.date);
            const bucket = out.find(m => m.label === label) ?? (out[out.push({ label, rows: [] }) - 1]);
            bucket.rows.push(e);
        }
        return out;
    }, [shown]);

    if (!group) {
        return <p className="text-center text-faint py-16 animate-pulse">{loading ? 'Loading group…' : 'This group is no longer available.'}</p>;
    }

    const memberIds = group.members.map(m => m.user_id); // receipts name people by id

    const addReceipt = async () => {
        setAddOpen(false);
        if (creating.current) return;
        creating.current = true;
        try {
            const id = await createSession({ groupId, name: 'Receipt', participants: memberIds, category: 'groceries', draft: true });
            await refresh();
            onOpenRecord(id, 'receipt', true);
        } catch (err) { creating.current = false; setError(messageOf(err, 'Could not create the receipt')); }
    };

    const addExpense = async () => {
        setAddOpen(false);
        if (creating.current) return;
        creating.current = true;
        try {
            const id = await createSession({
                groupId, kind: 'expense', draft: true, name: 'New expense', category: 'other', amount: 0,
                splitMethod: 'exact', splitData: {}, // nobody is selected until you choose
            });
            await refresh();
            onOpenRecord(id, 'expense', true);
        } catch (err) { creating.current = false; setError(messageOf(err, 'Could not create the expense')); }
    };

    // The form opens on the first suggested transfer; changing who paid / who received refills the amount when
    // that exact transfer is one of the suggestions.
    const openPayback = () => {
        setAddOpen(false);
        if (group.members.length < 2) { setError('Invite someone to this group first.'); return; }
        const t = ledger?.transfers[0];
        const other = group.members.find(m => m.user_id !== me)!;
        setPbFrom(t?.from ?? me);
        setPbTo(t?.to ?? other.user_id);
        setPbAmount(t ? String(t.amount) : '');
        setPbEditId(null);
        setPbOpen(true);
    };
    const editPayback = (p: Settlement) => {
        setPbFrom(p.from_user);
        setPbTo(p.to_user);
        setPbAmount(String(p.amount));
        setPbEditId(p.id);
        setPbOpen(true);
    };
    const changePayback = (from: string, to: string) => {
        setPbFrom(from);
        setPbTo(to);
        const t = ledger?.transfers.find(x => x.from === from && x.to === to);
        if (t) setPbAmount(String(t.amount));
    };
    const pbAmountNum = Math.round((parseFloat(pbAmount) || 0) * 100) / 100;
    const pbValid = !!pbFrom && !!pbTo && pbFrom !== pbTo && pbAmountNum > 0;
    const savePayback = async () => {
        if (!pbValid) return;
        setSettling(true);
        setError('');
        try {
            if (pbEditId) await updateSettlement(pbEditId, pbFrom, pbTo, pbAmountNum);
            else await recordSettlement(groupId, pbFrom, pbTo, pbAmountNum);
            setPbOpen(false);
            await refresh();
        } catch (err) {
            setError(messageOf(err, pbEditId ? 'Could not save that transfer' : 'Could not record that transfer'));
        } finally {
            setSettling(false);
        }
    };
    const removePayback = async (id: string) => {
        setError('');
        try { await deleteSettlement(id); await refresh(); }
        catch (err) { setError(messageOf(err, 'Could not delete that transfer')); }
    };

    const handleInvite = async () => {
        const u = email.trim().toLowerCase().replace(/^@/, '');
        setError(''); setNotice('');
        if (!/^[a-z0-9_]{3,20}$/.test(u)) return setError('Enter a username: 3 to 20 letters, numbers or underscores.');
        if (group.members.some(m => !m.pending && m.username === u)) return setError('That person is already in this group.');
        try {
            await inviteToGroup(groupId, u);
            setEmail('');
            setNotice(`Invited @${u}. You can use them in expenses now; it all moves to their account when they accept.`);
            toast('Invite sent');
            await refresh();
            setPending(await listPendingInvites(groupId));
        } catch (err) { setError(messageOf(err, 'That did not work')); }
    };

    const reloadPeople = async () => { await refresh(); setPending(await listPendingInvites(groupId)); };
    const addPerson = async () => {
        const n = personName.trim();
        const u = isPersonal ? personUser.trim() : '';
        if (!n && !u) return;
        setError(''); setNotice('');
        try { await addGuest(groupId, n, u || undefined); setPersonName(''); setPersonUser(''); await reloadPeople(); }
        catch (err) { setError(messageOf(err, 'Could not add that person')); }
    };
    const runGuestOp = async () => {
        if (!guestOp || !guestOp.value.trim()) return;
        setError(''); setNotice('');
        try {
            if (guestOp.kind === 'link') {
                if (isPersonal) { await linkPersonalPerson(guestOp.id, guestOp.value); toast('Linked'); }
                else { await inviteToGroup(groupId, guestOp.value, guestOp.id); toast('Invite sent'); }
            } else await renameGuest(guestOp.id, guestOp.value);
            setGuestOp(null);
            await reloadPeople();
        } catch (err) { setError(messageOf(err, 'That did not work')); }
    };
    const dropGuest = async (id: string) => {
        setError('');
        try { await removeGuest(id); await reloadPeople(); }
        catch (err) { setError(messageOf(err, 'Could not remove that person')); }
    };

    const handleConfirm = async () => {
        if (!confirm) return;
        const c = confirm;
        setConfirm(null);
        try {
            if (c.kind === 'delete') { await deleteGroup(groupId); await refresh(); return onBack(); }
            if (c.kind === 'leave') { await removeMember(groupId, me); await refresh(); return onBack(); }
            await removeMember(groupId, c.userId!);
            await refresh();
        } catch (err) { setError(messageOf(err, 'Action failed')); }
    };

    const settle = async (from: string, to: string, amount: number) => {
        if (settling) return;
        setSettling(true);
        setError('');
        try {
            await recordSettlement(groupId, from, to, amount);
            await refresh();
            toast('Transfer recorded');
        } catch (err) {
            setError(messageOf(err, 'Could not record that payment'));
        } finally {
            setSettling(false);
        }
    };
    const who = (id: string) => labels[id] ?? 'Someone';

    const confirmText = {
        delete: { title: 'Delete group?', body: `This permanently deletes "${group.name}" and all ${records.length} of its expenses for every member.`, action: 'Delete' },
        leave: { title: 'Leave group?', body: `You'll lose access to "${group.name}" and its expenses unless someone invites you again.`, action: 'Leave' },
        remove: { title: 'Remove member?', body: `Remove ${shownConfirm?.name} from "${group.name}"? They lose access to its expenses.`, action: 'Remove' },
    };

    const isPersonal = !!group.personal;
    const balanceLine = Math.abs(net) < 0.005 ? "Everyone's square" : net > 0 ? `You're owed ${fmt(net)} here` : `You owe ${fmt(net)} here`;
    const balanceColor = Math.abs(net) < 0.005 ? 'text-body' : net > 0 ? 'text-green' : 'text-coral';
    const tile = groupTile(group.id);
    const publishedCount = records.filter(r => !r.draft).length;
    const dayLabel = (iso: string) => new Date(iso + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const labelCls2 = 'flex flex-col gap-1.5 text-[14px] font-extrabold text-body';
    const panelCls = 'rounded-[24px] bg-mint p-[18px] flex flex-col gap-3';

    const modals = (
        <>
            <Modal open={!!confirm} onClose={() => setConfirm(null)}>
                {shownConfirm && (
                    <>
                        <h2 className="m-0 mb-2 text-xl font-black text-ink">{confirmText[shownConfirm.kind].title}</h2>
                        <p className="m-0 mb-6 text-muted font-semibold leading-relaxed">{confirmText[shownConfirm.kind].body}</p>
                        <div className="flex gap-3">
                            <Button variant="secondary" wide height={44} onClick={() => setConfirm(null)}>Cancel</Button>
                            <Button wide height={44} className="!bg-coral-strong hover:opacity-90" onClick={handleConfirm}>{confirmText[shownConfirm.kind].action}</Button>
                        </div>
                    </>
                )}
            </Modal>

            <Modal open={pbOpen} onClose={() => setPbOpen(false)}>
                <h2 className="m-0 mb-1 text-xl font-black text-ink">{pbEditId ? 'Edit transfer' : 'Record a transfer'}</h2>
                <p className="m-0 mb-4 text-sm font-semibold text-muted">Evens out what two members of {group.name} owe each other. It doesn't move money.{pbEditId && ' Changes are logged under Activity.'}</p>
                <div className="flex flex-col gap-3">
                    <label className={labelCls2}>Who paid
                        <select value={pbFrom} onChange={e => changePayback(e.target.value, pbTo)} className="h-[46px] px-4 border-[1.5px] border-line rounded-full bg-field text-[15px] font-bold text-ink">
                            {group.members.map(m => <option key={m.user_id} value={m.user_id}>{who(m.user_id)}</option>)}
                        </select>
                    </label>
                    <label className={labelCls2}>Who received
                        <select value={pbTo} onChange={e => changePayback(pbFrom, e.target.value)} className="h-[46px] px-4 border-[1.5px] border-line rounded-full bg-field text-[15px] font-bold text-ink">
                            {group.members.map(m => <option key={m.user_id} value={m.user_id}>{who(m.user_id)}</option>)}
                        </select>
                    </label>
                    <label className={labelCls2}>Amount
                        <span className="flex items-center gap-1 h-[46px] px-4 border-[1.5px] border-line rounded-full bg-field focus-within:border-[oklch(0.55_0.1_158)]">
                            <span className="font-black text-ghost">$</span>
                            <input aria-label="Transfer amount" inputMode="decimal" value={pbAmount} onChange={e => setPbAmount(e.target.value)} placeholder="0.00" className="flex-1 min-w-0 border-0 bg-transparent text-[15px] font-extrabold" />
                        </span>
                    </label>
                    {pbFrom && pbFrom === pbTo && <span role="alert" className="text-[13.5px] font-bold text-coral-strong">Pick two different people.</span>}
                </div>
                <div className="flex gap-3 mt-5">
                    <Button variant="secondary" wide height={44} onClick={() => setPbOpen(false)}>Cancel</Button>
                    <Button wide height={44} disabled={settling || !pbValid} onClick={savePayback}>{pbEditId ? 'Save changes' : 'Save transfer'}</Button>
                </div>
            </Modal>
        </>
    );
    const addMenu = (
        <div className="relative" ref={addRef}>
            <Button height={46} className="pl-4 pr-5 text-[15px]" aria-expanded={addOpen} aria-haspopup="menu" onClick={() => setAddOpen(o => !o)}>
                <Icon name="add" size={21} />Add expense
            </Button>
            <AnimatePresence>
                {addOpen && (
                    <motion.div
                        role="menu"
                        className="absolute left-0 sm:left-auto sm:right-0 top-[54px] z-10 w-[300px] max-w-[calc(100vw-32px)] bg-white border border-edge rounded-[22px] shadow-popover p-2 flex flex-col gap-0.5 origin-top-left sm:origin-top-right"
                        initial={{ opacity: 0.8, scale: 0.94, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: -4 }} transition={spring}
                    >
                        {[
                            { icon: 'payments', hue: 250, title: 'Add an expense', desc: 'Rent, bills, one total split by amounts or shares', go: addExpense },
                            { icon: 'checklist', hue: 75, title: 'Split by item', desc: 'Type the items in, or import them from a receipt, then tap who had what', go: addReceipt },
                            { icon: 'swap_horiz', hue: 330, title: 'Record a transfer', desc: 'Someone paid someone back, or you did', go: openPayback },
                        ].map(o => (
                            <motion.button key={o.title} role="menuitem" {...tapFlat} onClick={o.go} className="flex items-center gap-3 p-2.5 rounded-2xl bg-white text-left text-ink hover:bg-wash transition-colors">
                                <span className="w-10 h-10 rounded-full grid place-items-center shrink-0" style={{ background: `oklch(0.95 0.05 ${o.hue})`, color: `oklch(0.45 0.13 ${o.hue})` }}><Icon name={o.icon} size={21} /></span>
                                <span className="flex flex-col gap-px"><span className="text-[15px] font-extrabold">{o.title}</span><span className="text-[13px] font-semibold text-muted leading-[1.35]">{o.desc}</span></span>
                            </motion.button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
    const expensesView = (
            <div className="flex flex-wrap gap-5 items-start">
                <div className="flex-[999_1_420px] min-w-0 flex flex-col gap-[18px]">
                    <div className="flex items-center gap-2.5 h-12 px-[18px] rounded-full bg-soft">
                        <Icon name="search" size={21} className="text-faint" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search expenses or items" aria-label="Search expenses" className="flex-1 min-w-0 border-0 bg-transparent text-[15px] font-bold" />
                    </div>

                    {categoriesPresent.length > 1 && (
                        <div className="flex flex-wrap gap-2 -mt-1.5" role="group" aria-label="Filter by category">
                            {[{ id: null as string | null, label: 'All', icon: '' }, ...categoriesPresent].map(c => {
                                const on = category === c.id;
                                return (
                                    <motion.button key={c.label} {...tapFlat} onClick={() => setCategory(on && c.id ? null : c.id)} aria-pressed={on}
                                        className={`h-8 px-3 rounded-full text-[13px] font-extrabold transition-colors flex items-center gap-1.5 ${on ? 'bg-ink text-white' : 'bg-soft text-body hover:bg-[#EFEAE3]'}`}>
                                        {c.icon && <Icon name={c.icon} size={16} />}{c.label}
                                    </motion.button>
                                );
                            })}
                        </div>
                    )}

                    {months.map(m => (
                        <div key={m.label} className="flex flex-col gap-2">
                            <span className="text-sm font-extrabold text-faint pl-1.5">{m.label}</span>
                            <Card className="p-1.5">
                                {m.rows.map((e, i) => {
                                    if (e.type === 'transfer') {
                                        const p = e.p;
                                        return (
                                            <motion.div key={`pb-${p.id}`} {...listItem(i)} className="flex items-center gap-3.5 p-3 rounded-[18px] hover:bg-wash transition-colors">
                                                <span className="w-11 h-11 rounded-full grid place-items-center shrink-0 bg-green-tint text-green-icon"><Icon name="swap_horiz" size={21} /></span>
                                                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                                    <span className="text-base font-extrabold truncate">{nameOf(p.from_user)} paid {nameOf(p.to_user)}</span>
                                                    <span className="text-[13.5px] font-semibold text-faint">Transfer · {dayLabel(e.date)}</span>
                                                </span>
                                                <span className="shrink-0 flex flex-col items-end gap-0.5">
                                                    <span className="text-base font-black text-green">{fmt(p.amount)}</span>
                                                    <span className="flex gap-2.5">
                                                        <button type="button" onClick={() => editPayback(p)} className="text-xs font-extrabold text-ink underline underline-offset-2">Edit</button>
                                                        <button type="button" onClick={() => removePayback(p.id)} className="text-xs font-extrabold text-ink underline underline-offset-2">Delete</button>
                                                    </span>
                                                </span>
                                            </motion.div>
                                        );
                                    }
                                    const r = e.rec;
                                    const total = totalOf(r);
                                    const share = myShare(r, meMember);
                                    const lent = r.paid_by === me ? Math.max(0, Math.round((total - share) * 100) / 100) : 0;
                                    const ct = categoryTone(r.category);
                                    const meta = `${r.kind === 'receipt' ? `${r.items.length} ${r.items.length === 1 ? 'item' : 'items'} · ` : ''}paid by ${nameOf(r.paid_by)} · ${dayLabel(r.session_date)}`;
                                    return (
                                        <motion.div key={r.id} {...listItem(i)}>
                                            <motion.button
                                                {...tapFlat}
                                                onClick={() => onOpenRecord(r.id, r.kind)}
                                                className="w-full flex items-center gap-3.5 p-3 rounded-[18px] text-left text-ink hover:bg-wash transition-colors"
                                            >
                                                <span aria-hidden="true" className="w-11 h-11 rounded-full grid place-items-center shrink-0" style={{ background: ct.bg, color: ct.fg }}><Icon name={categoryOf(r.category).icon} size={21} /></span>
                                                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                                    <span className="text-base font-extrabold truncate">{r.name}</span>
                                                    <span className="text-[13.5px] font-semibold text-faint">{meta}{!!r.photo_count && <><Icon name="attach_file" size={14} className="ml-1.5 align-[-2px]" /><span className="sr-only"> has photos</span></>}</span>
                                                </span>
                                                <span className="shrink-0 flex flex-col items-end gap-px">
                                                    <span className="text-base font-black">{fmt(total)}</span>
                                                    {lent > 0.004
                                                        ? <span className="text-[12.5px] font-bold text-green">you lent {fmt(lent)}</span>
                                                        : <span className="text-[12.5px] font-bold text-faint">your share {fmt(share)}</span>}
                                                </span>
                                            </motion.button>
                                        </motion.div>
                                    );
                                })}
                            </Card>
                        </div>
                    ))}

                    {months.length === 0 && (
                        <p className="m-0 p-9 text-center text-[15px] font-bold text-faint rounded-[24px] bg-wash">
                            {records.length ? 'Nothing matches that search.' : isPersonal ? 'No expenses yet. Add one to keep track of what you paid for others.' : 'No expenses yet. Add one and everyone in the group can see it.'}
                        </p>
                    )}
                </div>

            </div>
    );
    const balancesView = ledger && (
            <div className="flex flex-wrap gap-5 items-start">
                <Card className="flex-[999_1_420px] min-w-0 p-5 flex flex-col gap-4">
                    <span className="text-lg font-black">Where everyone stands</span>
                    {[...ledger.members].sort((a, b) => b.net - a.net).map((m, i) => {
                        const member = group.members.find(x => x.user_id === m.userId)!;
                        const square = Math.abs(m.net) < 0.005;
                        const w = `${(Math.abs(m.net) / maxNet) * 100}%`;
                        return (
                            <motion.div key={m.userId} {...listItem(i)} className="flex items-center gap-3">
                                <Avatar name={member.name} tone={tones[m.userId]} size={40} />
                                <span className={isPersonal ? 'flex-1 min-w-0 flex flex-col' : 'w-[84px] shrink-0 flex flex-col'}>
                                    <span className="text-[15px] font-extrabold truncate">{who(m.userId)}</span>
                                    <span className="text-[12.5px] font-bold text-faint">{square ? 'all square' : m.net > 0 ? 'up' : 'down'}</span>
                                </span>
                                {!isPersonal && <span className="grid grid-cols-[1fr_2px_1fr] items-center h-7 flex-1 min-w-[60px]" aria-hidden="true">
                                    <span className="flex justify-end"><motion.span className="h-3 rounded-l-md bg-[oklch(0.78_0.12_32)]" initial={false} animate={{ width: m.net < 0 ? w : '0%' }} transition={{ duration: 0.3 }} /></span>
                                    <span className="h-7 bg-line rounded-[1px]" />
                                    <span className="flex"><motion.span className="h-3 rounded-r-md bg-[oklch(0.74_0.14_155)]" initial={false} animate={{ width: m.net > 0 ? w : '0%' }} transition={{ duration: 0.3 }} /></span>
                                </span>}
                                <span className="w-[90px] text-right shrink-0">
                                    {square ? <span className="text-base font-black text-faint">Settled</span> : <AnimatedNumber value={Math.abs(m.net)} prefix={m.net < 0 ? '-$' : '+$'} className={`text-base font-black ${m.net > 0 ? 'text-green' : 'text-coral'}`} />}
                                </span>
                            </motion.div>
                        );
                    })}
                    <span className="text-[12.5px] font-semibold text-faint leading-[1.5]">{isPersonal ? 'Up means they are owed money; down means they owe money. It always adds up to zero.' : 'Up means the group owes them; down means they owe the group. It always adds up to zero.'}</span>
                </Card>

                <div className="flex-[1_1_320px] min-w-0 flex flex-col gap-2.5">
                    <span className="text-[17px] font-black px-1.5">Settle up</span>
                    <AnimatePresence initial={false}>
                        {ledger.transfers.map((t, i) => {
                            const mine = t.from === me || t.to === me;
                            const fromM = group.members.find(x => x.user_id === t.from);
                            const toM = group.members.find(x => x.user_id === t.to);
                            return (
                                <motion.div key={`${t.from}-${t.to}`} {...listItem(i)} className={`flex items-center gap-2.5 py-3 pl-3.5 pr-3 rounded-[22px] ${mine ? 'bg-wash' : 'bg-white border border-edge'}`}>
                                    <span className="flex items-center gap-0.5 shrink-0">
                                        {fromM && <Avatar name={fromM.name} tone={tones[t.from]} size={34} />}
                                        <Icon name="arrow_forward" size={18} className="text-ghost" />
                                        {toM && <Avatar name={toM.name} tone={tones[t.to]} size={34} />}
                                    </span>
                                    <span className="flex-1 min-w-0 flex flex-col gap-px">
                                        <span className="text-[14.5px] font-extrabold"><span>{who(t.from)}</span> {t.from === me ? 'pay' : 'pays'} <span>{who(t.to)}</span></span>
                                        <span className="text-base font-black">{fmt(t.amount)}</span>
                                    </span>
                                    <Button variant={mine ? 'primary' : 'secondary'} height={36} className="px-3.5 text-[13.5px] shrink-0" disabled={settling} onClick={() => settle(t.from, t.to, t.amount)}>
                                        {t.from === me ? 'Mark paid' : t.to === me ? 'Mark received' : 'Record transfer'}
                                    </Button>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                    {ledger.transfers.length === 0 && (
                        <p className="m-0 flex items-center gap-2.5 p-[18px] rounded-[22px] bg-green-tint text-[15px] font-extrabold text-[oklch(0.38_0.11_155)]"><Icon name="check_circle" fill size={22} />Everyone's square. Nothing to settle.</p>
                    )}
                    <span className="text-[12.5px] font-semibold text-faint leading-[1.5] px-1.5">The fewest payments that settle everyone. Recording one doesn't move money; it just updates the balances.</span>
                </div>
            </div>
    );
    const activityView = isEnabled('activity') && (
            <div className="flex flex-col gap-2.5">
                <span className="text-[13.5px] font-semibold text-muted">Every expense, receipt and transfer that was added, changed or deleted, by whom, and when.</span>
                {log === null ? <p className="text-faint font-bold animate-pulse">Loading…</p> : log.length === 0 ? (
                    <Card className="p-5 text-sm font-bold text-muted">No activity yet.</Card>
                ) : (
                    <Card className="p-1.5">
                        {log.map((a, i) => {
                            const nm = (id: string | null) => (id ? who(id) : 'Someone');
                            const when = new Date(a.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                            let line: React.ReactNode;
                            let details: string[] = [];
                            if (a.type === 'transfer') {
                                const l = a.entry;
                                const move = (f: string, t: string, amt: number) => `${nm(f)} → ${nm(t)} ${fmt(amt)}`;
                                line = <><span className="font-extrabold">{nm(l.actor)}</span> {l.action === 'created' ? 'recorded' : l.action} a transfer</>;
                                details = [l.action === 'edited' && l.prev_amount != null ? `${move(l.prev_from_user!, l.prev_to_user!, l.prev_amount)} became ${move(l.from_user, l.to_user, l.amount)}` : move(l.from_user, l.to_user, l.amount)];
                            } else {
                                const l = a.entry;
                                const what = l.kind === 'receipt' ? 'receipt' : 'expense';
                                line = <><span className="font-extrabold">{nm(l.actor)}</span> {l.action} {what === 'receipt' ? 'a receipt' : 'an expense'}: <span className="font-extrabold">{l.name}</span> · {fmt(l.total)}</>;
                                details = l.action === 'edited' ? l.changes.map(describeChange) : [];
                            }
                            return (
                                <div key={a.id} className={`px-3.5 py-3 flex flex-col gap-0.5 ${i ? 'border-t border-rule' : ''}`}>
                                    <span className="text-[14.5px] font-semibold">{line}</span>
                                    {details.map((d, j) => <span key={j} className="text-[13.5px] font-semibold text-muted">{d}</span>)}
                                    <span className="text-xs font-bold text-faint">{when}</span>
                                </div>
                            );
                        })}
                    </Card>
                )}
            </div>
    );
    const membersView = (
            <div className="flex flex-wrap gap-5 items-start">
                <Card className="flex-[999_1_420px] min-w-0 p-1.5">
                    {group.members.map((m, i) => (
                        <motion.div key={m.user_id} {...listItem(i)} className="flex flex-wrap items-center gap-3.5 p-3">
                            <Avatar name={m.name} tone={tones[m.user_id]} size={44} />
                            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                <span className="text-base font-extrabold truncate">{m.name}</span>
                                <span className="text-[13.5px] font-semibold text-faint truncate">{m.pending ? (isPersonal ? (m.linked_username ? `Linked to @${m.linked_username}` : 'Just a name') : 'Not joined yet') : m.username ? `@${m.username}` : m.email}</span>
                            </span>
                            {m.role === 'owner' && <span className="text-[12.5px] font-extrabold text-muted px-2.5 py-1 rounded-full bg-soft">Owner</span>}
                            {m.pending && <span className="text-[12.5px] font-extrabold text-muted px-2.5 py-1 rounded-full bg-soft">{isPersonal ? (m.linked_user ? 'Linked' : 'Name only') : 'Not joined'}</span>}
                            {isOwner && m.pending && (
                                <span className="flex items-center gap-2.5 text-xs font-extrabold text-body">
                                    <button type="button" onClick={() => setGuestOp({ id: m.user_id, kind: 'rename', value: m.name })} className="underline underline-offset-2">Rename</button>
                                    {isPersonal
                                        ? (m.linked_user
                                            ? <button type="button" onClick={async () => { setError(''); try { await linkPersonalPerson(m.user_id, ''); await reloadPeople(); } catch (er) { setError(messageOf(er, 'Could not unlink')); } }} className="underline underline-offset-2">Unlink</button>
                                            : <button type="button" onClick={() => setGuestOp({ id: m.user_id, kind: 'link', value: '' })} className="underline underline-offset-2">Link to account</button>)
                                        : !pending.some(p => p.name === m.name) && <button type="button" onClick={() => setGuestOp({ id: m.user_id, kind: 'link', value: '' })} className="underline underline-offset-2">Link to account</button>}
                                    <motion.button {...tapFlat} aria-label={`Remove ${m.name}`} onClick={() => dropGuest(m.user_id)} className="w-8 h-8 grid place-items-center rounded-full text-faint hover:bg-coral-tint hover:text-coral"><Icon name="close" size={18} /></motion.button>
                                </span>
                            )}
                            {isOwner && m.role !== 'owner' && !m.pending && (
                                <motion.button {...tapFlat} aria-label={`Remove ${m.name}`} onClick={() => setConfirm({ kind: 'remove', userId: m.user_id, name: m.name })} className="w-8 h-8 grid place-items-center rounded-full text-faint hover:bg-coral-tint hover:text-coral">
                                    <Icon name="close" size={18} />
                                </motion.button>
                            )}
                            {guestOp?.id === m.user_id && (
                                <div className="basis-full flex flex-wrap items-center gap-2 pt-1">
                                    <input autoFocus aria-label={guestOp.kind === 'link' ? `Username for ${m.name}` : `New name for ${m.name}`} value={guestOp.value} onChange={e => setGuestOp({ ...guestOp, value: e.target.value })} onKeyDown={e => e.key === 'Enter' && runGuestOp()} placeholder={guestOp.kind === 'link' ? '@username' : 'New name'} maxLength={60} className="h-10 px-4 border-[1.5px] border-line rounded-full bg-field text-sm font-bold flex-1 min-w-[160px]" />
                                    <Button height={38} className="px-4" disabled={!guestOp.value.trim()} onClick={runGuestOp}>{guestOp.kind === 'link' ? (isPersonal ? 'Link' : 'Send invite') : 'Rename'}</Button>
                                    <Button variant="secondary" height={38} className="px-4" onClick={() => setGuestOp(null)}>Cancel</Button>
                                </div>
                            )}
                        </motion.div>
                    ))}
                </Card>

                <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-3.5">
                    {isOwner && !isPersonal && (
                        <div className={panelCls}>
                            <span className="text-base font-black">Invite someone</span>
                            <span className="flex items-center gap-1 h-[46px] px-4 border-[1.5px] border-transparent rounded-full bg-white focus-within:border-[oklch(0.55_0.1_158)]">
                                <span className="font-bold text-faint">@</span>
                                <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleInvite()} placeholder="username" aria-label="Invite by username" autoCapitalize="none" className="flex-1 min-w-0 border-0 bg-transparent text-[15px] font-bold" />
                            </span>
                            <Button variant="band" height={44} wide onClick={handleInvite} disabled={!email.trim()}>Send invite</Button>
                            <span className="text-[13px] font-semibold leading-[1.45] text-[#5E6A60]">While an invite is pending you can already add them to expenses. They'll see the invite when they sign in, and everything moves to their account when they accept. They can find their username under Account.</span>
                            <AnimatePresence initial={false}>
                                {pending.map(p => (
                                    <motion.div key={p.id} layout initial={{ opacity: 0.8, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="flex items-center gap-2.5 px-3.5 py-2.5 bg-white rounded-full">
                                        <Icon name="schedule" size={18} className="text-faint" />
                                        <span className="flex-1 min-w-0 text-sm font-bold truncate">{p.name}</span>
                                        <motion.button {...tapFlat} onClick={async () => { setError(''); try { await revokeInvite(p.id); await refresh(); setPending(await listPendingInvites(groupId)); } catch (err) { setError(messageOf(err, 'Could not cancel that invite')); } }} className="text-[13px] font-extrabold text-coral">Revoke</motion.button>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                    {isOwner && (
                        <div className={panelCls}>
                            <span className="text-base font-black">{isPersonal ? 'Add someone by name' : 'Add a temporary person'}</span>
                            <input value={personName} onChange={e => setPersonName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPerson()} placeholder="Name" aria-label="Person's name" maxLength={60} className="h-[46px] px-4 border-[1.5px] border-transparent rounded-full bg-white text-[15px] font-bold" />
                            {isPersonal && <input value={personUser} onChange={e => setPersonUser(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPerson()} placeholder="@username (optional)" aria-label="Their username" autoCapitalize="none" className="h-[46px] px-4 border-[1.5px] border-transparent rounded-full bg-white text-[15px] font-bold" />}
                            <Button variant="band" height={44} wide onClick={addPerson} disabled={!personName.trim() && !(isPersonal && personUser.trim())}>Add</Button>
                            <span className="text-[13px] font-semibold leading-[1.45] text-[#5E6A60]">{isPersonal ? 'A name is enough, no account needed. Add their username too to link them to their account. Nobody is notified or shown anything; it just lets People show what is between you in Personal, kept apart from your real balances.' : "For a friend who hasn't signed up yet. Just a name: no account, nobody is notified. Use them in expenses like anyone else."}</span>
                        </div>
                    )}
                    {isPersonal ? null : isOwner ? (
                        <motion.button {...tapFlat} onClick={() => setConfirm({ kind: 'delete' })} className="self-start px-1.5 py-1 text-[14.5px] font-extrabold text-coral">Delete group</motion.button>
                    ) : (
                        <motion.button {...tapFlat} onClick={() => setConfirm({ kind: 'leave' })} className="self-start px-1.5 py-1 text-[14.5px] font-extrabold text-coral">Leave group</motion.button>
                    )}
                </div>
            </div>
    );

    if (isPersonal) {
        const owedToMe = net > 0.004 ? net : 0;
        const iOwe = net < -0.004 ? -net : 0;
        const section = 'm-0 px-1 text-[12.5px] font-extrabold uppercase tracking-[0.08em] text-faint';
        const tiles: [string, number, string][] = [['Total spent', totalCost, 'bg-wash text-ink'], ['Owed to you', owedToMe, 'bg-green-tint text-green-deep'], ['You owe', iOwe, 'bg-coral-tint text-[oklch(0.4_0.13_32)]']];
        return (
            <div className="max-w-[1040px] mx-auto flex flex-col gap-5">
                {modals}
                <div className="rounded-[24px] min-[560px]:rounded-[28px] bg-warm p-4 min-[560px]:p-6 flex flex-wrap items-center gap-3 min-[560px]:gap-4">
                    <span aria-hidden="true" className="w-11 h-11 min-[560px]:w-14 min-[560px]:h-14 rounded-full bg-white grid place-items-center text-[oklch(0.5_0.1_80)] shrink-0"><Icon name="lock" fill size={24} /></span>
                    <div className="flex-[1_1_240px] min-w-0 flex flex-col gap-0.5">
                        <span className="text-[12.5px] font-extrabold uppercase tracking-[0.08em] text-[#8A6A2C]">Private notebook</span>
                        {/* The phone header already says "Personal", so the big title only shows where there is no header. */}
                        <h1 className="m-0 text-[30px] font-black tracking-title leading-[1.05] sr-only min-[760px]:not-sr-only">Personal</h1>
                        <p className="m-0 text-[14.5px] min-[560px]:text-[15px] font-semibold text-[#6E655C] max-w-[520px]">Only you can see this. Keep track of what people owe you outside any group.</p>
                    </div>
                    {addMenu}
                </div>

                <div className="grid grid-cols-3 gap-2 min-[560px]:gap-3" aria-label="Personal totals">
                    {tiles.map(([label, value, tone]) => (
                        <div key={label} className={`px-3 py-3 min-[560px]:px-5 min-[560px]:py-4 rounded-[18px] min-[560px]:rounded-[22px] flex flex-col gap-0.5 min-w-0 ${tone}`}>
                            <span className="text-[12px] min-[560px]:text-[13.5px] font-extrabold opacity-80 truncate">{label}</span>
                            <AnimatedNumber value={value} prefix="$" className="text-[17px] min-[560px]:text-[26px] font-black tracking-[-0.02em] truncate" />
                        </div>
                    ))}
                </div>

                <Pop show={!!error} className="px-4 py-2.5 rounded-[22px] bg-coral-tint text-coral-on text-[13.5px] font-extrabold">{error}</Pop>
                <Pop show={!!notice} className="px-4 py-2.5 rounded-[22px] bg-green-tint text-green-on text-[13.5px] font-extrabold">{notice}</Pop>

                <div className="flex flex-wrap gap-6 items-start">
                    <section className="flex-[999_1_460px] min-w-0 flex flex-col gap-3" aria-label="Personal ledger">
                        <h2 className={section}>Ledger</h2>
                        {expensesView}
                    </section>
                    <aside className="flex-[1_1_340px] min-w-0 flex flex-col gap-3 order-first min-[840px]:order-none">
                        <SegmentedTabs id="personal-side" value={side} onChange={setSide} tabs={[{ value: 'balances', label: 'Balances' }, { value: 'people', label: `People ${group.members.length}` }]} />
                        {side === 'balances'
                            ? <section aria-label="Personal balances">{balancesView}</section>
                            : <section aria-label="Personal people">{membersView}</section>}
                    </aside>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-[1000px] mx-auto flex flex-col gap-6">
            {modals}

            <div className="flex flex-wrap items-center justify-between gap-[18px]">
                <div className="flex flex-col gap-3 min-w-0">
                    {isPersonal ? (
                        <div className="flex flex-col gap-1.5 min-w-0">
                            <h1 className="m-0 text-[32px] font-black tracking-title leading-[1.05] flex items-center gap-2.5">Personal<Icon name="lock" fill size={24} className="text-ghost" /></h1>
                            <p className="m-0 text-base font-semibold text-muted max-w-[560px]">For expenses that don't belong to any group, plus the quick splits you've made. Only you can see this.</p>
                        </div>
                    ) : (
                        <div className="flex items-center gap-4 min-w-0">
                            <span aria-hidden="true" className="w-16 h-16 rounded-full grid place-items-center text-[26px] font-black shrink-0" style={{ background: tile.bg, color: tile.fg }}>{(group.name.trim()[0] ?? '?').toUpperCase()}</span>
                            <div className="flex flex-col gap-1.5 min-w-0">
                                <h1 className="m-0 text-[32px] font-black tracking-title leading-[1.05] truncate">{group.name}</h1>
                                <div className="flex items-center gap-2.5 flex-wrap">
                                    <AvatarStack size={26} people={group.members.map(m => ({ name: m.name, tone: tones[m.user_id] }))} />
                                    <span className={`text-[15px] font-extrabold ${balanceColor}`}>{balanceLine}</span>
                                </div>
                                <div className="text-sm font-semibold text-muted">
                                    Total cost <span className="font-extrabold text-ink">{fmt(totalCost)}</span> across {publishedCount} {publishedCount === 1 ? 'expense' : 'expenses'}
                                </div>
                            </div>
                        </div>
                    )}
                    {isPersonal && (
                        <div className="text-sm font-semibold text-muted">
                            Total cost <span className="font-extrabold text-ink">{fmt(totalCost)}</span> across {publishedCount} {publishedCount === 1 ? 'expense' : 'expenses'}
                        </div>
                    )}
                </div>
                {addMenu}
            </div>

            <UnderlineTabs id="group" value={tab} onChange={setTab} tabs={[
                { value: 'expenses', label: 'Expenses', count: records.length },
                { value: 'balances', label: 'Balances' },
                ...(isEnabled('activity') ? [{ value: 'activity' as const, label: 'Activity' }] : []),
                { value: 'members', label: 'Members', count: group.members.length },
            ]} />

            <Pop show={!!error} className="px-4 py-2.5 rounded-[22px] bg-coral-tint text-coral-on text-[13.5px] font-extrabold">{error}</Pop>
            <Pop show={!!notice} className="px-4 py-2.5 rounded-[22px] bg-green-tint text-green-on text-[13.5px] font-extrabold">{notice}</Pop>

            <motion.div key={tab} initial={{ y: 10 }} animate={{ y: 0 }} transition={{ duration: 0.18 }}>
                {tab === 'expenses' && expensesView}

                {tab === 'balances' && balancesView}

                {tab === 'activity' && activityView}

                {tab === 'members' && membersView}
            </motion.div>
        </div>
    );
}
