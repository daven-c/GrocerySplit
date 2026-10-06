import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, Collapse, Pop, AnimatedNumber, listItem, tapFlat } from '../lib/motion';
import { useAppData } from '../lib/appData';
import { createGroup, respondToInvite, setGroupPinned } from '../lib/api';
import { computeBalances } from '../lib/balances';
import { firstName, fmt, fmtSigned, greeting, memberTones } from '../lib/people';
import { totalOf } from '../lib/expenses';
import { startQuickSplit } from '../lib/quickSplit';
import { Avatar, Button, Card, Icon } from './ui';

type Sort = 'recent' | 'name' | 'balance' | 'spent';
const SORTS: { value: Sort; label: string }[] = [
    { value: 'recent', label: 'Recent activity' },
    { value: 'name', label: 'Name' },
    { value: 'balance', label: 'Biggest balance' },
    { value: 'spent', label: 'Most spent' },
];
const SORT_KEY = 'splitpot:groupSort';
const storedSort = (): Sort => { try { const v = localStorage.getItem(SORT_KEY); return SORTS.some(s => s.value === v) ? (v as Sort) : 'recent'; } catch { return 'recent'; } };

interface DashboardProps {
    user: { id: string; name: string };
    narrow: boolean;
    /** Bumped by the sidebar "+" to open the inline group creator. */
    newGroupTick: number;
    onOpenGroup: (groupId: string, tab?: 'expenses' | 'members') => void;
    onGoFriends: () => void;
}

