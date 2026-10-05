import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminListUsers, adminTotals, adminCreateUser, adminConfirmUser, AdminUser, AdminTotals } from '../lib/api';

interface AdminProps {
    onBack: () => void;
}

const DAY = 86_400_000;

function ago(iso: string | null): string {
    if (!iso) return 'never';
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
    return new Date(iso).toLocaleDateString();
}

function generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = crypto.getRandomValues(new Uint32Array(16));
    return Array.from(bytes, b => chars[b % chars.length]).join('');
}

const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-slate-900 outline-none';

function Stat({ label, value, tone = 'slate' }: { label: string; value: number | string; tone?: 'slate' | 'amber' | 'emerald' }) {
    const tones = { slate: 'bg-white border-slate-200 text-slate-900', amber: 'bg-amber-50 border-amber-100 text-amber-800', emerald: 'bg-emerald-50 border-emerald-100 text-emerald-800' };
    return (
        <div className={`border rounded-2xl p-4 ${tones[tone]}`}>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">{label}</p>
            <p className="font-headline text-2xl font-extrabold">{value}</p>
        </div>
    );
}

export default function Admin({ onBack }: AdminProps) {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [totals, setTotals] = useState<AdminTotals | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<'newest' | 'active' | 'name'>('newest');

    const [showCreate, setShowCreate] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(true);
    const [confirmEmail, setConfirmEmail] = useState(true);
    const [makeAdmin, setMakeAdmin] = useState(false);
    const [creating, setCreating] = useState(false);
    const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
    const [copied, setCopied] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError('');
        try {
            const [u, t] = await Promise.all([adminListUsers(), adminTotals()]);
            setUsers(u);
            setTotals(t);
        } catch (err: any) {
            setError(/not authorized/i.test(err.message) ? 'You do not have admin access.' : err.message || 'Failed to load users');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const stats = useMemo(() => {
        const now = Date.now();
        return {
            total: users.length,
            unconfirmed: users.filter(u => !u.email_confirmed).length,
            newWeek: users.filter(u => now - new Date(u.created_at).getTime() < 7 * DAY).length,
            activeWeek: users.filter(u => u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() < 7 * DAY).length,
        };
    }, [users]);

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = users.filter(u => !q || u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q));
        return list.sort((a, b) => {
            if (sort === 'name') return a.name.localeCompare(b.name);
            if (sort === 'active') return (new Date(b.last_sign_in_at ?? 0).getTime()) - (new Date(a.last_sign_in_at ?? 0).getTime());
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
    }, [users, search, sort]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        setError('');
        setCreated(null);
        try {
            await adminCreateUser({ name, email, password, confirm: confirmEmail, makeAdmin });
            setCreated({ email: email.trim().toLowerCase(), password });
            setName(''); setEmail(''); setPassword(''); setMakeAdmin(false);
            await load();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setCreating(false);
        }
    };

    const handleConfirm = async (id: string) => {
        setBusyId(id);
        setError('');
        try {
            await adminConfirmUser(id);
            await load();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusyId(null);
        }
    };

    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard unavailable */ }
    };

    return (
        <div className="bg-slate-50 font-body text-slate-900 min-h-screen pb-16">
            <header className="sticky top-0 w-full z-50 bg-white border-b border-slate-200">
                <div className="flex items-center justify-between px-6 py-4 max-w-4xl mx-auto">
                    <div className="flex items-center gap-3">
                        <button onClick={onBack} aria-label="Back" className="text-slate-500 hover:text-slate-900 active:scale-95">
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                        <h1 className="font-headline font-extrabold text-xl text-slate-900">Admin</h1>
                    </div>
                    <button onClick={load} aria-label="Refresh" className="w-10 h-10 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 active:scale-95">
                        <span className="material-symbols-outlined">refresh</span>
                    </button>
                </div>
            </header>

            <main className="pt-6 px-6 max-w-4xl mx-auto space-y-6">
                {error && <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">{error}</div>}

                <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Stat label="Users" value={stats.total} />
                    <Stat label="Unconfirmed" value={stats.unconfirmed} tone={stats.unconfirmed ? 'amber' : 'slate'} />
                    <Stat label="New (7 days)" value={stats.newWeek} tone="emerald" />
                    <Stat label="Active (7 days)" value={stats.activeWeek} />
                    <Stat label="Groups" value={totals?.groups ?? '–'} />
                    <Stat label="Receipts" value={totals?.receipts ?? '–'} />
                    <Stat label="Items" value={totals?.items ?? '–'} />
                    <Stat label="Payments" value={totals?.settlements ?? '–'} />
                </section>

                <section className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
                    <button onClick={() => setShowCreate(v => !v)} aria-expanded={showCreate} className="w-full flex items-center justify-between p-5 text-left">
                        <span className="font-headline font-bold text-lg">Create user</span>
                        <span className="material-symbols-outlined text-slate-400">{showCreate ? 'expand_less' : 'expand_more'}</span>
                    </button>
                    {showCreate && (
                        <form onSubmit={handleCreate} className="px-5 pb-5 space-y-4 border-t border-slate-100 pt-4">
                            <div className="grid md:grid-cols-2 gap-3">
                                <input className={inputCls} placeholder="Display name" value={name} onChange={e => setName(e.target.value)} maxLength={60} required />
                                <input className={inputCls} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
                            </div>
                            <div className="flex gap-2">
                                <input className={inputCls + ' font-mono'} type={showPw ? 'text' : 'password'} placeholder="Temporary password (min 8)" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required />
                                <button type="button" onClick={() => setPassword(generatePassword())} className="px-3 shrink-0 text-sm font-bold bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 active:scale-95">Generate</button>
                                <button type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? 'Hide password' : 'Show password'} className="px-2 shrink-0 text-slate-400 hover:text-slate-900">
                                    <span className="material-symbols-outlined text-[20px]">{showPw ? 'visibility_off' : 'visibility'}</span>
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-700">
                                <label className="flex items-center gap-2"><input type="checkbox" checked={confirmEmail} onChange={e => setConfirmEmail(e.target.checked)} /> Skip email confirmation (force create)</label>
                                <label className="flex items-center gap-2"><input type="checkbox" checked={makeAdmin} onChange={e => setMakeAdmin(e.target.checked)} /> Make admin</label>
                            </div>
                            <button disabled={creating} className="w-full md:w-auto px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 disabled:opacity-40 active:scale-[0.98]">
                                {creating ? 'Creating...' : 'Create user'}
                            </button>
                        </form>
                    )}
                    {created && (
                        <div className="mx-5 mb-5 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-sm text-emerald-900 space-y-2">
                            <p className="font-bold">User created. Share these credentials now; the password is not shown again.</p>
                            <p className="font-mono break-all">{created.email}<br />{created.password}</p>
                            <button onClick={() => copy(`${created.email}\n${created.password}`)} className="px-3 py-1.5 text-xs font-bold bg-emerald-700 text-white rounded-lg active:scale-95">{copied ? 'Copied!' : 'Copy'}</button>
                        </div>
                    )}
                </section>

                <section className="space-y-3">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1 flex items-center bg-white border border-slate-200 rounded-2xl px-3 py-2 shadow-sm">
                            <span className="material-symbols-outlined text-slate-400 mr-2 text-[20px]">search</span>
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email..." className="w-full bg-transparent outline-none text-sm font-semibold text-slate-700" />
                        </div>
                        <select value={sort} onChange={e => setSort(e.target.value as any)} className="bg-white border border-slate-200 rounded-2xl px-4 py-2 text-sm font-bold text-slate-700 shadow-sm outline-none">
                            <option value="newest">Newest first</option>
                            <option value="active">Recently active</option>
                            <option value="name">Name A–Z</option>
                        </select>
                    </div>

                    {loading ? (
                        <p className="text-center text-slate-400 font-semibold py-8 animate-pulse">Loading users...</p>
                    ) : shown.length === 0 ? (
                        <p className="text-center text-slate-400 font-semibold py-8 bg-white border border-dashed border-slate-200 rounded-3xl">No matching users.</p>
                    ) : shown.map(u => (
                        <div key={u.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
                            <div className="flex items-center gap-3 min-w-0 md:w-1/3">
                                <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-600 uppercase shrink-0">{u.name.charAt(0)}</div>
                                <div className="min-w-0">
                                    <p className="font-bold text-slate-900 truncate">
                                        {u.name}
                                        {u.is_admin && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full align-middle">Admin</span>}
                                    </p>
                                    <p className="text-xs text-slate-400 truncate">{u.email}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-4 gap-3 flex-1 text-xs">
                                <div><p className="text-slate-400 uppercase tracking-wider font-bold text-[10px]">Joined</p><p className="font-semibold text-slate-700">{ago(u.created_at)}</p></div>
                                <div><p className="text-slate-400 uppercase tracking-wider font-bold text-[10px]">Last sign-in</p><p className="font-semibold text-slate-700">{ago(u.last_sign_in_at)}</p></div>
                                <div><p className="text-slate-400 uppercase tracking-wider font-bold text-[10px]">Groups</p><p className="font-semibold text-slate-700">{u.groups_count}</p></div>
                                <div><p className="text-slate-400 uppercase tracking-wider font-bold text-[10px]">Receipts</p><p className="font-semibold text-slate-700">{u.receipts_count}</p></div>
                            </div>
                            <div className="md:w-28 md:text-right">
                                {u.email_confirmed ? (
                                    <span className="text-xs font-bold text-emerald-600">Confirmed</span>
                                ) : (
                                    <button disabled={busyId === u.id} onClick={() => handleConfirm(u.id)} className="px-3 py-1.5 text-xs font-bold bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 disabled:opacity-40 active:scale-95">
                                        {busyId === u.id ? 'Confirming...' : 'Force confirm'}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </section>
            </main>
        </div>
    );
}
