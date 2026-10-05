import React, { useState } from 'react';
import { motion, Pop, enter, tapFlat } from '../lib/motion';
import { useAppData } from '../lib/appData';
import { updateDisplayName, requestEmailChange, changePassword } from '../lib/api';
import { HUES, toneFor } from '../lib/people';
import { Avatar, Button, Card, Icon, inputCls } from './ui';

interface AccountProps {
    user: { id: string; email?: string; name: string } | null;
    onLogout: () => void;
}

type Msg = { type: 'ok' | 'err'; text: string } | null;

function Banner({ msg }: { msg: Msg }) {
    return (
        <Pop show={!!msg} className={`text-[13px] ${msg?.type === 'err' ? 'text-coral-strong' : 'px-3 py-2.5 rounded-[10px] bg-green-tint text-green-on'}`}>
            {msg?.text}
        </Pop>
    );
}

function PasswordField({ placeholder, label, value, onChange, autoComplete, className = '' }: { placeholder: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; className?: string }) {
    const [show, setShow] = useState(false);
    return (
        <span className={`relative ${className}`}>
            <input aria-label={label} placeholder={placeholder} className={`${inputCls} pr-11`} type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} autoComplete={autoComplete} required />
            <motion.button {...tapFlat} type="button" onClick={() => setShow(v => !v)} aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} className="absolute inset-y-0 right-0 px-3 flex items-center text-faint hover:text-ink">
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

    const [email, setEmail] = useState('');
    const [emailMsg, setEmailMsg] = useState<Msg>(null);
    const [emailBusy, setEmailBusy] = useState(false);

    const [cur, setCur] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [pwMsg, setPwMsg] = useState<Msg>(null);
    const [pwBusy, setPwBusy] = useState(false);

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
    return (
        <div className="max-w-[620px] mx-auto flex flex-col gap-7">
            <motion.div {...enter(0)} className="flex items-center gap-4">
                <Avatar name={user?.name || 'U'} tone={tone} size={56} />
                <div className="flex flex-col gap-0.5 min-w-0">
                    <h1 className="m-0 text-2xl font-semibold tracking-[-0.02em] truncate">{user?.name || 'You'}</h1>
                    <span className="text-sm text-muted truncate">{user?.email} · {groups.length} {groups.length === 1 ? 'group' : 'groups'}</span>
                </div>
            </motion.div>

            <motion.div {...enter(1)}>
                <Card>
                    <form className="p-5 flex flex-col gap-2.5" onSubmit={saveName}>
                        <label htmlFor="display-name" className="text-[15px] font-semibold">Display name</label>
                        <div className="flex gap-2">
                            <input id="display-name" className={`${inputCls} flex-1 min-w-0`} value={name} onChange={e => setName(e.target.value)} maxLength={60} required />
                            <Button variant="secondary" type="submit" height={42} disabled={nameBusy || !name.trim() || name.trim() === user?.name}>{nameBusy ? 'Saving…' : 'Save'}</Button>
                        </div>
                        <span className="text-[13px] text-faint">This is how you appear on receipts and in your groups.</span>
                        <Banner msg={nameMsg} />
                    </form>

                    <form className="p-5 border-t border-rule flex flex-col gap-2.5" onSubmit={saveEmail}>
                        <label htmlFor="new-email" className="text-[15px] font-semibold">Email</label>
                        <div className="flex gap-2">
                            <input id="new-email" className={`${inputCls} flex-1 min-w-0`} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="new@example.com" autoComplete="email" required />
                            <Button variant="secondary" type="submit" height={42} disabled={emailBusy || !email.trim() || email.trim().toLowerCase() === user?.email?.toLowerCase()}>{emailBusy ? 'Sending…' : 'Change'}</Button>
                        </div>
                        <span className="text-[13px] leading-normal text-faint">Currently {user?.email}. Invites sent to your old address won't follow you after a change.</span>
                        <Banner msg={emailMsg} />
                    </form>

                    <form className="p-5 border-t border-rule flex flex-col gap-2.5" onSubmit={savePassword}>
                        <span className="text-[15px] font-semibold">Password</span>
                        <PasswordField label="Current password" placeholder="Current password" value={cur} onChange={setCur} autoComplete="current-password" />
                        <div className="flex flex-wrap gap-2">
                            <PasswordField label="New password" placeholder="New password" value={next} onChange={setNext} autoComplete="new-password" className="flex-[1_1_180px] min-w-0" />
                            <PasswordField label="Confirm new password" placeholder="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" className="flex-[1_1_180px] min-w-0" />
                        </div>
                        <Banner msg={pwMsg} />
                        <Button type="submit" height={40} className="self-start" disabled={pwBusy || !cur || !next || !confirm}>{pwBusy ? 'Updating…' : 'Update password'}</Button>
                    </form>
                </Card>
            </motion.div>

            <motion.div {...enter(2)}>
                <Button variant="secondary" height={40} className="self-start text-coral-strong px-3.5" onClick={onLogout}>
                    <Icon name="logout" size={18} />Sign out
                </Button>
            </motion.div>
        </div>
    );
}