export default function Dashboard({ user, newGroupTick, onOpenGroup, onGoFriends }: DashboardProps) {
    const { me, groups, sessions, settlements, invites, loading, error, refresh } = useAppData();
    const [newGroupOpen, setNewGroupOpen] = useState(false);
    const [name, setName] = useState('');
    const [problem, setProblem] = useState('');
    const input = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState<Sort>(storedSort);

    useEffect(() => { if (newGroupTick > 0) setNewGroupOpen(true); }, [newGroupTick]);
    useEffect(() => { if (newGroupOpen) input.current?.focus(); }, [newGroupOpen]);

    const sharedGroups = useMemo(() => groups.filter(g => !g.personal), [groups]);
    const isPinned = (g: { members: { user_id: string; pinned?: boolean }[] }) => !!g.members.find(m => m.user_id === me)?.pinned;
    const togglePin = async (id: string, pinned: boolean) => {
        setProblem('');
        try { await setGroupPinned(id, pinned); await refresh(); }
        catch (err: any) { setProblem(err.message || 'Could not pin that group'); }
    };
    const balances = useMemo(() => computeBalances(me, sharedGroups, sessions, settlements), [me, sharedGroups, sessions, settlements]);
    const stats = useMemo(() => Object.fromEntries(sharedGroups.map(g => {
        const recs = sessions.filter(s => s.group_id === g.id && !s.draft);
        const last = recs.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), g.created_at);
        return [g.id, { net: balances.byGroup[g.id] ?? 0, count: recs.length, spent: recs.reduce((a, r) => a + totalOf(r), 0), last }];
    })), [sharedGroups, sessions, balances]);
    // Pinned groups first, then the chosen order.
    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        const pin = (g: typeof groups[number]) => (g.members.find(m => m.user_id === me)?.pinned ? 0 : 1);
        return sharedGroups
            .filter(g => !q || g.name.toLowerCase().includes(q) || g.members.some(m => m.name.toLowerCase().includes(q)))
            .sort((a, b) => pin(a) - pin(b) || (sort === 'name' ? a.name.localeCompare(b.name)
                : sort === 'balance' ? Math.abs(stats[b.id].net) - Math.abs(stats[a.id].net)
                : sort === 'spent' ? stats[b.id].spent - stats[a.id].spent
                : stats[b.id].last.localeCompare(stats[a.id].last)) || a.name.localeCompare(b.name));
    }, [sharedGroups, query, sort, stats, me]);
    const { owed, owe } = useMemo(() => {
        let owed = 0, owe = 0;
        for (const f of Object.values(balances.friends)) {
            if (f.net > 0.004) owed += f.net;
            else if (f.net < -0.004) owe -= f.net;
        }
        return { owed, owe };
    }, [balances]);

    const handleCreate = async () => {
        const n = name.trim();
        if (!n) return;
        setProblem('');
        try {
            const id = await createGroup(n);
            setName('');
            setNewGroupOpen(false);
            await refresh();
            onOpenGroup(id, 'members');
        } catch (err: any) {
            setProblem(err.message || 'Could not create the group');
        }
    };

    const handleRespond = async (id: string, accept: boolean) => {
        setProblem('');
        try {
            await respondToInvite(id, accept);
            await refresh();
        } catch (err: any) {
            setProblem(err.message || 'Could not answer the invite');
        }
    };

    return (
        <div className="max-w-[760px] mx-auto flex flex-col gap-8">
            <div className="flex flex-col gap-1.5">
                <h1 className="m-0 text-[28px] font-semibold tracking-title">{greeting()}, {firstName(user.name)}</h1>
                <p className="m-0 text-[15px] text-muted">Here's where things stand across your groups.</p>
            </div>

            <Card className="flex flex-wrap">
                <div className="flex-[1_1_140px] px-[22px] py-5 flex flex-col gap-1">
                    <span className="text-[13px] text-muted">You're owed</span>
                    <AnimatedNumber value={owed} prefix="$" className="text-[30px] font-semibold tracking-[-0.02em] text-green" />
                </div>
                <div className="flex-[1_1_140px] px-[22px] py-5 flex flex-col gap-1 border-l border-rule">
                    <span className="text-[13px] text-muted">You owe</span>
                    <AnimatedNumber value={owe} prefix="$" className="text-[30px] font-semibold tracking-[-0.02em] text-coral" />
                </div>
                <div className="flex-[1_1_160px] px-[22px] py-5 flex items-center justify-end max-[519px]:border-t max-[519px]:border-rule">
                    <Button variant="secondary" height={38} onClick={onGoFriends}>Settle up</Button>
                </div>
            </Card>

            <Pop show={!!(error || problem)} className="px-3 py-2.5 rounded-[10px] bg-coral-tint text-coral-on text-[13px]">{error || problem}</Pop>

            <AnimatePresence initial={false}>
                {invites.length > 0 && (
                    <motion.div key="invites" className="flex flex-col gap-2.5" initial={{ opacity: 0.8 }} animate={{ opacity: 1 }}>
                        {invites.map((inv, i) => (
                            <motion.div key={inv.id} {...listItem(i)} className="flex flex-wrap items-center gap-3.5 px-4 py-3.5 rounded-[14px] bg-green-tint">
                                <Icon name="mail" size={22} className="text-green-icon" />
                                <div className="flex-[1_1_180px] flex flex-col gap-0.5">
                                    <span className="text-[15px] font-semibold">{inv.inviter_name} invited you to {inv.group_name}</span>
                                    <span className="text-[13px] text-body">Join to share expenses with them.</span>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="ghost" height={34} className="text-body px-3.5" onClick={() => handleRespond(inv.id, false)}>Decline</Button>
                                    <Button height={34} className="rounded-lg px-4" onClick={() => handleRespond(inv.id, true)}>Join group</Button>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <h2 className="m-0 text-[17px] font-semibold">Groups</h2>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" height={34} className="rounded-lg px-3" title="A shareable page to split one bill, no group needed" onClick={() => startQuickSplit().catch(err => setProblem(err.message || 'Could not start a quick split'))}>
                            <Icon name="bolt" size={18} />Quick split
                        </Button>
                        <Button variant="ghost" height={34} className="rounded-lg px-3" onClick={() => setNewGroupOpen(o => !o)}>
                            <Icon name="add" size={18} />New group
                        </Button>
                    </div>
                </div>

                <Collapse open={newGroupOpen}>
                    <div className="flex gap-2 p-3 bg-white border border-ink rounded-[14px] mb-0.5">
                        <input
                            ref={input}
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreate()}
                            placeholder="Name it — a household, a trip, a club"
                            aria-label="Group name"
                            className="flex-1 min-w-0 h-10 px-3 border-0 text-[15px] bg-transparent"
                        />
                        <Button height={40} onClick={handleCreate}>Create</Button>
                    </div>
                </Collapse>

                {loading ? (
                    <p className="text-center text-faint py-10 m-0 animate-pulse">Loading your groups…</p>
                ) : (
                    <>
                        {sharedGroups.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                <input aria-label="Search groups" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search groups or people" className="flex-1 min-w-[180px] h-[38px] px-3 border border-line rounded-[10px] bg-white text-sm" />
                                <select aria-label="Sort groups" value={sort} onChange={e => { const v = e.target.value as Sort; setSort(v); try { localStorage.setItem(SORT_KEY, v); } catch { /* not remembered */ } }} className="h-[38px] px-2.5 border border-line rounded-[10px] bg-white text-sm text-ink">
                                    {SORTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                        )}

                        {sharedGroups.length === 0 ? (
                            <div className="text-center py-10 px-6 border border-dashed border-line rounded-[14px] text-faint">
                                <p className="m-0 text-[15px] font-semibold text-body">No groups yet.</p>
                                <p className="m-0 mt-1 text-sm">Start one for your household, a trip or a club, then invite the people you share costs with.</p>
                            </div>
                        ) : visible.length === 0 ? (
                            <p className="text-center text-faint py-8 m-0">No groups match "{query}".</p>
                        ) : (
                            <Card className="overflow-hidden">
                                {visible.map((g, i) => {
                                    const tones = memberTones(g.members, me);
                                    const st = stats[g.id];
                                    const settled = Math.abs(st.net) < 0.005;
                                    const pinned = isPinned(g);
                                    return (
                                        <motion.div key={g.id} {...listItem(i)} className={`flex items-stretch bg-white hover:bg-wash transition-colors ${i ? 'border-t border-rule' : ''}`}>
                                            <motion.button {...tapFlat} onClick={() => onOpenGroup(g.id)} className="flex-1 min-w-0 flex items-center gap-4 pl-[18px] pr-2 py-4 bg-transparent text-left">
                                                <span className="flex pl-2 shrink-0">
                                                    {g.members.slice(0, 4).map(m => <Avatar key={m.user_id} name={m.name} tone={tones[m.user_id]} size={30} ring className="-ml-2" />)}
                                                </span>
                                                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                                    <span className="text-[15px] font-semibold truncate">{g.name}</span>
                                                    <span className="text-[13px] text-faint">{g.members.length} {g.members.length === 1 ? 'person' : 'people'} · {st.count} {st.count === 1 ? 'expense' : 'expenses'} · {fmt(st.spent)} total</span>
                                                </span>
                                                <span className="shrink-0 flex flex-col items-end gap-0.5">
                                                    <span className={`text-[15px] font-semibold ${settled ? 'text-faint' : st.net > 0 ? 'text-green' : 'text-coral'}`}>{settled ? 'Settled' : fmtSigned(st.net)}</span>
                                                    <span className="text-xs text-faint">{settled ? 'all square' : st.net > 0 ? "you're owed" : 'you owe'}</span>
                                                </span>
                                            </motion.button>
                                            <motion.button
                                                {...tapFlat}
                                                aria-label={pinned ? `Unpin ${g.name}` : `Pin ${g.name}`}
                                                aria-pressed={pinned}
                                                onClick={() => togglePin(g.id, !pinned)}
                                                className={`w-11 shrink-0 grid place-items-center ${pinned ? 'text-ink' : 'text-ghost hover:text-body'}`}
                                            >
                                                <Icon name="push_pin" fill={pinned} size={20} />
                                            </motion.button>
                                        </motion.div>
                                    );
                                })}
                            </Card>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
