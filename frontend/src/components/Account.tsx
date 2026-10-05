import React, { useEffect, useState } from 'react';
import { listGroups, listSessions, updateDisplayName, requestEmailChange, changePassword } from '../lib/api';

interface AccountProps {
    user: { id: string; email?: string; name: string } | null;
    onBack: () => void;
    onLogout: () => void;
}

type Msg = { type: 'ok' | 'err'; text: string } | null;

const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all outline-none';
const labelCls = 'block text-xs font-semibold text-slate-500 uppercase tracking-widest pl-1 mb-1.5';
const btnCls = 'w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed';

function Banner({ msg }: { msg: Msg }) {
    if (!msg) return null;
    return (
        <div className={`p-3 rounded-xl text-sm border ${msg.type === 'ok' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-600'}`}>
            {msg.text}
        </div>
    );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="font-headline font-bold text-lg text-slate-900">{title}</h3>
            {children}
        </section>
    );
}

function PasswordField({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
    const [show, setShow] = useState(false);
    return (
        <div>
            <label className={labelCls}>{label}</label>
            <div className="relative">
                <input className={inputCls + ' pr-12'} type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} autoComplete={autoComplete} required />
                <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-900">
                    <span className="material-symbols-outlined text-[20px]">{show ? 'visibility_off' : 'visibility'}</span>
                </button>
            </div>
        </div>
    );
}

export default function Account({ user, onBack, onLogout }: AccountProps) {
    const [counts, setCounts] = useState<{ receipts: number; groups: number } | null>(null);

    const [name, setName] = useState(user?.name ?? '');
    const [nameMsg, setNameMsg] = useState<Msg>(null);
    const [nameBusy, setNameBusy] = useState(false);

    const [email, setEmail] = useState('');
    const [emailMsg, setEmailMsg] = useState<Msg>(null);
    const [emailBusy, setEmailBusy] = useState(false);

    const [cur, setCur] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [pwMsg, setPwMsg] = useState<Msg>(null);
    const [pwBusy, setPwBusy] = useState(false);

    useEffect(() => {
        Promise.all([listSessions(), listGroups()]).then(([s, g]) => setCounts({ receipts: s.length, groups: g.length })).catch(() => {});
    }, []);

    const saveName = async (e: React.FormEvent) => {
        e.preventDefault();
        setNameBusy(true);
        setNameMsg(null);
        try {
            await updateDisplayName(name);
            setNameMsg({ type: 'ok', text: 'Name updated.' });
        } catch (err: any) {
            setNameMsg({ type: 'err', text: err.message });
        } finally {
            setNameBusy(false);
        }
    };

    const saveEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setEmailBusy(true);
        setEmailMsg(null);
        try {
            await requestEmailChange(email);
            setEmailMsg({ type: 'ok', text: `Confirmation sent. Click the link we emailed to ${email.trim()} to finish the change (you may also need to confirm from your current address). Until then, keep signing in with your current email.` });
            setEmail('');
        } catch (err: any) {
            setEmailMsg({ type: 'err', text: err.message });
        } finally {
            setEmailBusy(false);
        }
    };

    const savePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPwMsg(null);
        if (next.length < 8) return setPwMsg({ type: 'err', text: 'New password must be at least 8 characters.' });
        if (next !== confirm) return setPwMsg({ type: 'err', text: 'New passwords do not match.' });
        if (next === cur) return setPwMsg({ type: 'err', text: 'New password must be different from the current one.' });
        setPwBusy(true);
        try {
            await changePassword(cur, next);
            setCur(''); setNext(''); setConfirm('');
            setPwMsg({ type: 'ok', text: 'Password changed.' });
        } catch (err: any) {
            setPwMsg({ type: 'err', text: err.message });
        } finally {
            setPwBusy(false);
        }
    };

    return (
        <div className="bg-slate-50 font-body text-slate-900 min-h-screen pb-16">
            <header className="sticky top-0 w-full z-50 bg-white border-b border-slate-200">
                <div className="flex items-center gap-3 px-6 py-4 max-w-2xl mx-auto">
                    <button onClick={onBack} aria-label="Back" className="text-slate-500 hover:text-slate-900 active:scale-95">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <h1 className="font-headline font-extrabold text-xl text-slate-900">Account</h1>
                </div>
            </header>

            <main className="pt-8 px-6 max-w-2xl mx-auto space-y-6">
                <section className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-3xl p-6 shadow-lg flex items-center gap-5 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                    <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-3xl font-extrabold border border-white/30 uppercase shrink-0">
                        {user?.name?.charAt(0) || 'U'}
                    </div>
                    <div className="z-10 min-w-0">
                        <h2 className="font-headline font-extrabold text-2xl tracking-tight truncate">{user?.name || 'User'}</h2>
                        <p className="text-sm font-medium opacity-90 truncate">{user?.email}</p>
                    </div>
                </section>

                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white border text-center border-slate-200 rounded-3xl p-5 shadow-sm">
                        <span className="block text-3xl font-black text-indigo-600 mb-1">{counts?.receipts ?? '–'}</span>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Receipts</span>
                    </div>
                    <div className="bg-white border text-center border-slate-200 rounded-3xl p-5 shadow-sm">
                        <span className="block text-3xl font-black text-pink-600 mb-1">{counts?.groups ?? '–'}</span>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Groups</span>
                    </div>
                </div>

                <Card title="Profile">
                    <form className="space-y-4" onSubmit={saveName}>
                        <div>
                            <label className={labelCls}>Display name</label>
                            <input className={inputCls} value={name} onChange={e => setName(e.target.value)} maxLength={60} required />
                            <p className="text-xs text-slate-400 mt-1.5 pl-1">Shown to the people in your groups and used as your name on receipts.</p>
                        </div>
                        <Banner msg={nameMsg} />
                        <button className={btnCls} disabled={nameBusy || !name.trim() || name.trim() === user?.name}>{nameBusy ? 'Saving...' : 'Save name'}</button>
                    </form>
                </Card>

                <Card title="Email">
                    <form className="space-y-4" onSubmit={saveEmail}>
                        <div>
                            <label className={labelCls}>Current email</label>
                            <input className={inputCls + ' text-slate-500'} value={user?.email ?? ''} disabled />
                        </div>
                        <div>
                            <label className={labelCls}>New email</label>
                            <input className={inputCls} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="new@example.com" autoComplete="email" required />
                            <p className="text-xs text-slate-400 mt-1.5 pl-1">Group invitations are matched by email, so invites sent to your old address won't reach you after the change.</p>
                        </div>
                        <Banner msg={emailMsg} />
                        <button className={btnCls} disabled={emailBusy || !email.trim() || email.trim().toLowerCase() === user?.email?.toLowerCase()}>{emailBusy ? 'Sending...' : 'Change email'}</button>
                    </form>
                </Card>

                <Card title="Password">
                    <form className="space-y-4" onSubmit={savePassword}>
                        <PasswordField label="Current password" value={cur} onChange={setCur} autoComplete="current-password" />
                        <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
                        <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
                        <Banner msg={pwMsg} />
                        <button className={btnCls} disabled={pwBusy || !cur || !next || !confirm}>{pwBusy ? 'Updating...' : 'Change password'}</button>
                    </form>
                </Card>

                <button onClick={onLogout} className="w-full bg-white text-red-600 font-bold py-4 rounded-2xl hover:bg-red-50 transition-colors shadow-sm flex items-center justify-center gap-2 border border-red-200 active:scale-[0.98]">
                    <span className="material-symbols-outlined shrink-0">logout</span>
                    Sign Out
                </button>
            </main>
        </div>
    );
}
