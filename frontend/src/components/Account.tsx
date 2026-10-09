import React, { useEffect, useState } from 'react';
import { motion, Pop, Modal, enter, tapFlat } from '../lib/motion';
import { useAppData } from '../lib/appData';
import { updateDisplayName, requestEmailChange, changePassword, getMyUsername, updateUsername, exportMyData, deleteAccount } from '../lib/api';
import { HUES, toneFor } from '../lib/people';
import { Avatar, Button, Card, Icon, inputCls } from './ui';

interface AccountProps {
    user: { id: string; email?: string; name: string } | null;
    onLogout: () => void;
}

type Msg = { type: 'ok' | 'err'; text: string } | null;

function Banner({ msg }: { msg: Msg }) {
    return (
        <Pop show={!!msg} className={`text-[13.5px] font-bold ${msg?.type === 'err' ? 'text-coral-strong' : 'px-4 py-2.5 rounded-[22px] bg-green-tint text-green-on font-extrabold'}`}>
            {msg?.text}
        </Pop>
    );
}

function PasswordField({ placeholder, label, value, onChange, autoComplete, className = '' }: { placeholder: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; className?: string }) {
    const [show, setShow] = useState(false);
    return (
        <span className={`relative ${className}`}>
            <input aria-label={label} placeholder={placeholder} className={`${inputCls} pr-12`} type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} autoComplete={autoComplete} required />
            <motion.button {...tapFlat} type="button" onClick={() => setShow(v => !v)} aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} className="absolute inset-y-0 right-0 px-3.5 flex items-center text-faint hover:text-ink">
                <Icon name={show ? 'visibility_off' : 'visibility'} size={20} />
            </motion.button>
        </span>
    );
}

