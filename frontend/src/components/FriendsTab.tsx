import React, { useMemo, useState } from 'react';
import { computeBalances } from '../lib/balances';
import { recordSettlement, deleteSettlement, Group, Session, Settlement } from '../lib/api';
import { motion, AnimatePresence, Pop, Collapse, AnimatedNumber, enter, listItem, tap, tapFlat, tapRow } from '../lib/motion';

interface FriendsTabProps {
    me: string;
    groups: Group[];
    sessions: Session[];
    settlements: Settlement[];
    onChanged: () => Promise<void> | void;
}

const money = (n: number) => `$${Math.abs(n).toFixed(2)}`;

export default function FriendsTab({ me, groups, sessions, settlements, onChanged }: FriendsTabProps) {
    const [open, setOpen] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const balances = useMemo(() => computeBalances(me, groups, sessions, settlements), [me, groups, sessions, settlements]);
    const groupName = useMemo(() => Object.fromEntries(groups.map(g => [g.id, g.name])), [groups]);

    const friends = useMemo(() => {
        const byId = new Map<string, { id: string; name: string; email: string }>();
        for (const g of groups) for (const m of g.members) if (m.user_id !== me) byId.set(m.user_id, { id: m.user_id, name: m.name, email: m.email });
        return [...byId.values()]
            .map(f => ({ ...f, net: balances.friends[f.id]?.net ?? 0, byGroup: balances.friends[f.id]?.byGroup ?? {} }))
            .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name));
    }, [groups, me, balances]);

    const owedToMe = friends.reduce((a, f) => a + (f.net > 0 ? f.net : 0), 0);
    const iOwe = friends.reduce((a, f) => a + (f.net < 0 ? -f.net : 0), 0);

    const run = async (fn: () => Promise<void>) => {
        setBusy(true);
        setError('');
        try {
            await fn();
            await onChanged();
        } catch (err: any) {
            setError(err.message || 'Something went wrong');
        } finally {
            setBusy(false);
        }
    };

    const settle = (friendId: string, groupId: string, net: number) =>
        run(() => (net > 0 ? recordSettlement(groupId, friendId, me, net) : recordSettlement(groupId, me, friendId, -net)));

    const settleAll = (f: (typeof friends)[number]) =>
        run(async () => {
            for (const [gid, net] of Object.entries(f.byGroup)) if (Math.abs(net) >= 0.01) await (net > 0 ? recordSettlement(gid, f.id, me, net) : recordSettlement(gid, me, f.id, -net));
        });

    if (friends.length === 0) {
        return (
            <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-3xl">
                <p className="text-slate-500 font-semibold">No friends yet.</p>
                <p className="text-slate-400 text-sm mt-1">Invite people to a group and they'll show up here with what you owe each other.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">You're owed</p>
                    <p className="font-headline text-2xl font-extrabold text-emerald-700"><AnimatedNumber value={owedToMe} prefix="$" /></p>
                </div>
                <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600">You owe</p>
                    <p className="font-headline text-2xl font-extrabold text-rose-700"><AnimatedNumber value={iOwe} prefix="$" /></p>
                </div>
            </div>

            <Pop show={!!error} className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">{error}</Pop>

            {friends.map((f, fi) => {
                const expanded = open === f.id;
                const settled = Math.abs(f.net) < 0.005;
                const lines = Object.entries(f.byGroup).filter(([, n]) => Math.abs(n) >= 0.005);
                const history = settlements.filter(s => (s.from_user === f.id && s.to_user === me) || (s.from_user === me && s.to_user === f.id));
                return (
                    <motion.div key={f.id} {...enter(fi)} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                        <motion.button {...tapRow} onClick={() => setOpen(expanded ? null : f.id)} aria-expanded={expanded} className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-600 uppercase shrink-0">{f.name.charAt(0)}</div>
                                <div className="min-w-0">
                                    <p className="font-bold text-slate-900 truncate">{f.name}</p>
                                    <p className="text-xs text-slate-400 truncate">{f.email}</p>
                                </div>
                            </div>
                            <div className="text-right shrink-0 ml-3">
                                {settled ? (
                                    <p className="text-sm font-bold text-slate-400">Settled up</p>
                                ) : (
                                    <>
                                        <p className={`font-headline font-bold ${f.net > 0 ? 'text-emerald-600' : 'text-rose-600'}`}><AnimatedNumber value={Math.abs(f.net)} prefix="$" /></p>
                                        <p className="text-[11px] text-slate-400">{f.net > 0 ? 'owes you' : 'you owe'}</p>
                                    </>
                                )}
                            </div>
                        </motion.button>

                        <Collapse open={expanded}>
                            <div className="border-t border-slate-100 p-4 space-y-4 bg-slate-50/50">
                                {lines.length === 0 ? (
                                    <p className="text-sm text-slate-400">Nothing outstanding between you two.</p>
                                ) : (
                                    <div className="space-y-2">
                                        <AnimatePresence initial={false}>
                                        {lines.map(([gid, net]) => (
                                            <motion.div key={gid} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10, transition: { duration: 0.15 } }} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3 py-2.5">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-slate-800 truncate">{groupName[gid] ?? 'Group'}</p>
                                                    <p className={`text-xs font-bold ${net > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{net > 0 ? `${f.name} owes you ${money(net)}` : `You owe ${f.name} ${money(net)}`}</p>
                                                </div>
                                                <motion.button {...tap} disabled={busy} onClick={() => settle(f.id, gid, net)} className="shrink-0 ml-3 px-3 py-1.5 text-xs font-bold bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-40">
                                                    {net > 0 ? 'Mark received' : 'Mark paid'}
                                                </motion.button>
                                            </motion.div>
                                        ))}
                                        </AnimatePresence>
                                        {lines.length > 1 && (
                                            <motion.button {...tapFlat} disabled={busy} onClick={() => settleAll(f)} className="w-full py-2.5 text-sm font-bold bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-100 disabled:opacity-40">
                                                Settle everything with {f.name}
                                            </motion.button>
                                        )}
                                        <p className="text-[11px] text-slate-400">Recording a payment doesn't move money. It just marks the balance as settled for both of you.</p>
                                    </div>
                                )}

                                {history.length > 0 && (
                                    <div className="space-y-1.5">
                                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Recorded payments</p>
                                        <AnimatePresence initial={false}>
                                        {history.map(h => (
                                            <motion.div key={h.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10, transition: { duration: 0.15 } }} className="flex items-center justify-between text-sm bg-white border border-slate-100 rounded-lg px-3 py-2">
                                                <span className="text-slate-600 truncate">
                                                    {h.from_user === me ? `You paid ${f.name}` : `${f.name} paid you`} {money(h.amount)}
                                                    <span className="text-slate-400"> · {groupName[h.group_id] ?? 'Group'} · {new Date(h.created_at).toLocaleDateString()}</span>
                                                </span>
                                                {h.created_by === me && (
                                                    <motion.button {...tap} disabled={busy} onClick={() => run(() => deleteSettlement(h.id))} className="ml-3 text-xs font-bold text-red-500 hover:text-red-700 shrink-0">Undo</motion.button>
                                                )}
                                            </motion.div>
                                        ))}
                                        </AnimatePresence>
                                    </div>
                                )}
                            </div>
                        </Collapse>
                    </motion.div>
                );
            })}
        </div>
    );
}
