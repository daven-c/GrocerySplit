import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, Collapse, Pop, AnimatedNumber, listItem, tapFlat } from '../lib/motion';
import { useAppData } from '../lib/appData';
import { createGroup, respondToInvite, setGroupPinned } from '../lib/api';
import { fmt, fmtSigned, groupTile, memberTones } from '../lib/people';
import { totalOf } from '../lib/expenses';
import { useHomeTotals } from '../lib/totals';
import { Avatar, Button, Card, Icon } from './ui';
import { toast } from './Toast';
import QuickSplitList from './QuickSplitList';

type Sort = 'recent' | 'balance' | 'name' | 'spent';
const SORTS: { value: Sort; label: string }[] = [
    { value: 'recent', label: 'Recent' },
    { value: 'balance', label: 'Balance' },
    { value: 'name', label: 'A–Z' },
    { value: 'spent', label: 'Spent' },
];
const SORT_KEY = 'splitpot:groupSort';
const storedSort = (): Sort => { try { const v = localStorage.getItem(SORT_KEY); return SORTS.some(s => s.value === v) ? (v as Sort) : 'recent'; } catch { return 'recent'; } };

interface DashboardProps {
    user: { id: string; name: string };
    narrow: boolean;
    /** Bumped by the "New group" button to open the inline group creator. */
    newGroupTick: number;
    onOpenGroup: (groupId: string, tab?: 'expenses' | 'members') => void;
    onGoFriends: () => void;
}