export default function Account({ user, onLogout }: AccountProps) {
    const { groups, refresh } = useAppData();
    const [name, setName] = useState(user?.name ?? '');
    const [nameMsg, setNameMsg] = useState<Msg>(null);
    const [nameBusy, setNameBusy] = useState(false);

    const [username, setUsername] = useState('');
    const [savedUsername, setSavedUsername] = useState('');
    const [unameMsg, setUnameMsg] = useState<Msg>(null);
    const [unameBusy, setUnameBusy] = useState(false);

    const [email, setEmail] = useState('');
    const [emailMsg, setEmailMsg] = useState<Msg>(null);
    const [emailBusy, setEmailBusy] = useState(false);

    const [cur, setCur] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [pwMsg, setPwMsg] = useState<Msg>(null);
    const [pwBusy, setPwBusy] = useState(false);

    const [dataMsg, setDataMsg] = useState<Msg>(null);
    const [dataBusy, setDataBusy] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [typed, setTyped] = useState('');
    const [delBusy, setDelBusy] = useState(false);
    const [delErr, setDelErr] = useState('');

    const downloadData = async () => {
        setDataBusy(true);
        setDataMsg(null);
        try {
            const data = await exportMyData();
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `settled-data-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            setDataMsg({ type: 'ok', text: 'Downloaded. The file has your groups, expenses and transfers.' });
        } catch (err: any) {
            setDataMsg({ type: 'err', text: err.message || 'Could not make the file.' });
        } finally {
            setDataBusy(false);
        }
    };

    const removeAccount = async () => {
        setDelBusy(true);
        setDelErr('');
        try {
            await deleteAccount();
            onLogout(); // the account is gone, so this just signs the browser out
        } catch (err: any) {
            setDelErr(err.message || 'Could not delete the account.');
            setDelBusy(false);
        }
    };

    const saveName = async (e: React.FormEvent) => {
        e.preventDefault();
        setNameBusy(true);
        setNameMsg(null);
        try {
            await updateDisplayName(name);
            setNameMsg({ type: 'ok', text: 'Name updated.' });
            void refresh();
        } catch (err: any) {
            setNameMsg({ type: 'err', text: err.message });
        } finally {
            setNameBusy(false);
        }
    };

    useEffect(() => {
        let cancelled = false;
        getMyUsername().then(u => { if (!cancelled) { setUsername(u); setSavedUsername(u); } }).catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const saveUsername = async (e: React.FormEvent) => {
        e.preventDefault();
        setUnameBusy(true);
        setUnameMsg(null);
        try {
            await updateUsername(username);
            const u = username.trim().toLowerCase();
            setUsername(u);
            setSavedUsername(u);
            setUnameMsg({ type: 'ok', text: 'Username updated.' });
            void refresh();
        } catch (err: any) {
            setUnameMsg({ type: 'err', text: err.message });
        } finally {
            setUnameBusy(false);
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

    const tone = toneFor(HUES[0]);
    const section = 'p-5 flex flex-col gap-2.5';
    const titleCls = 'text-base font-black';
    const hintCls = 'text-[13.5px] font-semibold leading-[1.5] text-faint';
    return (
        <div className="max-w-[640px] mx-auto flex flex-col gap-[22px]">
            <motion.div {...enter(0)} className="flex items-center gap-4">
                <Avatar name={user?.name || 'U'} tone={tone} size={68} />
                <div className="flex flex-col gap-0.5 min-w-0">
                    <h1 className="m-0 text-[28px] font-black tracking-[-0.02em] truncate">{user?.name || 'You'}</h1>
                    <span className="text-[15px] font-semibold text-muted truncate">{user?.email} · {groups.length} {groups.length === 1 ? 'group' : 'groups'}</span>
                </div>
            </motion.div>

            <motion.div {...enter(1)}>
                <Card>
                    <form className={section} onSubmit={saveName}>
                        <label htmlFor="display-name" className={titleCls}>Display name</label>
                        <div className="flex gap-2">
                            <input id="display-name" className={`${inputCls} flex-1 min-w-0`} value={name} onChange={e => setName(e.target.value)} maxLength={60} required />
                            <Button variant="secondary" type="submit" height={46} className="px-5 text-[14.5px]" disabled={nameBusy || !name.trim() || name.trim() === user?.name}>{nameBusy ? 'Saving…' : 'Save'}</Button>
                        </div>
                        <span className={hintCls}>This is how you appear on receipts and in your groups.</span>
                        <Banner msg={nameMsg} />
                    </form>

                    <form className={`${section} border-t border-rule`} onSubmit={saveUsername}>
                        <label htmlFor="username" className={titleCls}>Username</label>
                        <div className="flex gap-2">
                            <span className="flex-1 min-w-0 flex items-center gap-1 h-[46px] px-4 border-[1.5px] border-line rounded-full bg-field focus-within:border-[oklch(0.55_0.1_158)] focus-within:bg-white">
                                <span className="font-bold text-faint">@</span>
                                <input id="username" className="flex-1 min-w-0 border-0 bg-transparent text-[15px] font-bold" value={username} onChange={e => setUsername(e.target.value)} maxLength={20} autoCapitalize="none" required />
                            </span>
                            <Button variant="secondary" type="submit" height={46} className="px-5 text-[14.5px]" disabled={unameBusy || !username.trim() || username.trim().toLowerCase() === savedUsername}>{unameBusy ? 'Saving…' : 'Save'}</Button>
                        </div>
                        <span className={hintCls}>People invite you to a group with @{savedUsername || 'username'}, so your email stays private. Letters, numbers and underscores, unique to you.</span>
                        <Banner msg={unameMsg} />
                    </form>

                    <form className={`${section} border-t border-rule`} onSubmit={saveEmail}>
                        <label htmlFor="new-email" className={titleCls}>Email</label>
                        <div className="flex gap-2">
                            <input id="new-email" className={`${inputCls} flex-1 min-w-0`} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="new@example.com" autoComplete="email" required />
                            <Button variant="secondary" type="submit" height={46} className="px-5 text-[14.5px]" disabled={emailBusy || !email.trim() || email.trim().toLowerCase() === user?.email?.toLowerCase()}>{emailBusy ? 'Sending…' : 'Change'}</Button>
                        </div>
                        <span className={hintCls}>Currently {user?.email}. Invites sent to your old address won't follow you after a change.</span>
                        <Banner msg={emailMsg} />
                    </form>

                    <form className={`${section} border-t border-rule`} onSubmit={savePassword}>
                        <span className={titleCls}>Password</span>
                        <PasswordField label="Current password" placeholder="Current password" value={cur} onChange={setCur} autoComplete="current-password" />
                        <div className="flex flex-wrap gap-2">
                            <PasswordField label="New password" placeholder="New password" value={next} onChange={setNext} autoComplete="new-password" className="flex-[1_1_180px] min-w-0" />
                            <PasswordField label="Confirm new password" placeholder="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" className="flex-[1_1_180px] min-w-0" />
                        </div>
                        <Banner msg={pwMsg} />
                        <Button type="submit" height={44} className="self-start px-5 text-[14.5px]" disabled={pwBusy || !cur || !next || !confirm}>{pwBusy ? 'Updating…' : 'Update password'}</Button>
                    </form>
                </Card>
            </motion.div>

            <motion.div {...enter(2)}>
                <Card>
                    <div className={section}>
                        <span className={titleCls}>Your data</span>
                        <span className={hintCls}>Download everything of yours as one file: your groups, who is in them, your expenses and transfers.</span>
                        <Banner msg={dataMsg} />
                        <Button variant="secondary" height={44} className="self-start px-5 text-[14.5px]" disabled={dataBusy} onClick={downloadData}><Icon name="download" size={18} />{dataBusy ? 'Preparing…' : 'Download my data'}</Button>
                    </div>
                    <div className={`${section} border-t border-rule`}>
                        <span className={titleCls}>Delete account</span>
                        <span className={hintCls}>Permanently removes your account. This can't be undone.</span>
                        <button type="button" onClick={() => { setDeleting(true); setTyped(''); setDelErr(''); }} className="self-start h-11 px-5 rounded-full bg-coral-tint text-coral-on text-[14.5px] font-extrabold">Delete my account</button>
                    </div>
                </Card>
            </motion.div>

            <Modal open={deleting} onClose={() => !delBusy && setDeleting(false)}>
                <h2 className="m-0 mb-2 text-xl font-black text-ink">Delete your account?</h2>
                <ul className="m-0 mb-4 pl-5 flex flex-col gap-1.5 text-[14.5px] font-semibold leading-[1.45] text-muted">
                    <li>Your Personal section and any group nobody else is in are deleted.</li>
                    <li>If you own a group other people are in, delete it first. We'll tell you which.</li>
                    <li>You're removed from other people's groups. Expenses you added stay, but stop counting toward balances, as if you had left.</li>
                    <li>You can't get the account back. Download your data first if you want a copy.</li>
                </ul>
                <label className="flex flex-col gap-1.5 text-[14px] font-extrabold text-body">Type DELETE to confirm
                    <input className={inputCls} value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" />
                </label>
                {delErr && <p role="alert" className="m-0 mt-3 text-[13.5px] font-bold text-coral-strong">{delErr}</p>}
                <div className="flex gap-3 mt-5">
                    <Button variant="secondary" wide height={44} disabled={delBusy} onClick={() => setDeleting(false)}>Cancel</Button>
                    <Button wide height={44} className="!bg-coral-strong hover:opacity-90" disabled={delBusy || typed.trim() !== 'DELETE'} onClick={removeAccount}>{delBusy ? 'Deleting…' : 'Delete account'}</Button>
                </div>
            </Modal>

            <motion.div {...enter(3)} className="flex">
                <motion.button {...tapFlat} onClick={onLogout} className="h-11 pl-3.5 pr-[18px] flex items-center gap-2 rounded-full bg-[oklch(0.96_0.03_35)] text-[oklch(0.5_0.17_32)] text-[14.5px] font-extrabold">
                    <Icon name="logout" size={19} />Sign out
                </motion.button>
            </motion.div>
        </div>
    );
}
