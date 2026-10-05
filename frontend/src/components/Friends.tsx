import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence, Collapse, Pop, AnimatedNumber, enter, tapFlat } from '../lib/motion';
import { useAppData } from '../lib/appData';
import { computeBalances } from '../lib/balances';
import { recordSettlement, deleteSettlement } from '../lib/api';
import { fmt, memberTones } from '../lib/people';
import { Avatar, Button, Card, Icon } from './ui';

export default function Friends() {
    const { me, groups, sessions, settlements, refresh, loading } = useAppData();
    const [open, setOpen] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const balances = useMemo(() => computeBalances(me, groups, sessions, settlements), [me, groups, sessions, settlements]);
    const groupName = useMemo(() => Object.fromEntries(groups.map(g => [g.id, g.name])), [groups]);

    const friends = useMemo(() => {
        const byId = new Map<string, { id: string; name: string; email: string; groupIds: string[]; tone: ReturnType<typeof memberTones>[string] }>();
        for (const g of groups) {
            const tones = memberTones(g.members, me);
            for (const m of g.members) {
                if (m.user_id === me) continue;
                const f = byId.get(m.user_id);
                if (f) f.groupIds.push(g.id);
                else byId.set(m.user_id, { id: m.user_id, name: m.name, email: m.email, groupIds: [g.id], tone: tones[m.user_id] }); // color from the first shared group
            }
        }
        return [...byId.values()]
            .map(f => ({ ...f, net: balances.friends[f.id]?.net ?? 0, byGroup: balances.friends[f.id]?.byGroup ?? {} }))
            .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name));
    }, [groups, me, balances]);

    const owedToMe = friends.reduce((a, f) => a + (f.net > 0.004 ? f.net : 0), 0);
    const iOwe = friends.reduce((a, f) => a + (f.net < -0.004 ? -f.net : 0), 0);

    const run = async (fn: () => Promise<void>) => {
        setBusy(true);
        setError('');
        try { await fn(); await refresh(); }
        catch (err: any) { setError(err.message || 'Something went wrong'); }
        finally { setBusy(false); }
    };
    const settle = (friendId: string, groupId: string, net: number) =>
        run(() => (net > 0 ? recordSettlement(groupId, friendId, me, net) : recordSettlement(groupId, me, friendId, -net)));
    const settleAll = (f: (typeof friends)[number]) =>
        run(async () => {
            for (const [gid, net] of Object.entries(f.byGroup)) {
                if (Math.abs(net) >= 0.01) await (net > 0 ? recordSettlement(gid, f.id, me, net) : recordSettlement(gid, me, f.id, -net));
            }
        });

    return (
        <div className="max-w-[760px] mx-auto flex flex-col gap-7">
            <div className="flex flex-col gap-1.5">
                <h1 className="m-0 text-[28px] font-semibold tracking-title">Friends</h1>
                <p className="m-0 text-[15px] text-muted">What you and each person owe, across every group you share.</p>
            </div>

            <div className="flex flex-wrap gap-3">
                <div className="flex-[1_1_160px] px-[18px] py-4 rounded-[14px] bg-green-tint flex flex-col gap-0.5">
                    <span className="text-[13px] text-green-on">Owed to you</span>
                    <AnimatedNumber value={owedToMe} prefix="$" className="text-2xl font-semibold text-green-on" />
                </div>
                <div className="flex-[1_1_160px] px-[18px] py-4 rounded-[14px] bg-coral-tint flex flex-col gap-0.5">
                    <span className="text-[13px] text-coral-on">You owe</span>
                    <AnimatedNumber value={iOwe} prefix="$" className="text-2xl font-semibold text-coral-on" />
                </div>
            </div>

            <Pop show={!!error} className="px-3 py-2.5 rounded-[10px] bg-coral-tint text-coral-on text-[13px]">{error}</Pop>

            {loading ? (
                <p className="text-center text-faint py-10 m-0 animate-pulse">Loading…</p>
            ) : friends.length === 0 ? (
                <div className="text-center py-10 px-6 border border-dashed border-line rounded-[14px]">
                    <p className="m-0 text-[15px] font-semibold text-body">No friends yet.</p>
                    <p className="m-0 mt-1 text-sm text-faint">Invite people to a group and they'll show up here with what you owe each other.</p>
                </div>
            ) : (
                <Card className="overflow-hidden">
                    {friends.map((f, i) => {
                        const expanded = open === f.id;
                        const settled = Math.abs(f.net) < 0.005;
                        const lines = Object.entries(f.byGroup).filter(([, n]) => Math.abs(n) >= 0.005);
                        const history = settlements.filter(s => (s.from_user === f.id && s.to_user === me) || (s.from_user === me && s.to_user === f.id));
                        return (
                            <motion.div key={f.id} {...enter(i)} className={i ? 'border-t border-rule' : ''}>
                                <motion.button {...tapFlat} onClick={() => setOpen(expanded ? null : f.id)} aria-expanded={expanded} className="w-full flex items-center gap-3.5 px-[18px] py-4 bg-white text-left hover:bg-wash transition-colors">
                                    <Avatar name={f.name} tone={f.tone} size={38} />
                                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                        <span className="text-[15px] font-semibold truncate">{f.name}</span>
                                        <span className="text-[13px] text-faint truncate">{f.groupIds.map(id => groupName[id]).join(', ')}</span>
                                    </span>
                                    <span className="flex flex-col items-end gap-0.5">
                                        {settled ? <span className="text-[15px] font-semibold text-faint">Settled</span> : <AnimatedNumber value={Math.abs(f.net)} prefix="$" className={`text-[15px] font-semibold ${f.net > 0 ? 'text-green' : 'text-coral'}`} />}
                                        <span className="text-xs text-faint">{settled ? 'all square' : f.net > 0 ? 'owes you' : 'you owe'}</span>
                                    </span>
                                    <Icon name={expanded ? 'expand_less' : 'expand_more'} size={20} className="text-chev" />
                                </motion.button>

                                <Collapse open={expanded}>
                                    <div className="pt-1 pb-[18px] pr-[18px] pl-[70px] flex flex-col gap-2">
                                        <AnimatePresence initial={false}>
                                            {lines.map(([gid, net]) => (
                                                <motion.div key={gid} layout initial={{ opacity: 0.8, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10, transition: { duration: 0.15 } }} className="flex flex-wrap items-center gap-3 px-3 py-2.5 border border-rule rounded-[10px]">
                                                    <div className="flex-[1_1_160px] flex flex-col gap-0.5">
                                                        <span className="text-sm font-semibold">{groupName[gid] ?? 'Group'}</span>
                                                        <span className={`text-[13px] ${net > 0 ? 'text-green' : 'text-coral'}`}>{net > 0 ? `${f.name} owes you ${fmt(net)}` : `You owe ${f.name} ${fmt(net)}`}</span>
                                                    </div>
                                                    <Button variant="secondary" height={32} className="rounded-lg px-3 text-[13px]" disabled={busy} onClick={() => settle(f.id, gid, net)}>{net > 0 ? 'Mark received' : 'Mark paid'}</Button>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                        {lines.length === 0 && <span className="text-sm text-faint">You two are square.</span>}
                                        {lines.length > 1 && (
                                            <Button variant="ghost" height={36} className="self-start text-[13px]" disabled={busy} onClick={() => settleAll(f)}>Settle everything with {f.name}</Button>
                                        )}
                                        {history.map(h => (
                                            <div key={h.id} className="flex items-center gap-2.5 text-[13px] text-muted">
                                                <Icon name="check_circle" size={16} className="text-green" fill />
                                                <span className="flex-1">{h.from_user === me ? `You paid ${f.name}` : `${f.name} paid you`} {fmt(h.amount)} · {groupName[h.group_id] ?? 'Group'} · {new Date(h.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                                {h.created_by === me && (
                                                    <button type="button" disabled={busy} onClick={() => run(() => deleteSettlement(h.id))} className="text-[13px] font-semibold text-ink underline underline-offset-2">Undo</button>
                                                )}
                                            </div>
                                        ))}
                                        <span className="text-xs leading-normal text-faint">Marking something paid doesn't move money. It just clears the balance for both of you.</span>
                                    </div>
                                </Collapse>
                            </motion.div>
                        );
                    })}
                </Card>
            )}
        </div>
    );
}
