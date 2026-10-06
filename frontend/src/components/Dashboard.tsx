import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, Collapse, Pop, AnimatedNumber, listItem, tapFlat } from '../lib/motion';
import { useAppData } from '../lib/appData';
import { createGroup, respondToInvite } from '../lib/api';
import { computeBalances } from '../lib/balances';
import { firstName, fmt, greeting, memberTones } from '../lib/people';
import { totalOf } from '../lib/expenses';
import { startQuickSplit } from '../lib/quickSplit';
import { Avatar, Button, Card, Icon } from './ui';

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

    useEffect(() => { if (newGroupTick > 0) setNewGroupOpen(true); }, [newGroupTick]);
    useEffect(() => { if (newGroupOpen) input.current?.focus(); }, [newGroupOpen]);

    const balances = useMemo(() => computeBalances(me, groups, sessions, settlements), [me, groups, sessions, settlements]);
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
                ) : groups.length === 0 ? (
                    <div className="text-center py-10 px-6 border border-dashed border-line rounded-[14px] text-faint">
                        <p className="m-0 text-[15px] font-semibold text-body">No groups yet.</p>
                        <p className="m-0 mt-1 text-sm">Start one for your household, a trip or a club, then invite the people you share costs with.</p>
                    </div>
                ) : (
                    <Card className="overflow-hidden">
                        {groups.map((g, i) => {
                            const tones = memberTones(g.members, me);
                            const net = balances.byGroup[g.id] ?? 0;
                            const settled = Math.abs(net) < 0.005;
                            const recs = sessions.filter(s => s.group_id === g.id && !s.draft);
                            const count = recs.length;
                            const spent = recs.reduce((a, r) => a + totalOf(r), 0);
                            return (
                                <motion.div key={g.id} {...listItem(i)}>
                                    <motion.button
                                        {...tapFlat}
                                        onClick={() => onOpenGroup(g.id)}
                                        className={`w-full flex items-center gap-4 px-[18px] py-4 bg-white text-left hover:bg-wash transition-colors ${i ? 'border-t border-rule' : ''}`}
                                    >
                                        <span className="flex pl-2 shrink-0">
                                            {g.members.slice(0, 4).map(m => <Avatar key={m.user_id} name={m.name} tone={tones[m.user_id]} size={30} ring className="-ml-2" />)}
                                        </span>
                                        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                            <span className="text-[15px] font-semibold truncate">{g.name}</span>
                                            <span className="text-[13px] text-faint">{g.members.length} {g.members.length === 1 ? 'person' : 'people'} · {count} {count === 1 ? 'expense' : 'expenses'} · {fmt(spent)} total</span>
                                        </span>
                                        <span className="shrink-0 flex flex-col items-end gap-0.5">
                                            <span className={`text-[15px] font-semibold ${settled ? 'text-faint' : net > 0 ? 'text-green' : 'text-coral'}`}>{settled ? 'Settled' : fmt(net)}</span>
                                            <span className="text-xs text-faint">{settled ? 'all square' : net > 0 ? "you're owed" : 'you owe'}</span>
                                        </span>
                                    </motion.button>
                                </motion.div>
                            );
                        })}
                    </Card>
                )}
            </div>
        </div>
    );
}