export default function Dashboard({ narrow, newGroupTick, onOpenGroup, onGoFriends }: DashboardProps) {
    const { me, groups, sessions, invites, loading, error, refresh } = useAppData();
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
    const { balances, owed, owe } = useHomeTotals();
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

    const handleCreate = async () => {
        const n = name.trim();
        if (!n) return;
        setProblem('');
        try {
            const id = await createGroup(n);
            setName('');
            setNewGroupOpen(false);
            await refresh();
            toast('Group created');
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
            if (accept) toast('Joined the group');
        } catch (err: any) {
            setProblem(err.message || 'Could not answer the invite');
        }
    };

    const setSortTo = (v: Sort) => { setSort(v); try { localStorage.setItem(SORT_KEY, v); } catch { /* not remembered */ } };

    return (
        <div className="max-w-[1120px] mx-auto flex flex-wrap gap-5 items-start">
            <div className="flex-[1_1_300px] flex flex-col gap-3.5">
                <div className="bg-white rounded-[24px] shadow-hero p-2">
                    <div className="flex items-center gap-3.5 p-3.5">
                        <span className="w-11 h-11 rounded-full grid place-items-center bg-green-tint text-green-icon shrink-0"><Icon name="south_west" size={22} /></span>
                        <span className="flex-1 flex flex-col">
                            <span className="text-sm font-bold text-muted">You're owed</span>
                            <AnimatedNumber value={owed} prefix="$" className="text-[26px] font-black tracking-[-0.02em] text-ink" />
                        </span>
                    </div>
                    <div className="h-px bg-rule mx-3.5" />
                    <div className="flex items-center gap-3.5 p-3.5">
                        <span className="w-11 h-11 rounded-full grid place-items-center bg-coral-tint text-coral shrink-0"><Icon name="north_east" size={22} /></span>
                        <span className="flex-1 flex flex-col">
                            <span className="text-sm font-bold text-muted">You owe</span>
                            <AnimatedNumber value={owe} prefix="$" className="text-[26px] font-black tracking-[-0.02em] text-ink" />
                        </span>
                    </div>
                    <Button height={46} wide className="!w-[calc(100%-12px)] mx-1.5 mt-1 mb-1.5" onClick={onGoFriends}>Settle up</Button>
                </div>

                <AnimatePresence initial={false}>
                    {invites.map((inv, i) => (
                        <motion.div key={inv.id} {...listItem(i)} className="rounded-[22px] bg-warm p-[18px] flex flex-col gap-3.5">
                            <span className="text-[15px] leading-[1.4] font-semibold">
                                <b className="font-black">{inv.inviter_name}</b> invited you to <b className="font-black">{inv.group_name}</b>. Join to share expenses with them.
                            </span>
                            <div className="flex gap-2">
                                <Button variant="white" height={40} className="flex-1" onClick={() => handleRespond(inv.id, false)}>Not now</Button>
                                <Button height={40} className="flex-1" onClick={() => handleRespond(inv.id, true)}>Join group</Button>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            <div className="flex-[999_1_420px] min-w-0 flex flex-col gap-5">
            <div className="bg-white rounded-[24px] shadow-hero pt-5 px-2.5 pb-2.5 flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
                    <h2 className="m-0 text-xl font-black tracking-[-0.02em]">Your groups</h2>
                    <div className="basis-full min-[560px]:basis-auto min-[560px]:ml-auto flex flex-wrap gap-1.5" role="group" aria-label="Sort groups">
                        {SORTS.map(o => (
                            <motion.button
                                key={o.value}
                                {...tapFlat}
                                onClick={() => setSortTo(o.value)}
                                aria-pressed={sort === o.value}
                                className={`h-8 px-3 rounded-full text-[13px] font-extrabold ${sort === o.value ? 'bg-ink text-white' : 'bg-soft text-body'}`}
                            >{o.label}</motion.button>
                        ))}
                    </div>
                </div>

                <Pop show={!!(error || problem)} className="mx-1.5 px-4 py-2.5 rounded-[22px] bg-coral-tint text-coral-on text-[13.5px] font-extrabold">{error || problem}</Pop>

                <Collapse open={newGroupOpen}>
                    <div className="flex gap-2 mx-1.5 mb-1.5 p-1.5 rounded-full bg-soft">
                        <input
                            ref={input}
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreate()}
                            placeholder="Name it: a household, a trip, a club"
                            aria-label="Group name"
                            className="flex-1 min-w-0 h-[42px] px-4 border-0 rounded-full bg-white text-[15px] font-bold"
                        />
                        <Button height={42} className="px-[18px]" onClick={handleCreate}>Create</Button>
                    </div>
                </Collapse>

                {sharedGroups.length > 0 && (
                    <div className="flex items-center gap-2.5 h-12 px-[18px] mx-1.5 mb-1 rounded-full bg-soft">
                        <Icon name="search" size={21} className="text-faint" />
                        <input aria-label="Search groups" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search groups or people" className="flex-1 min-w-0 border-0 bg-transparent text-[15px] font-bold text-ink" />
                    </div>
                )}

                {loading ? (
                    <p className="text-center text-faint py-10 m-0 animate-pulse font-bold">Loading your groups…</p>
                ) : sharedGroups.length === 0 ? (
                    <div className="text-center py-10 px-6 mx-1.5 mb-1.5 rounded-[22px] bg-wash text-faint">
                        <p className="m-0 text-[15px] font-extrabold text-body">No groups yet.</p>
                        <p className="m-0 mt-1 text-sm font-semibold">Start one for your household, a trip or a club, then invite the people you share costs with.</p>
                    </div>
                ) : visible.length === 0 ? (
                    <p className="text-center text-faint py-8 m-0 font-bold">No groups match "{query}".</p>
                ) : (
                    visible.map((g, i) => {
                        const tones = memberTones(g.members, me);
                        const st = stats[g.id];
                        const settled = Math.abs(st.net) < 0.005;
                        const pinned = isPinned(g);
                        const tile = groupTile(g.id);
                        return (
                            <motion.div key={g.id} {...listItem(i)} className={`flex items-center rounded-[18px] hover:bg-wash transition-colors ${pinned ? 'bg-wash' : ''}`}>
                                <motion.button {...tapFlat} onClick={() => onOpenGroup(g.id)} className="flex-1 min-w-0 flex items-center gap-3.5 py-3 pl-3.5 pr-1.5 text-left text-ink">
                                    <span aria-hidden="true" className="w-[46px] h-[46px] rounded-full grid place-items-center text-[19px] font-black shrink-0" style={{ background: tile.bg, color: tile.fg }}>{(g.name.trim()[0] ?? '?').toUpperCase()}</span>
                                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                        <span className="text-base font-extrabold truncate">{g.name}</span>
                                        <span className="text-[13.5px] font-semibold text-faint">{g.members.length} {g.members.length === 1 ? 'person' : 'people'} · {st.count} {st.count === 1 ? 'expense' : 'expenses'} · {fmt(st.spent)} total</span>
                                    </span>
                                    {!narrow && (
                                        <span className="flex pl-2">
                                            {g.members.slice(0, 4).map(m => <Avatar key={m.user_id} name={m.name} tone={tones[m.user_id]} size={28} ring className="-ml-2" />)}
                                        </span>
                                    )}
                                    <span className="min-w-[80px] text-right flex flex-col items-end gap-px">
                                        <span className={`text-base font-black ${settled ? 'text-faint' : st.net > 0 ? 'text-green' : 'text-coral'}`}>{settled ? 'Settled' : fmtSigned(st.net)}</span>
                                        <span className="text-xs font-bold text-faint">{settled ? 'all square' : st.net > 0 ? "you're owed" : 'you owe'}</span>
                                    </span>
                                </motion.button>
                                <motion.button
                                    {...tapFlat}
                                    aria-label={pinned ? `Unpin ${g.name}` : `Pin ${g.name}`}
                                    aria-pressed={pinned}
                                    onClick={() => togglePin(g.id, !pinned)}
                                    className={`w-10 h-10 mr-1.5 rounded-full grid place-items-center ${pinned ? 'text-ink' : 'text-ghost hover:text-body'}`}
                                >
                                    <Icon name="push_pin" fill={pinned} size={18} />
                                </motion.button>
                            </motion.div>
                        );
                    })
                )}
            </div>
            <Card className="p-5"><QuickSplitList /></Card>
            </div>
        </div>
    );
}
