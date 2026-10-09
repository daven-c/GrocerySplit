import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, Pop, Collapse, AnimatedNumber, enter, listItem, tapFlat } from '../lib/motion';
import { adminListUsers, adminTotals, adminCreateUser, adminConfirmUser, AdminUser, AdminTotals } from '../lib/api';
import { HUES, toneFor } from '../lib/people';
import { Avatar, Button, Card, Icon, inputCls } from './ui';
import { messageOf } from '../lib/errors';

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

function Stat({ label, value, tone = 'plain', i = 0 }: { label: string; value: number | string; tone?: 'plain' | 'amber' | 'green'; i?: number }) {
    const tones = { plain: 'bg-white border border-edge text-ink', amber: 'bg-coral-tint text-coral-on', green: 'bg-green-tint text-green-on' };
    return (
        <motion.div {...enter(i)} className={`rounded-[22px] px-[18px] py-4 flex flex-col gap-0.5 ${tones[tone]}`}>
            <span className="text-[13px] opacity-70">{label}</span>
            <span className="text-2xl font-semibold">{typeof value === 'number' ? <AnimatedNumber value={value} decimals={0} /> : value}</span>
        </motion.div>
    );
}

export default function Admin() {
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
        } catch (err) {
            setError(/not authorized/i.test(messageOf(err, '')) ? 'You do not have admin access.' : messageOf(err, 'Failed to load users'));
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
        return users.filter(u => !q || u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)).sort((a, b) => {
            if (sort === 'name') return a.name.localeCompare(b.name);
            if (sort === 'active') return new Date(b.last_sign_in_at ?? 0).getTime() - new Date(a.last_sign_in_at ?? 0).getTime();
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
        } catch (err) {
            setError(messageOf(err, 'That did not work'));
        } finally {
            setCreating(false);
        }
    };

    const handleConfirm = async (id: string) => {
        setBusyId(id);
        setError('');
        try { await adminConfirmUser(id); await load(); }
        catch (err) { setError(messageOf(err, 'That did not work')); }
        finally { setBusyId(null); }
    };

    const copy = async (text: string) => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
    };

    return (
        <div className="max-w-[900px] mx-auto flex flex-col gap-7">
            <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1.5">
                    <h1 className="m-0 text-[28px] font-semibold tracking-title">Admin</h1>
                    <p className="m-0 text-[15px] text-muted">Everyone with an account, and what they're up to.</p>
                </div>
                <motion.button {...tapFlat} onClick={load} aria-label="Refresh" className="w-10 h-10 grid place-items-center rounded-full text-muted hover:bg-surface"><Icon name="refresh" size={22} /></motion.button>
            </div>

            <Pop show={!!error} className="px-3 py-2.5 rounded-full bg-coral-tint text-coral-on text-[13px]">{error}</Pop>

            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat i={0} label="Users" value={stats.total} />
                <Stat i={1} label="Unconfirmed" value={stats.unconfirmed} tone={stats.unconfirmed ? 'amber' : 'plain'} />
                <Stat i={2} label="New (7 days)" value={stats.newWeek} tone="green" />
                <Stat i={3} label="Active (7 days)" value={stats.activeWeek} />
                <Stat i={4} label="Groups" value={totals?.groups ?? '–'} />
                <Stat i={5} label="Expenses" value={totals?.receipts ?? '–'} />
                <Stat i={6} label="Items" value={totals?.items ?? '–'} />
                <Stat i={7} label="Payments" value={totals?.settlements ?? '–'} />
            </section>

            <Card className="overflow-hidden">
                <motion.button {...tapFlat} onClick={() => setShowCreate(v => !v)} aria-expanded={showCreate} className="w-full flex items-center justify-between p-5 text-left">
                    <span className="text-[17px] font-semibold">Create user</span>
                    <Icon name={showCreate ? 'expand_less' : 'expand_more'} size={22} className="text-faint" />
                </motion.button>
                <Collapse open={showCreate}>
                    <form onSubmit={handleCreate} className="px-5 pb-5 pt-4 border-t border-rule flex flex-col gap-4">
                        <div className="grid md:grid-cols-2 gap-3">
                            <input className={`${inputCls} text-sm`} placeholder="Display name" value={name} onChange={e => setName(e.target.value)} maxLength={60} required />
                            <input className={`${inputCls} text-sm`} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
                        </div>
                        <div className="flex gap-2">
                            <input className={`${inputCls} text-sm font-mono`} type={showPw ? 'text' : 'password'} placeholder="Temporary password (min 8)" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required />
                            <Button variant="secondary" height={42} className="shrink-0" onClick={() => setPassword(generatePassword())}>Generate</Button>
                            <motion.button {...tapFlat} type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? 'Hide password' : 'Show password'} className="px-2 shrink-0 text-faint hover:text-ink"><Icon name={showPw ? 'visibility_off' : 'visibility'} size={20} /></motion.button>
                        </div>
                        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-body">
                            <label className="flex items-center gap-2"><input type="checkbox" checked={confirmEmail} onChange={e => setConfirmEmail(e.target.checked)} /> Skip email confirmation (force create)</label>
                            <label className="flex items-center gap-2"><input type="checkbox" checked={makeAdmin} onChange={e => setMakeAdmin(e.target.checked)} /> Make admin</label>
                        </div>
                        <Button type="submit" height={42} className="self-start" disabled={creating}>{creating ? 'Creating…' : 'Create user'}</Button>
                    </form>
                </Collapse>
                <Pop show={!!created} className="mx-5 mb-5 p-4 bg-green-tint rounded-[22px] text-sm text-green-on flex flex-col gap-2">
                    {created && (
                        <>
                            <p className="m-0 font-semibold">User created. Share these credentials now; the password is not shown again.</p>
                            <p className="m-0 font-mono break-all">{created.email}<br />{created.password}</p>
                            <Button variant="secondary" height={32} className="self-start text-[13px]" onClick={() => copy(`${created.email}\n${created.password}`)}>{copied ? 'Copied!' : 'Copy'}</Button>
                        </>
                    )}
                </Pop>
            </Card>

            <section className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 flex items-center gap-2 h-[42px] px-3.5 bg-white border border-edge rounded-full">
                        <Icon name="search" size={20} className="text-faint" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email..." className="flex-1 min-w-0 border-0 bg-transparent text-sm" />
                    </div>
                    <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} aria-label="Sort users" className="h-[42px] bg-white border border-line rounded-full px-3.5 text-sm font-semibold text-ink">
                        <option value="newest">Newest first</option>
                        <option value="active">Recently active</option>
                        <option value="name">Name A–Z</option>
                    </select>
                </div>

                {loading ? (
                    <p className="text-center text-faint py-8 m-0 animate-pulse">Loading users…</p>
                ) : shown.length === 0 ? (
                    <p className="m-0 p-8 text-center text-sm text-faint border border-dashed border-line rounded-[22px]">No matching users.</p>
                ) : (
                    <Card className="overflow-hidden">
                        <AnimatePresence initial={false}>
                            {shown.map((u, i) => (
                                <motion.div key={u.id} {...listItem(i)} className={`px-[18px] py-3.5 flex flex-col md:flex-row md:items-center gap-3 md:gap-6 ${i ? 'border-t border-rule' : ''}`}>
                                    <div className="flex items-center gap-3 min-w-0 md:w-1/3">
                                        <Avatar name={u.name} tone={toneFor(HUES[i % HUES.length])} size={36} />
                                        <div className="min-w-0 flex flex-col gap-0.5">
                                            <span className="text-[15px] font-semibold truncate">
                                                {u.name}
                                                {u.is_admin && <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface text-body align-middle">Admin</span>}
                                            </span>
                                            <span className="text-[13px] text-faint truncate">{u.email}</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-4 gap-3 flex-1 text-xs">
                                        {[['Joined', ago(u.created_at)], ['Last sign-in', ago(u.last_sign_in_at)], ['Groups', u.groups_count], ['Expenses', u.receipts_count]].map(([k, v]) => (
                                            <div key={k as string}><p className="m-0 text-faint">{k}</p><p className="m-0 font-semibold text-body">{v}</p></div>
                                        ))}
                                    </div>
                                    <div className="md:w-28 md:text-right">
                                        {u.email_confirmed ? (
                                            <span className="text-xs font-semibold text-green">Confirmed</span>
                                        ) : (
                                            <Button variant="secondary" height={32} className="text-[13px] px-3" disabled={busyId === u.id} onClick={() => handleConfirm(u.id)}>{busyId === u.id ? 'Confirming…' : 'Force confirm'}</Button>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </Card>
                )}
            </section>
        </div>
    );
}
