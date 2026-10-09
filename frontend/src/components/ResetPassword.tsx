import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion, Pop, enter } from '../lib/motion';
import { Button, Logo, labelCls } from './ui';
import { messageOf } from '../lib/errors';

/** Shown after someone opens the reset link in their email: they are signed in just long enough to choose a new password. */
export default function ResetPassword({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
    const [password, setPassword] = useState('');
    const [again, setAgain] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const fieldCls = 'w-full h-[50px] px-4 border-[1.5px] border-line rounded-2xl bg-field text-[15.5px] font-semibold text-ink';

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (password.length < 6) return setError('Use at least 6 characters.');
        if (password !== again) return setError('The two passwords are different.');
        setSaving(true);
        try {
            const { error: err } = await supabase.auth.updateUser({ password });
            if (err) throw err;
            onDone();
        } catch (err) {
            setError(messageOf(err, 'Could not change the password. Ask for a new link and try again.'));
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-white">
            <motion.div {...enter(0)} className="w-full max-w-[380px] flex flex-col gap-[26px]">
                <Logo size={24} word={21} />
                <div className="flex flex-col gap-2">
                    <h1 className="m-0 text-[32px] leading-[1.1] font-black tracking-title">Choose a new password</h1>
                    <p className="m-0 text-base font-semibold leading-[1.45] text-muted">You're signed in for now. Pick a password you'll use from here on.</p>
                </div>
                <form className="flex flex-col gap-4" onSubmit={submit}>
                    <label className={`flex flex-col gap-[7px] ${labelCls}`}>New password
                        <input className={fieldCls} type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} minLength={6} required />
                    </label>
                    <label className={`flex flex-col gap-[7px] ${labelCls}`}>Type it again
                        <input className={fieldCls} type="password" autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} minLength={6} required />
                    </label>
                    <Pop show={!!error} className="text-[13.5px] font-bold text-coral-strong">{error}</Pop>
                    <Button type="submit" height={52} wide disabled={saving} className="mt-1.5 text-base">{saving ? 'Just a moment...' : 'Save password'}</Button>
                    <button type="button" onClick={onCancel} className="self-center text-[14px] font-extrabold text-body underline underline-offset-2">Never mind, sign me out</button>
                </form>
            </motion.div>
        </div>
    );
}
