import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, Pop, Modal, UnderlineTabs, AnimatedNumber, listItem, spring, tapFlat } from '../lib/motion';
import { useAppData } from '../lib/appData';
import { useDismiss } from '../lib/hooks';
import { createSession, deleteGroup, removeMember, inviteToGroup, listPendingInvites, revokeInvite, recordSettlement, PendingInvite, Session } from '../lib/api';
import { groupLedger } from '../lib/ledger';
import { computeBalances } from '../lib/balances';
import { categoryOf, CATEGORIES, everyoneEqual, myShare, totalOf } from '../lib/expenses';
import { fmt, memberTones } from '../lib/people';
import { Avatar, AvatarStack, Button, Card, Icon, inputCls } from './ui';

export type GroupTab = 'expenses' | 'balances' | 'members';

interface GroupDetailProps {
    groupId: string;
    initialTab?: GroupTab;
    narrow: boolean;
    onBack: () => void;
    onImport: () => void;
    onOpenRecord: (id: string, kind: 'receipt' | 'expense') => void;
}

type Confirm = null | { kind: 'leave' | 'delete' | 'remove'; userId?: string; name?: string };

const monthLabel = (iso: string) => {
    const d = new Date(iso + 'T00:00');
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString('en-US', sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' });
};

export default function GroupDetail({ groupId, initialTab = 'expenses', narrow, onBack, onImport, onOpenRecord }: GroupDetailProps) {
    const { me, groups, sessions, settlements, refresh, loading } = useAppData();
    const group = groups.find(g => g.id === groupId);
    const [tab, setTab] = useState<GroupTab>(initialTab);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState<string | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [pending, setPending] = useState<PendingInvite[]>([]);
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [confirm, setConfirm] = useState<Confirm>(null);
    const [settling, setSettling] = useState(false);
    const creating = useRef(false);
    const addRef = useRef<HTMLDivElement>(null);

    // Keep the last dialog's content around while its exit animation plays.
    const lastConfirm = useRef(confirm);
    if (confirm) lastConfirm.current = confirm;
    const shownConfirm = confirm ?? lastConfirm.current;

    const closeAdd = useCallback(() => setAddOpen(false), []);
    useDismiss(addRef, addOpen, closeAdd);

    const isOwner = !!group && group.owner_id === me;
    const records = useMemo(
        () => sessions.filter(s => s.group_id === groupId).sort((a, b) => b.session_date.localeCompare(a.session_date) || b.updated_at.localeCompare(a.updated_at)),
        [sessions, groupId]
    );

    useEffect(() => {
        if (!isOwner) { setPending([]); return; }
        listPendingInvites(groupId).then(setPending).catch(err => setError(err.message));
    }, [groupId, isOwner]);

    const tones = useMemo(() => memberTones(group?.members ?? [], me), [group, me]);
    const nameOf = (id: string | null) => (id === me ? 'you' : group?.members.find(m => m.user_id === id)?.name ?? 'someone');
    const net = useMemo(() => computeBalances(me, groups, sessions, settlements).byGroup[groupId] ?? 0, [me, groups, sessions, settlements, groupId]);
    const meMember = group?.members.find(m => m.user_id === me);

    const ledger = useMemo(
        () => (group ? groupLedger(group, records, settlements.filter(p => p.group_id === groupId)) : null),
        [group, records, settlements, groupId]
    );
    const maxNet = Math.max(0.01, ...(ledger?.members.map(m => Math.abs(m.net)) ?? []));

    const categoriesPresent = useMemo(() => CATEGORIES.filter(c => records.some(r => r.category === c.id)), [records]);

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return records.filter(r => {
            if (category && r.category !== category) return false;
            if (!q) return true;
            return r.name.toLowerCase().includes(q) || categoryOf(r.category).label.toLowerCase().includes(q) || r.items.some(i => i.name.toLowerCase().includes(q));
        });
    }, [records, search, category]);

    const months = useMemo(() => {
        const out: { label: string; rows: Session[] }[] = [];
        for (const r of shown) {
            const label = monthLabel(r.session_date);
            const bucket = out.find(m => m.label === label) ?? (out[out.push({ label, rows: [] }) - 1]);
            bucket.rows.push(r);
        }
        return out;
    }, [shown]);

    if (!group) {
        return <p className="text-center text-faint py-16 animate-pulse">{loading ? 'Loading group…' : 'This group is no longer available.'}</p>;
    }

    const memberNames = group.members.map(m => m.name);

    const addReceiptByHand = async () => {
        setAddOpen(false);
        if (creating.current) return; // a double click must not create two records (stays locked: success navigates away)
        creating.current = true;
        try {
            const id = await createSession({ groupId, name: 'Receipt', participants: memberNames, category: 'groceries' });
            await refresh();
            onOpenRecord(id, 'receipt');
        } catch (err: any) { creating.current = false; setError(err.message || 'Could not create the receipt'); }
    };

    const addExpense = async () => {
        setAddOpen(false);
        if (creating.current) return;
        creating.current = true;
        try {
            const id = await createSession({
                groupId, kind: 'expense', name: 'New expense', category: 'other', amount: 0,
                splitMethod: 'equal', splitData: everyoneEqual(group.members.map(m => m.user_id)),
            });
            await refresh();
            onOpenRecord(id, 'expense');
        } catch (err: any) { creating.current = false; setError(err.message || 'Could not create the expense'); }
    };

    const handleInvite = async () => {
        const e = email.trim().toLowerCase();
        setError(''); setNotice('');
        if (!/^\S+@\S+\.\S+$/.test(e)) return setError('Enter a valid email address.');
        if (group.members.some(m => m.email === e)) return setError('That person is already in this group.');
        try {
            await inviteToGroup(groupId, e);
            setEmail('');
            setNotice(`Invite sent to ${e}. They'll see it when they sign in with that email.`);
            setPending(await listPendingInvites(groupId));
        } catch (err: any) { setError(err.message); }
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
        } catch (err: any) { setError(err.message || 'Action failed'); }
    };

    const settle = async (from: string, to: string, amount: number) => {
        if (settling) return;
        setSettling(true);
        setError('');
        try {
            await recordSettlement(groupId, from, to, amount);
            await refresh();
        } catch (err: any) {
            setError(err.message || 'Could not record that payment');
        } finally {
            setSettling(false);
        }
    };
    const who = (id: string) => (id === me ? 'You' : group.members.find(m => m.user_id === id)?.name ?? 'Someone');

    const confirmText = {
        delete: { title: 'Delete group?', body: `This permanently deletes "${group.name}" and all ${records.length} of its expenses for every member.`, action: 'Delete' },
        leave: { title: 'Leave group?', body: `You'll lose access to "${group.name}" and its expenses unless someone invites you again.`, action: 'Leave' },
        remove: { title: 'Remove member?', body: `Remove ${shownConfirm?.name} from "${group.name}"? They lose access to its expenses.`, action: 'Remove' },
    };

    const balanceLine = Math.abs(net) < 0.005 ? "Everyone's square" : net > 0 ? `You're owed ${fmt(net)} here` : `You owe ${fmt(net)} here`;

    return (
        <div className="max-w-[820px] mx-auto flex flex-col gap-7">
            <Modal open={!!confirm} onClose={() => setConfirm(null)}>
                {shownConfirm && (
                    <>
                        <h3 className="m-0 mb-2 text-xl font-semibold text-ink">{confirmText[shownConfirm.kind].title}</h3>
                        <p className="m-0 mb-6 text-muted leading-relaxed">{confirmText[shownConfirm.kind].body}</p>
                        <div className="flex gap-3">
                            <Button variant="secondary" wide height={42} onClick={() => setConfirm(null)}>Cancel</Button>
                            <Button wide height={42} className="!bg-coral-strong hover:opacity-90" onClick={handleConfirm}>{confirmText[shownConfirm.kind].action}</Button>
                        </div>
                    </>
                )}
            </Modal>

            <div className="flex flex-wrap items-end justify-between gap-5">
                <div className="flex flex-col gap-3 min-w-0">
                    {!narrow && (
                        <motion.button {...tapFlat} onClick={onBack} className="self-start flex items-center gap-1 text-[13px] text-muted hover:text-ink"><Icon name="arrow_back" size={16} />Home</motion.button>
                    )}
                    <h1 className="m-0 text-[30px] font-semibold tracking-title truncate">{group.name}</h1>
                    <div className="flex items-center gap-3">
                        <AvatarStack size={28} people={group.members.map(m => ({ name: m.name, tone: tones[m.user_id] }))} />
                        <span className="text-sm text-body">{balanceLine}</span>
                    </div>
                </div>
                <div className="relative" ref={addRef}>
                    <Button height={42} className="px-[18px]" aria-expanded={addOpen} aria-haspopup="menu" onClick={() => setAddOpen(o => !o)}>
                        <Icon name="add" size={20} />Add expense
                    </Button>
                    <AnimatePresence>
                        {addOpen && (
                            <motion.div
                                role="menu"
                                className="absolute right-0 top-12 z-10 w-[300px] max-w-[calc(100vw-32px)] bg-white border border-edge rounded-[14px] shadow-popover p-1.5 flex flex-col origin-top-right"
                                initial={{ opacity: 0.8, scale: 0.94, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: -4 }} transition={spring}
                            >
                                {[
                                    { icon: 'photo_camera', title: 'Import from a photo', desc: 'Use any AI chat to read a grocery receipt for you', go: () => { setAddOpen(false); onImport(); } },
                                    { icon: 'edit_note', title: 'Enter a receipt by hand', desc: 'Start blank and add items yourself', go: addReceiptByHand },
                                    { icon: 'payments', title: 'Split a bill or cost', desc: 'Rent, utilities, dinner, a trip. Pick who shares it', go: addExpense },
                                ].map(o => (
                                    <motion.button key={o.title} role="menuitem" {...tapFlat} onClick={o.go} className="flex gap-3 p-3 rounded-[10px] bg-white text-left text-ink hover:bg-wash transition-colors">
                                        <Icon name={o.icon} size={22} />
                                        <span className="flex flex-col gap-0.5"><span className="text-sm font-semibold">{o.title}</span><span className="text-[13px] text-muted leading-[1.4]">{o.desc}</span></span>
                                    </motion.button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <UnderlineTabs id="group" value={tab} onChange={setTab} tabs={[
                { value: 'expenses', label: `Expenses · ${records.length}` },
                { value: 'balances', label: 'Balances' },
                { value: 'members', label: `Members · ${group.members.length}` },
            ]} />

            <Pop show={!!error} className="px-3 py-2.5 rounded-[10px] bg-coral-tint text-coral-on text-[13px]">{error}</Pop>
            <Pop show={!!notice} className="px-3 py-2.5 rounded-[10px] bg-green-tint text-green-on text-[13px]">{notice}</Pop>

            <motion.div key={tab} initial={{ y: 10 }} animate={{ y: 0 }} transition={{ duration: 0.18 }}>
                {tab === 'expenses' && (
                    <div className="flex flex-col gap-6">
                        <div className="flex items-center gap-2 h-[42px] px-3.5 bg-white border border-edge rounded-[10px]">
                            <Icon name="search" size={20} className="text-faint" />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search expenses or items" aria-label="Search expenses" className="flex-1 min-w-0 border-0 bg-transparent text-sm" />
                        </div>

                        {categoriesPresent.length > 1 && (
                            <div className="flex flex-wrap gap-2 -mt-2" role="group" aria-label="Filter by category">
                                {[{ id: null as string | null, label: 'All', icon: '' }, ...categoriesPresent].map(c => {
                                    const on = category === c.id;
                                    return (
                                        <motion.button key={c.label} {...tapFlat} onClick={() => setCategory(on && c.id ? null : c.id)} aria-pressed={on}
                                            className={`h-8 px-3 rounded-full text-[13px] font-semibold border transition-colors flex items-center gap-1.5 ${on ? 'bg-ink text-white border-ink' : 'bg-white text-body border-line hover:bg-surface'}`}>
                                            {c.icon && <Icon name={c.icon} size={16} />}{c.label}
                                        </motion.button>
                                    );
                                })}
                            </div>
                        )}

                        {months.map(m => (
                            <div key={m.label} className="flex flex-col gap-2">
                                <span className="text-[13px] font-medium text-faint">{m.label}</span>
                                <Card className="overflow-hidden">
                                    {m.rows.map((r, i) => {
                                        const d = new Date(r.session_date + 'T00:00');
                                        const total = totalOf(r);
                                        const share = myShare(r, meMember);
                                        const meta = r.kind === 'expense' ? categoryOf(r.category).label : `${r.items.length} ${r.items.length === 1 ? 'item' : 'items'}`;
                                        return (
                                            <motion.div key={r.id} {...listItem(i)}>
                                                <motion.button
                                                    {...tapFlat}
                                                    onClick={() => onOpenRecord(r.id, r.kind)}
                                                    className={`w-full flex items-center gap-4 px-[18px] py-3.5 bg-white text-left hover:bg-wash transition-colors ${i ? 'border-t border-rule' : ''}`}
                                                >
                                                    <span className="w-[42px] shrink-0 flex flex-col items-center leading-[1.1]">
                                                        <span className="text-[11px] font-medium text-faint">{d.toLocaleDateString('en-US', { month: 'short' })}</span>
                                                        <span className="text-lg font-semibold">{d.getDate()}</span>
                                                    </span>
                                                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                                        <span className="text-[15px] font-semibold truncate flex items-center gap-1.5">
                                                            {r.kind === 'expense' && <Icon name={categoryOf(r.category).icon} size={16} className="text-faint" />}{r.name}
                                                        </span>
                                                        <span className="text-[13px] text-faint">{meta} · paid by {nameOf(r.paid_by)}</span>
                                                    </span>
                                                    <span className="shrink-0 flex flex-col items-end gap-0.5">
                                                        <span className="text-[15px] font-semibold">{fmt(total)}</span>
                                                        <span className="text-xs text-faint">your share {fmt(share)}</span>
                                                    </span>
                                                </motion.button>
                                            </motion.div>
                                        );
                                    })}
                                </Card>
                            </div>
                        ))}

                        {months.length === 0 && (
                            <p className="m-0 p-8 text-center text-sm text-faint border border-dashed border-line rounded-[14px]">
                                {records.length ? 'Nothing matches that search.' : 'No expenses yet. Add one and everyone in the group can see it.'}
                            </p>
                        )}
                    </div>
                )}

                {tab === 'balances' && ledger && (
                    <div className="flex flex-col gap-5">
                        <Card className="overflow-hidden">
                            <div className="px-[18px] pt-4 pb-1 text-[15px] font-semibold">Where everyone stands</div>
                            {ledger.members.map((m, i) => {
                                const member = group.members.find(x => x.user_id === m.userId)!;
                                const square = Math.abs(m.net) < 0.005;
                                return (
                                    <motion.div key={m.userId} {...listItem(i)} className={`flex flex-col gap-1.5 px-[18px] py-3.5 ${i ? 'border-t border-rule' : ''}`}>
                                        <div className="flex items-center gap-3">
                                            <Avatar name={member.name} tone={tones[m.userId]} size={36} />
                                            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                                <span className="text-[15px] font-semibold truncate">{who(m.userId)}</span>
                                                <span className="text-[13px] text-faint">fronted {fmt(m.paid)} · owes {fmt(m.owes)}</span>
                                            </span>
                                            <span className="shrink-0 flex flex-col items-end gap-0.5">
                                                {square ? <span className="text-[15px] font-semibold text-faint">Settled</span> : <AnimatedNumber value={Math.abs(m.net)} prefix="$" className={`text-[15px] font-semibold ${m.net > 0 ? 'text-green' : 'text-coral'}`} />}
                                                <span className="text-xs text-faint">{square ? 'all square' : m.net > 0 ? (m.userId === me ? "you're owed" : 'is owed') : m.userId === me ? 'you owe' : 'owes'}</span>
                                            </span>
                                        </div>
                                        <div className="h-[3px] ml-12 rounded-sm bg-surface">
                                            <motion.div className={`h-full rounded-sm opacity-60 ${m.net > 0 ? 'bg-green' : 'bg-coral'}`} initial={false} animate={{ width: `${(Math.abs(m.net) / maxNet) * 100}%` }} transition={{ duration: 0.25 }} />
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </Card>

                        <div className="flex flex-col gap-2">
                            <span className="text-[15px] font-semibold">Who owes whom</span>
                            {ledger.debts.length === 0 ? (
                                <p className="m-0 px-4 py-3.5 rounded-[14px] bg-green-tint text-green-on text-sm font-medium">Everyone's square.</p>
                            ) : (
                                <Card className="overflow-hidden">
                                    <AnimatePresence initial={false}>
                                        {ledger.debts.map((d, i) => {
                                            const mine = d.from === me || d.to === me;
                                            return (
                                                <motion.div key={`${d.from}-${d.to}`} {...listItem(i)} className={`flex flex-wrap items-center gap-3 px-[18px] py-3 ${i ? 'border-t border-rule' : ''}`}>
                                                    <span className="flex-1 min-w-[160px] text-sm">
                                                        <span className="font-semibold">{who(d.from)}</span> {d.from === me ? 'owe' : 'owes'} <span className="font-semibold">{who(d.to)}</span>
                                                    </span>
                                                    <span className="font-mono text-sm font-medium">{fmt(d.amount)}</span>
                                                    {mine && (
                                                        <Button variant="secondary" height={32} className="rounded-lg px-3 text-[13px]" disabled={settling} onClick={() => settle(d.from, d.to, d.amount)}>
                                                            {d.from === me ? 'Mark paid' : 'Mark received'}
                                                        </Button>
                                                    )}
                                                </motion.div>
                                            );
                                        })}
                                    </AnimatePresence>
                                </Card>
                            )}
                            <span className="text-xs leading-normal text-faint">Marking something paid doesn't move money. It just clears the balance for both of you. Friends shows the same numbers across all your groups.</span>
                        </div>
                    </div>
                )}

                {tab === 'members' && (
                    <div className="flex flex-col gap-5">
                        {isOwner && (
                            <Card className="p-[18px] flex flex-col gap-2.5">
                                <span className="text-[15px] font-semibold">Invite someone</span>
                                <div className="flex gap-2">
                                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleInvite()} placeholder="friend@example.com" aria-label="Invite by email" className={`${inputCls} flex-1 min-w-0 text-sm`} />
                                    <Button height={42} onClick={handleInvite} disabled={!email.trim()}>Send invite</Button>
                                </div>
                                <span className="text-[13px] leading-normal text-faint">They'll see it on their home screen when they sign in with that email.</span>
                                <AnimatePresence initial={false}>
                                    {pending.map(p => (
                                        <motion.div key={p.id} layout initial={{ opacity: 0.8, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="flex items-center gap-2.5 px-3 py-2.5 bg-surface rounded-[10px]">
                                            <Icon name="schedule" size={18} className="text-faint" />
                                            <span className="flex-1 text-sm truncate">{p.email}</span>
                                            <motion.button {...tapFlat} onClick={async () => { await revokeInvite(p.id); setPending(await listPendingInvites(groupId)); }} className="text-[13px] font-semibold text-coral">Revoke</motion.button>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </Card>
                        )}

                        <Card className="overflow-hidden">
                            {group.members.map((m, i) => (
                                <motion.div key={m.user_id} {...listItem(i)} className={`flex items-center gap-3.5 px-[18px] py-3.5 ${i ? 'border-t border-rule' : ''}`}>
                                    <Avatar name={m.name} tone={tones[m.user_id]} size={36} />
                                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                        <span className="text-[15px] font-semibold truncate">{m.name}{m.user_id === me ? ' (you)' : ''}</span>
                                        <span className="text-[13px] text-faint truncate">{m.email}</span>
                                    </span>
                                    {m.role === 'owner' && <span className="text-xs text-muted">Owner</span>}
                                    {isOwner && m.role !== 'owner' && (
                                        <motion.button {...tapFlat} aria-label={`Remove ${m.name}`} onClick={() => setConfirm({ kind: 'remove', userId: m.user_id, name: m.name })} className="w-8 h-8 grid place-items-center rounded-full text-faint hover:bg-coral-tint hover:text-coral">
                                            <Icon name="close" size={18} />
                                        </motion.button>
                                    )}
                                </motion.div>
                            ))}
                        </Card>

                        {isOwner ? (
                            <motion.button {...tapFlat} onClick={() => setConfirm({ kind: 'delete' })} className="self-start text-sm font-semibold text-coral">Delete group</motion.button>
                        ) : (
                            <motion.button {...tapFlat} onClick={() => setConfirm({ kind: 'leave' })} className="self-start text-sm font-semibold text-coral">Leave group</motion.button>
                        )}
                    </div>
                )}
            </motion.div>
        </div>
    );
}
