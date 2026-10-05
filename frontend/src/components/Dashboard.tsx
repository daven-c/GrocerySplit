import React, { useState, useEffect, useCallback, useRef } from 'react';
import { listGroups, listSessions, listSettlements, createGroup, myInvites, respondToInvite, isAdmin, Group, Invite, Session, Settlement } from '../lib/api';
import { computeBalances } from '../lib/balances';
import FriendsTab from './FriendsTab';
import { motion, FROM, AnimatePresence, Pop, SegmentedTabs, AnimatedNumber, listItem, spring, tap, tapFlat, tapRow } from '../lib/motion';

interface DashboardProps {
    user: any;
    onOpenGroup: (groupId: string) => void;
    onOpenAccount: () => void;
    onOpenAdmin: () => void;
    onLogout: () => void;
}

export default function Dashboard({ user, onOpenGroup, onOpenAccount, onOpenAdmin, onLogout }: DashboardProps) {
    const [groups, setGroups] = useState<Group[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [invites, setInvites] = useState<Invite[]>([]);
    const [settlements, setSettlements] = useState<Settlement[]>([]);
    const [tab, setTab] = useState<'groups' | 'friends'>('groups');
    const [newName, setNewName] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [menuOpen, setMenuOpen] = useState(false);
    const [admin, setAdmin] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const close = (e: MouseEvent | KeyboardEvent) => {
            if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', close);
        return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
    }, [menuOpen]);

    const load = useCallback(async () => {
        try {
            const [g, s, i, st] = await Promise.all([listGroups(), listSessions(), myInvites(), listSettlements()]);
            setGroups(g);
            setSessions(s);
            setInvites(i);
            setSettlements(st);
        } catch (err: any) {
            setError(err.message || 'Failed to load groups');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { isAdmin().then(setAdmin).catch(() => setAdmin(false)); }, []);

    const handleCreate = async () => {
        const name = newName.trim();
        if (!name) return;
        setError('');
        try {
            const id = await createGroup(name);
            setNewName('');
            onOpenGroup(id);
        } catch (err: any) {
            setError(err.message || 'Failed to create group');
        }
    };

    const handleRespond = async (id: string, accept: boolean) => {
        setError('');
        try {
            await respondToInvite(id, accept);
            await load();
        } catch (err: any) {
            setError(err.message || 'Failed to answer invite');
        }
    };

    const groupBalance = computeBalances(user?.id ?? '', groups, sessions, settlements).byGroup;

    const total = (s: Session) => s.items.reduce((a, i) => a + i.price, 0) + s.tax + s.tip;

    return (
        <div className="bg-slate-50 font-body text-slate-900 min-h-screen pb-32">
            <header className="sticky top-0 w-full z-50 bg-white border-b border-slate-200">
                <div className="flex items-center justify-between px-6 py-4 max-w-2xl mx-auto">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center">
                            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>receipt_long</span>
                        </div>
                        <h1 className="font-headline font-extrabold tracking-tight text-xl text-slate-900">Grocery Split</h1>
                    </div>
                    <div className="relative" ref={menuRef}>
                        <motion.button {...tap} onClick={() => setMenuOpen(o => !o)} aria-label="Menu" aria-expanded={menuOpen}
                            className="w-10 h-10 flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 transition-colors">
                            <span className="material-symbols-outlined">{menuOpen ? 'close' : 'menu'}</span>
                        </motion.button>
                        <AnimatePresence>
                        {menuOpen && (
                            <motion.div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-50 origin-top-right"
                                initial={{ opacity: FROM, scale: 0.9, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -4 }} transition={spring}>
                                <div className="px-4 py-3 border-b border-slate-100">
                                    <p className="font-bold text-slate-900 text-sm truncate">{user?.name}</p>
                                    <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                                </div>
                                <motion.button {...tapFlat} onClick={() => { setMenuOpen(false); onOpenAccount(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 text-left">
                                    <span className="material-symbols-outlined text-[20px] text-slate-400">manage_accounts</span>Account
                                </motion.button>
                                {admin && (
                                    <motion.button {...tapFlat} onClick={() => { setMenuOpen(false); onOpenAdmin(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 text-left">
                                        <span className="material-symbols-outlined text-[20px] text-slate-400">admin_panel_settings</span>Admin
                                    </motion.button>
                                )}
                                <motion.button {...tapFlat} onClick={() => { setMenuOpen(false); onLogout(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 text-left">
                                    <span className="material-symbols-outlined text-[20px]">logout</span>Sign out
                                </motion.button>
                            </motion.div>
                        )}
                        </AnimatePresence>
                    </div>
                </div>
            </header>

            <main className="pt-8 px-6 max-w-2xl mx-auto space-y-8">
                <section>
                    <h2 className="text-2xl font-bold text-slate-900">Welcome back{user ? `, ${user.name.split(' ')[0]}` : ''}</h2>
                    <p className="text-slate-500 text-sm mt-1">Split costs with your groups, and see who owes whom.</p>
                </section>

                <Pop show={!!error} className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">{error}</Pop>

                {invites.length > 0 && (
                    <section className="space-y-3">
                        <h3 className="font-headline font-bold text-lg text-slate-900">Invitations</h3>
                        <AnimatePresence initial={false}>
                        {invites.map((inv, i) => (
                            <motion.div key={inv.id} {...listItem(i)} className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-bold text-slate-900 truncate">{inv.group_name}</p>
                                    <p className="text-xs text-slate-500">Invited by {inv.inviter_name}</p>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <motion.button {...tap} onClick={() => handleRespond(inv.id, false)} className="px-3 py-2 text-sm font-bold bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50">Decline</motion.button>
                                    <motion.button {...tap} onClick={() => handleRespond(inv.id, true)} className="px-3 py-2 text-sm font-bold bg-slate-900 text-white rounded-xl hover:bg-slate-800">Join</motion.button>
                                </div>
                            </motion.div>
                        ))}
                        </AnimatePresence>
                    </section>
                )}

                <SegmentedTabs id="home" value={tab} onChange={setTab} tabs={[{ value: 'groups', label: 'Groups' }, { value: 'friends', label: 'Friends' }]} />

                <motion.div key={tab} initial={{ y: 10 }} animate={{ y: 0 }} transition={{ duration: 0.18 }}>
                {tab === 'friends' && (
                    loading ? <p className="text-center text-slate-400 font-semibold py-8 animate-pulse">Loading...</p> : (
                        <FriendsTab me={user?.id ?? ''} groups={groups} sessions={sessions} settlements={settlements} onChanged={load} />
                    )
                )}

                {tab === 'groups' && (
                <section>
                    <div className="flex items-center justify-between mb-4 gap-3">
                        <h3 className="font-headline font-bold text-xl text-slate-900">Your Groups</h3>
                        <div className="flex items-center bg-white border border-slate-200 rounded-full px-2 py-1 shadow-sm focus-within:ring-2 ring-slate-200">
                            <span className="material-symbols-outlined text-slate-400 pl-2 text-[20px]">group_add</span>
                            <input
                                type="text"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                placeholder="New group..."
                                className="bg-transparent border-none outline-none text-sm px-3 py-1.5 w-32 font-semibold text-slate-700"
                            />
                            <motion.button {...tap} onClick={handleCreate} disabled={!newName.trim()} aria-label="Create group" className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center disabled:opacity-30">
                                <span className="material-symbols-outlined text-[18px]">add</span>
                            </motion.button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {loading ? (
                            <p className="text-center text-slate-400 font-semibold py-8 animate-pulse">Loading groups...</p>
                        ) : groups.length === 0 ? (
                            <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-3xl">
                                <p className="text-slate-500 font-semibold">No groups yet.</p>
                                <p className="text-slate-400 text-sm mt-1">Create one above, then invite the people you split with.</p>
                            </div>
                        ) : (
                            groups.map((g, gi) => {
                                const gs = sessions.filter(s => s.group_id === g.id);
                                const spent = gs.reduce((a, s) => a + total(s), 0);
                                return (
                                    <motion.div key={g.id} {...listItem(gi)}>
                                    <motion.button {...tapRow} onClick={() => onOpenGroup(g.id)} className="w-full flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-200 transition-colors hover:border-slate-300 shadow-sm hover:shadow group cursor-pointer text-left">
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 border border-indigo-100 shrink-0">
                                                <span className="material-symbols-outlined">group</span>
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="font-bold text-slate-900 text-base truncate">{g.name}</h4>
                                                <p className="text-xs text-slate-500 font-medium">
                                                    {g.members.length} {g.members.length === 1 ? 'member' : 'members'} &bull; {gs.length} {gs.length === 1 ? 'receipt' : 'receipts'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right flex items-center gap-3 shrink-0">
                                            <div>
                                                <p className="font-headline font-bold text-slate-900"><AnimatedNumber value={spent} prefix="$" /></p>
                                                {Math.abs(groupBalance[g.id] ?? 0) >= 0.005 && (
                                                    <p className={`text-[11px] font-bold ${groupBalance[g.id] > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                        {groupBalance[g.id] > 0 ? `you're owed $${groupBalance[g.id].toFixed(2)}` : `you owe $${(-groupBalance[g.id]).toFixed(2)}`}
                                                    </p>
                                                )}
                                            </div>
                                            <span className="material-symbols-outlined text-slate-300">chevron_right</span>
                                        </div>
                                    </motion.button>
                                    </motion.div>
                                );
                            })
                        )}
                    </div>
                </section>
                )}
                </motion.div>
            </main>
        </div>
    );
}
