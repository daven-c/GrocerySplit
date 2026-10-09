import { useMemo, useState } from 'react';
import { motion, AnimatePresence, Collapse, Pop, AnimatedNumber, enter, tapFlat } from '../lib/motion';
import { useAppData } from '../lib/appData';
import { computeBalances } from '../lib/balances';
import { recordSettlement, deleteSettlement } from '../lib/api';
import { fmt, memberTones } from '../lib/people';
import { Avatar, Button, Card, Icon } from './ui';
import { toast } from './Toast';

export default function Friends() {
    const { me, groups: allGroups, sessions, settlements, refresh, loading } = useAppData();
    // Your Personal section only has names, not people, so it never appears here.
    const groups = useMemo(() => allGroups.filter(g => !g.personal), [allGroups]);
    const personalGroups = useMemo(() => allGroups.filter(g => g.personal), [allGroups]);
    const [open, setOpen] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const balances = useMemo(() => computeBalances(me, groups, sessions, settlements), [me, groups, sessions, settlements]);
    // Names in your Personal section that you pointed at an account. What is between you stays in Personal: it is shown
    // as its own line, and never counts toward the totals, the amounts here, or anything you can mark paid.
    const personal = useMemo(() => {
        const bal = computeBalances(me, personalGroups, sessions, settlements);
        const byUser = new Map<string, { net: number; name: string; username?: string; tone: ReturnType<typeof memberTones>[string] }>();
        for (const g of personalGroups) {
            const tones = memberTones(g.members, me);
            for (const m of g.members) {
                if (!m.linked_user) continue;
                const net = bal.friends[m.user_id]?.byGroup[g.id] ?? 0;
                const cur = byUser.get(m.linked_user);
                byUser.set(m.linked_user, { net: (cur?.net ?? 0) + net, name: cur?.name ?? m.name, username: m.linked_username, tone: cur?.tone ?? tones[m.user_id] });
            }
        }
        return byUser;
    }, [me, personalGroups, sessions, settlements]);
    const myName = groups.flatMap(g => g.members).find(m => m.user_id === me)?.name ?? 'You';
    const groupName = useMemo(() => Object.fromEntries(groups.map(g => [g.id, g.name])), [groups]);

    const friends = useMemo(() => {
        const byId = new Map<string, { id: string; name: string; username?: string; email: string; groupIds: string[]; tone: ReturnType<typeof memberTones>[string] }>();
        for (const g of groups) {
            const tones = memberTones(g.members, me);
            for (const m of g.members) {
                if (m.user_id === me) continue;
                const f = byId.get(m.user_id);
                if (f) f.groupIds.push(g.id);
                else byId.set(m.user_id, { id: m.user_id, name: m.name, username: m.username, email: m.email, groupIds: [g.id], tone: tones[m.user_id] }); // color from the first shared group
            }
        }
        for (const [uid, p] of personal) {
            if (!byId.has(uid)) byId.set(uid, { id: uid, name: p.name, username: p.username, email: '', groupIds: [], tone: p.tone });
        }
        return [...byId.values()]
            .map(f => ({ ...f, net: balances.friends[f.id]?.net ?? 0, byGroup: balances.friends[f.id]?.byGroup ?? {} }))
            .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name));
    }, [groups, me, balances, personal]);

    const owedToMe = friends.reduce((a, f) => a + (f.net > 0.004 ? f.net : 0), 0);
    const iOwe = friends.reduce((a, f) => a + (f.net < -0.004 ? -f.net : 0), 0);

    const run = async (fn: () => Promise<void>) => {
        setBusy(true);
        setError('');
        try { await fn(); await refresh(); toast('Done'); }
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
        <div className="max-w-[820px] mx-auto flex flex-col gap-[22px]">
            <div className="flex flex-col gap-1.5">
                <h1 className="m-0 text-[32px] font-black tracking-title">People</h1>
                <p className="m-0 text-base font-semibold text-muted">What you and each person owe, across every group you share.</p>
            </div>

            <div className="flex flex-wrap gap-3">
                <div className="flex-[1_1_180px] px-5 py-[18px] rounded-[22px] bg-green-tint flex flex-col gap-0.5">
                    <span className="text-sm font-extrabold text-[oklch(0.42_0.13_155)]">Owed to you</span>
                    <AnimatedNumber value={owedToMe} prefix="$" className="text-[30px] font-black tracking-[-0.02em] text-green-deep" />
                </div>
                <div className="flex-[1_1_180px] px-5 py-[18px] rounded-[22px] bg-coral-tint flex flex-col gap-0.5">
                    <span className="text-sm font-extrabold text-[oklch(0.48_0.15_32)]">You owe</span>
                    <AnimatedNumber value={iOwe} prefix="$" className="text-[30px] font-black tracking-[-0.02em] text-[oklch(0.4_0.13_32)]" />
                </div>
            </div>

            <Pop show={!!error} className="px-4 py-2.5 rounded-[22px] bg-coral-tint text-coral-on text-[13.5px] font-extrabold">{error}</Pop>

            {loading ? (
                <p className="text-center text-faint py-10 m-0 font-bold animate-pulse">Loading…</p>
            ) : friends.length === 0 ? (
                <div className="text-center py-10 px-6 rounded-[24px] bg-wash">
                    <p className="m-0 text-[15px] font-extrabold text-body">No one yet.</p>
                    <p className="m-0 mt-1 text-sm font-semibold text-faint">Invite people to a group and they'll show up here with what you owe each other.</p>
                </div>
            ) : (
                <Card className="p-1.5">
                    {friends.map((f, i) => {
                        const expanded = open === f.id;
                        const settled = Math.abs(f.net) < 0.005;
                        const lines = Object.entries(f.byGroup).filter(([, n]) => Math.abs(n) >= 0.005);
                        const history = settlements.filter(s => (s.from_user === f.id && s.to_user === me) || (s.from_user === me && s.to_user === f.id));
                        return (
                            <motion.div key={f.id} {...enter(i)} className={`rounded-[18px] ${expanded ? 'bg-wash' : ''}`}>
                                <motion.button {...tapFlat} onClick={() => setOpen(expanded ? null : f.id)} aria-expanded={expanded} className="w-full flex items-center gap-3.5 p-3 rounded-[18px] text-left text-ink hover:bg-wash transition-colors">
                                    <Avatar name={f.name} tone={f.tone} size={46} />
                                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                        <span className="text-base font-extrabold truncate">{f.name}{f.username && <span className="ml-1.5 text-[13.5px] font-bold text-faint">@{f.username}</span>}</span>
                                        <span className="text-[13.5px] font-semibold text-faint truncate">{f.groupIds.length ? f.groupIds.map(id => groupName[id]).join(', ') : 'Personal only'}</span>
                                    </span>
                                    <span className="flex flex-col items-end gap-px">
                                        {f.groupIds.length === 0 ? <span className="text-base font-black text-faint">Personal</span> : settled ? <span className="text-base font-black text-faint">Settled</span> : <AnimatedNumber value={Math.abs(f.net)} prefix={f.net < 0 ? '-$' : '$'} className={`text-base font-black ${f.net > 0 ? 'text-green' : 'text-coral'}`} />}
                                        <span className="text-[12.5px] font-bold text-faint">{f.groupIds.length === 0 ? 'only you see this' : settled ? 'all square' : f.net > 0 ? 'owes you' : 'you owe'}</span>
                                    </span>
                                    <Icon name={expanded ? 'expand_less' : 'expand_more'} size={22} className="text-chev" />
                                </motion.button>

                                <Collapse open={expanded}>
                                    <div className="pt-0 pb-3.5 pr-3 pl-[72px] flex flex-col gap-2">
                                        <AnimatePresence initial={false}>
                                            {lines.map(([gid, net]) => (
                                                <motion.div key={gid} layout initial={{ opacity: 0.8, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10, transition: { duration: 0.15 } }} className="flex flex-wrap items-center gap-3 py-3 pl-4 pr-3 rounded-[18px] bg-white">
                                                    <div className="flex-[1_1_160px] flex flex-col gap-px">
                                                        <span className="text-[14.5px] font-extrabold">{groupName[gid] ?? 'Group'}</span>
                                                        <span className={`text-[13.5px] font-bold ${net > 0 ? 'text-green' : 'text-coral'}`}>{net > 0 ? `${f.name} owes ${myName} ${fmt(net)}` : `${myName} owes ${f.name} ${fmt(net)}`}</span>
                                                    </div>
                                                    <Button height={36} className="px-4 text-[13.5px]" disabled={busy} onClick={() => settle(f.id, gid, net)}>{net > 0 ? 'Mark received' : 'Mark paid'}</Button>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                        {lines.length === 0 && f.groupIds.length > 0 && <span className="text-[14.5px] font-bold text-faint">You two are square.</span>}
                                        {personal.has(f.id) && (
                                            <div className="flex flex-col gap-px py-3 pl-4 pr-3.5 rounded-[18px] bg-warm" aria-label={`Personal with ${f.name}`}>
                                                <span className="flex items-center gap-1.5 text-[14.5px] font-extrabold"><Icon name="lock" size={16} fill />Personal</span>
                                                <span className="text-[13.5px] font-bold text-body">
                                                    {Math.abs(personal.get(f.id)!.net) < 0.005 ? 'Nothing between you in Personal.' : personal.get(f.id)!.net > 0 ? `${f.name} owes ${myName} ${fmt(personal.get(f.id)!.net)}` : `${myName} owes ${f.name} ${fmt(-personal.get(f.id)!.net)}`}
                                                </span>
                                                <span className="text-[12.5px] font-semibold text-[#6E655C]">Only you can see this. It isn't counted in the amounts above.</span>
                                            </div>
                                        )}
                                        {lines.length > 1 && (
                                            <Button variant="secondary" height={36} className="self-start text-[13.5px] px-4" disabled={busy} onClick={() => settleAll(f)}>Settle everything with {f.name}</Button>
                                        )}
                                        {history.map(h => (
                                            <div key={h.id} className="flex items-center gap-2 text-[13.5px] font-semibold text-[#6E655C]">
                                                <Icon name="check_circle" size={18} className="text-[oklch(0.55_0.14_155)]" fill />
                                                <span className="flex-1">{h.from_user === me ? `${myName} paid ${f.name}` : `${f.name} paid ${myName}`} {fmt(h.amount)} · {groupName[h.group_id] ?? 'Group'} · {new Date(h.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                                {h.created_by === me && (
                                                    <button type="button" disabled={busy} onClick={() => run(() => deleteSettlement(h.id))} className="text-[13.5px] font-extrabold text-ink underline underline-offset-2">Undo</button>
                                                )}
                                            </div>
                                        ))}
                                        <span className="text-[12.5px] font-semibold leading-[1.5] text-faint">Marking something paid doesn't move money. It just clears the balance for both of you.</span>
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
