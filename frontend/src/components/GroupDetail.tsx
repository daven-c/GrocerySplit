import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
    getGroup, listSessions, createSession, deleteGroup, removeMember, inviteToGroup,
    listPendingInvites, revokeInvite, Group, Session, PendingInvite,
} from '../lib/api';

interface GroupDetailProps {
    groupId: string;
    onBack: () => void;
    onImport: (groupId: string) => void;
    onOpenReceipt: (sessionId: string) => void;
}

export default function GroupDetail({ groupId, onBack, onImport, onOpenReceipt }: GroupDetailProps) {
    const [group, setGroup] = useState<Group | null>(null);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [pending, setPending] = useState<PendingInvite[]>([]);
    const [me, setMe] = useState<string | null>(null);
    const [tab, setTab] = useState<'receipts' | 'members'>('receipts');
    const [search, setSearch] = useState('');
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [confirm, setConfirm] = useState<null | { kind: 'leave' | 'delete' | 'remove'; userId?: string; name?: string }>(null);

    const isOwner = !!group && group.owner_id === me;

    const load = useCallback(async () => {
        try {
            const { data } = await supabase.auth.getUser();
            setMe(data.user?.id ?? null);
            const [g, s] = await Promise.all([getGroup(groupId), listSessions(groupId)]);
            setGroup(g);
            setSessions(s);
            if (data.user?.id === g.owner_id) setPending(await listPendingInvites(groupId));
        } catch (err: any) {
            setError(err.message || 'Failed to load group');
        }
    }, [groupId]);

    useEffect(() => { load(); }, [load]);

    const total = (s: Session) => s.items.reduce((a, i) => a + i.price, 0) + s.tax + s.tip;

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return sessions.filter(s => !q || s.name.toLowerCase().includes(q) || s.items.some(i => i.name.toLowerCase().includes(q)));
    }, [sessions, search]);

    const handleManual = async () => {
        try {
            const id = await createSession({ groupId, name: 'Manual Receipt', participants: group?.members.map(m => m.name) ?? [] });
            onOpenReceipt(id);
        } catch (err: any) {
            setError(err.message || 'Failed to create receipt');
        }
    };

    const handleInvite = async () => {
        const e = email.trim().toLowerCase();
        setError('');
        setNotice('');
        if (!/^\S+@\S+\.\S+$/.test(e)) return setError('Enter a valid email address.');
        if (group?.members.some(m => m.email === e)) return setError('That person is already in this group.');
        try {
            await inviteToGroup(groupId, e);
            setEmail('');
            setNotice(`Invite sent to ${e}. They'll see it in the app when they sign in with that email.`);
            setPending(await listPendingInvites(groupId));
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleConfirm = async () => {
        if (!confirm || !group) return;
        const c = confirm;
        setConfirm(null);
        try {
            if (c.kind === 'delete') {
                await deleteGroup(groupId);
                return onBack();
            }
            if (c.kind === 'leave') {
                await removeMember(groupId, me!);
                return onBack();
            }
            await removeMember(groupId, c.userId!);
            await load();
        } catch (err: any) {
            setError(err.message || 'Action failed');
        }
    };

    if (!group) {
        return (
            <div className="bg-slate-50 min-h-screen flex items-center justify-center">
                <p className="text-slate-500 font-bold">{error || 'Loading group...'}</p>
            </div>
        );
    }

    const confirmText = {
        delete: { title: 'Delete group?', body: `This permanently deletes "${group.name}" and all ${sessions.length} of its receipts for every member.`, action: 'Delete' },
        leave: { title: 'Leave group?', body: `You'll lose access to "${group.name}" and its receipts unless someone invites you again.`, action: 'Leave' },
        remove: { title: 'Remove member?', body: `Remove ${confirm?.name} from "${group.name}"? They lose access to its receipts.`, action: 'Remove' },
    };

    return (
        <div className="bg-slate-50 font-body text-slate-900 min-h-screen pb-32">
            {confirm && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
                        <h3 className="font-headline font-bold text-xl text-slate-900 mb-2">{confirmText[confirm.kind].title}</h3>
                        <p className="text-slate-500 mb-6 font-medium leading-relaxed">{confirmText[confirm.kind].body}</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirm(null)} className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 active:scale-95">Cancel</button>
                            <button onClick={handleConfirm} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-sm active:scale-95">{confirmText[confirm.kind].action}</button>
                        </div>
                    </div>
                </div>
            )}

            <header className="sticky top-0 w-full z-50 bg-white border-b border-slate-200">
                <div className="flex items-center gap-3 px-6 py-4 max-w-2xl mx-auto">
                    <button onClick={onBack} aria-label="Back" className="text-slate-500 hover:text-slate-900 active:scale-95">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div className="min-w-0">
                        <h1 className="font-headline font-bold text-lg text-slate-900 truncate">{group.name}</h1>
                        <p className="text-xs text-slate-500">{group.members.length} {group.members.length === 1 ? 'member' : 'members'}</p>
                    </div>
                </div>
            </header>

            <main className="pt-6 px-6 max-w-2xl mx-auto space-y-6">
                <div className="flex bg-slate-200 rounded-xl p-1 shadow-inner">
                    {(['receipts', 'members'] as const).map(t => (
                        <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2.5 text-sm font-bold rounded-lg capitalize transition-colors ${tab === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                            {t === 'receipts' ? `Receipts (${sessions.length})` : `Members (${group.members.length})`}
                        </button>
                    ))}
                </div>

                {error && <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">{error}</div>}
                {notice && <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-sm">{notice}</div>}

                {tab === 'receipts' && (
                    <section className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={() => onImport(groupId)} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-4 rounded-2xl flex flex-col items-center gap-1 shadow-lg shadow-blue-500/30 active:scale-[0.98]">
                                <span className="material-symbols-outlined text-[26px]">upload_file</span>
                                <span className="text-sm">Import Receipt</span>
                            </button>
                            <button onClick={handleManual} className="bg-white border-2 border-slate-100 text-indigo-900 font-bold py-4 rounded-2xl flex flex-col items-center gap-1 shadow-sm hover:border-indigo-100 active:scale-[0.98]">
                                <span className="material-symbols-outlined text-[26px] text-indigo-500">edit_document</span>
                                <span className="text-sm">Manual Receipt</span>
                            </button>
                        </div>

                        <div className="flex items-center bg-white border border-slate-200 rounded-2xl px-3 py-2 shadow-sm">
                            <span className="material-symbols-outlined text-slate-400 mr-2 text-[20px]">search</span>
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search receipts or items..." className="w-full bg-transparent outline-none text-sm font-semibold text-slate-700" />
                        </div>

                        {shown.length === 0 ? (
                            <p className="text-center text-slate-400 font-semibold py-8 bg-white border border-slate-200 border-dashed rounded-3xl">
                                {sessions.length === 0 ? 'No receipts in this group yet.' : 'No matching receipts.'}
                            </p>
                        ) : shown.map(s => (
                            <button key={s.id} onClick={() => onOpenReceipt(s.id)} className="w-full flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow active:scale-[0.99] text-left group">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600 border border-slate-100 group-hover:bg-slate-900 group-hover:text-white transition-colors shrink-0">
                                        <span className="material-symbols-outlined">receipt</span>
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-bold text-slate-900 text-sm truncate">{s.name}</h4>
                                        <p className="text-xs text-slate-500 font-medium">{new Date(s.session_date + 'T00:00').toLocaleDateString()} &bull; {s.items.length} items &bull; {s.participants.length} people</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <p className="font-headline font-bold text-slate-900">${total(s).toFixed(2)}</p>
                                    <span className="material-symbols-outlined text-slate-300">chevron_right</span>
                                </div>
                            </button>
                        ))}
                    </section>
                )}

                {tab === 'members' && (
                    <section className="space-y-6">
                        {isOwner && (
                            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
                                <h3 className="font-headline font-bold text-slate-900">Invite by email</h3>
                                <div className="flex gap-2">
                                    <input
                                        type="email" value={email} onChange={e => setEmail(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleInvite()}
                                        placeholder="friend@example.com"
                                        className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:border-slate-400" />
                                    <button onClick={handleInvite} disabled={!email.trim()} className="px-4 bg-slate-900 text-white font-bold text-sm rounded-xl disabled:opacity-40 active:scale-95">Invite</button>
                                </div>
                                <p className="text-xs text-slate-400">They need an account using that email. The invite appears on their home screen.</p>
                                {pending.length > 0 && (
                                    <div className="pt-2 space-y-2">
                                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Pending</p>
                                        {pending.map(p => (
                                            <div key={p.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                                                <span className="text-sm font-semibold text-slate-700 truncate">{p.email}</span>
                                                <button onClick={async () => { await revokeInvite(p.id); setPending(await listPendingInvites(groupId)); }} className="text-xs font-bold text-red-500 hover:text-red-700">Revoke</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="space-y-3">
                            {group.members.map(m => (
                                <div key={m.user_id} className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 uppercase border border-slate-200 shrink-0">{m.name.charAt(0)}</div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-slate-800 truncate">{m.name}{m.user_id === me ? ' (you)' : ''}</p>
                                            <p className="text-xs text-slate-400 truncate">{m.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {m.role === 'owner' && <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full">Owner</span>}
                                        {isOwner && m.role !== 'owner' && (
                                            <button onClick={() => setConfirm({ kind: 'remove', userId: m.user_id, name: m.name })} aria-label={`Remove ${m.name}`} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-500">
                                                <span className="material-symbols-outlined text-[18px]">close</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="pt-2">
                            {isOwner ? (
                                <button onClick={() => setConfirm({ kind: 'delete' })} className="w-full bg-white text-red-600 font-bold py-3 rounded-2xl border border-red-200 hover:bg-red-50 active:scale-[0.98]">Delete group</button>
                            ) : (
                                <button onClick={() => setConfirm({ kind: 'leave' })} className="w-full bg-white text-red-600 font-bold py-3 rounded-2xl border border-red-200 hover:bg-red-50 active:scale-[0.98]">Leave group</button>
                            )}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}
