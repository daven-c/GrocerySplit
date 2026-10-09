import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { usernameAvailable } from '../lib/api';
import { motion, Pop, Collapse, SegmentedTabs, enter, tapFlat } from '../lib/motion';
import { Icon, Logo, Button, labelCls } from './ui';
import { fmt, toneFor, HUES } from '../lib/people';

interface AuthProps {
    initialMode?: 'login' | 'signup';
    onLogin: () => void;
    onBack?: () => void;
}

const PREVIEW = [
    { name: 'Sam', amt: 21.84 },
    { name: 'Priya', amt: 27.12 },
    { name: 'Jonah', amt: 25.06 },
    { name: 'Leo', amt: 22.25 },
];

export default function Auth({ initialMode = 'login', onLogin, onBack }: AuthProps) {
    const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
    const isLogin = mode === 'login';
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [forgot, setForgot] = useState(false); // sign-in mode only: ask for a reset link instead of a password
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setNotice('');
        setLoading(true);
        try {
            if (forgot) {
                // The reply is the same whether or not the address has an account, so this can't be used to find out.
                const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
                if (error) throw error;
                setNotice('If that email has an account, a reset link is on its way. Check your inbox and spam folder.');
            } else if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
                if (error) throw error;
                onLogin();
            } else {
                const handle = username.trim().toLowerCase().replace(/^@/, '');
                if (!/^[a-z0-9_]{3,20}$/.test(handle)) throw new Error('Usernames are 3 to 20 letters, numbers or underscores.');
                if (!(await usernameAvailable(handle))) throw new Error('That username is taken. Try another.');
                const { data, error } = await supabase.auth.signUp({
                    email: email.trim(),
                    password,
                    options: { data: { name: name.trim(), username: handle } },
                });
                if (error) throw error;
                if (data.session) onLogin();
                else setNotice('Account created! Check your email for a confirmation link, then sign in.');
            }
        } catch (err: any) {
            const msg: string = err.message || 'Authentication failed';
            setError(/rate limit/i.test(msg) ? (forgot ? 'Too many emails were sent recently. Please wait a little and try again.' : 'Too many sign-up emails were sent recently. Please wait about an hour and try again.') : msg);
        } finally {
            setLoading(false);
        }
    };

    const total = PREVIEW.reduce((a, p) => a + p.amt, 0);

    const fieldCls = 'w-full h-[50px] px-4 border-[1.5px] border-line rounded-2xl bg-field text-[15.5px] font-semibold text-ink';

    return (
        <div className="min-h-screen flex flex-wrap bg-white">
            <div className="hidden min-[760px]:flex relative flex-[1_1_440px] bg-band text-white flex-col justify-center py-24 px-14">
                <span className="absolute top-10 left-14"><Logo size={24} word={21} onBand /></span>
                {/* The headline and sample split sit in the middle of the panel, not pushed to the bottom. */}
                <div className="flex flex-col gap-7">
                    <motion.p {...enter(1)} className="m-0 text-[38px] leading-[1.1] font-black tracking-[-0.03em] max-w-[460px]" style={{ textWrap: 'balance' } as React.CSSProperties}>
                        Tap an item, pick who had it. Tax and tip land where they belong.
                    </motion.p>
                    <motion.div {...enter(2)} className="bg-white text-ink rounded-[24px] p-5 max-w-[400px] flex flex-col gap-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.18)]">
                        <div className="flex justify-between text-[13.5px] font-bold text-faint"><span>Corner Market · Oct 3</span><span>12 items</span></div>
                        {PREVIEW.map((p, i) => {
                            const t = toneFor(HUES[i % HUES.length]);
                            return (
                                <div key={p.name} className="flex items-center gap-3">
                                    <span className="w-8 h-8 rounded-full grid place-items-center text-[13px] font-black" style={{ background: t.bg, color: t.fg }}>{p.name[0]}</span>
                                    <span className="flex-1 text-[15px] font-extrabold">{p.name}</span>
                                    <span className="text-[15px] font-extrabold">{fmt(p.amt)}</span>
                                </div>
                            );
                        })}
                        <div className="border-t-[1.5px] border-dashed border-line pt-3 flex justify-between font-black text-[15px]"><span>Total</span><span>{fmt(total)}</span></div>
                    </motion.div>
                </div>
            </div>

            <div className="flex-[1_1_420px] flex items-center justify-center px-6 py-12">
                <motion.div {...enter(0)} className="w-full max-w-[380px] flex flex-col gap-[26px]">
                    <button type="button" onClick={onBack} aria-label="Back to the home page" className="self-start min-[760px]:hidden"><Logo size={24} word={21} /></button>
                    <button type="button" onClick={onBack} className="hidden min-[760px]:flex self-start items-center gap-1 h-[34px] pl-2 pr-3.5 rounded-full bg-soft text-[13.5px] font-extrabold text-body"><Icon name="arrow_back" size={17} />Back</button>

                    <div className="flex flex-col gap-2">
                        <h1 className="m-0 text-[32px] leading-[1.1] font-black tracking-title">{forgot ? 'Reset your password' : isLogin ? 'Welcome back' : 'Start your first group'}</h1>
                        <p className="m-0 text-base font-semibold leading-[1.45] text-muted">
                            {forgot ? 'Enter your email and we will send you a link to choose a new password.' : isLogin ? 'Sign in to see who owes what.' : 'Split groceries, rent and trips with the people you share them with.'}
                        </p>
                    </div>

                    {!forgot && <SegmentedTabs id="auth" value={mode} onChange={m => { setMode(m); setError(''); setNotice(''); }} tabs={[{ value: 'login', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]} />}

                    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                        <Collapse open={!isLogin}>
                            <label className={`flex flex-col gap-[7px] ${labelCls} px-1 pb-1 -mx-1`}>
                                Your name
                                <input className={fieldCls} value={name} onChange={e => setName(e.target.value)} placeholder="What your friends call you" type="text" autoComplete="name" required={!isLogin} />
                            </label>
                        </Collapse>
                        <Collapse open={!isLogin}>
                            <label className={`flex flex-col gap-[7px] ${labelCls} px-1 pb-1 -mx-1`}>
                                Username
                                <input className={fieldCls} value={username} onChange={e => setUsername(e.target.value)} placeholder="People invite you by this" type="text" autoComplete="username" maxLength={21} required={!isLogin} />
                            </label>
                        </Collapse>
                        <label className={`flex flex-col gap-[7px] ${labelCls}`}>
                            Email
                            <input className={fieldCls} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" type="email" autoComplete="email" required />
                        </label>
                        {!forgot && (
                        <div className={`flex flex-col gap-[7px] ${labelCls}`}>
                            <label htmlFor="auth-password">Password</label>
                            <span className="relative">
                                <input id="auth-password" className={`${fieldCls} pr-12`} value={password} onChange={e => setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} autoComplete={isLogin ? 'current-password' : 'new-password'} minLength={6} required />
                                <motion.button {...tapFlat} type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="absolute inset-y-0 right-0 w-12 flex items-center justify-center touch-manipulation text-faint hover:text-ink">
                                    <Icon name={showPassword ? 'visibility_off' : 'visibility'} size={20} />
                                </motion.button>
                            </span>
                            {isLogin && <button type="button" onClick={() => { setForgot(true); setError(''); setNotice(''); setPassword(''); }} className="self-end text-[13.5px] font-extrabold text-body underline underline-offset-2">Forgot password?</button>}
                        </div>
                        )}

                        <Pop show={!!error} className="text-[13.5px] font-bold text-coral-strong">{error}</Pop>
                        <Pop show={!!notice} className="px-4 py-2.5 rounded-[22px] bg-green-tint text-green-on text-[13.5px] font-extrabold">{notice}</Pop>

                        <Button type="submit" height={52} wide disabled={loading} className="mt-1.5 text-base">
                            {loading ? 'Just a moment...' : forgot ? 'Send reset link' : isLogin ? 'Sign in' : 'Create account'}
                        </Button>
                        {forgot && <button type="button" onClick={() => { setForgot(false); setError(''); setNotice(''); }} className="self-center text-[14px] font-extrabold text-body underline underline-offset-2">Back to sign in</button>}
                    </form>

                    {!forgot && <p className="m-0 text-[13.5px] font-semibold leading-[1.5] text-faint">Pick a username: people invite you to groups by it, and your email stays private.</p>}
                </motion.div>
            </div>
        </div>
    );
}
