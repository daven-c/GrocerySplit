import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { usernameAvailable } from '../lib/api';
import { motion, Pop, Collapse, SegmentedTabs, enter, tapFlat } from '../lib/motion';
import { Icon, Logo, Button, inputCls, labelCls } from './ui';
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
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setNotice('');
        setLoading(true);
        try {
            if (isLogin) {
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
            setError(/rate limit/i.test(msg) ? 'Too many sign-up emails were sent recently. Please wait about an hour and try again.' : msg);
        } finally {
            setLoading(false);
        }
    };

    const total = PREVIEW.reduce((a, p) => a + p.amt, 0);

    return (
        <div className="min-h-screen flex flex-wrap bg-white">
            <div className="flex-[1_1_420px] flex items-center justify-center px-6 py-14">
                <motion.div {...enter(0)} className="w-full max-w-[360px] flex flex-col gap-7">
                    <button type="button" onClick={onBack} aria-label="Back to the home page" className="self-start"><Logo size={22} word={19} /></button>

                    <div className="flex flex-col gap-2">
                        <h1 className="m-0 text-[30px] leading-[1.15] font-semibold tracking-title">{isLogin ? 'Welcome back' : 'Start a pot'}</h1>
                        <p className="m-0 text-[15px] leading-normal text-muted">
                            {isLogin ? 'Sign in to see who owes what.' : 'Split groceries, rent and trips with the people you share them with.'}
                        </p>
                    </div>

                    <SegmentedTabs id="auth" value={mode} onChange={m => { setMode(m); setError(''); setNotice(''); }} tabs={[{ value: 'login', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]} />

                    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                        <Collapse open={!isLogin}>
                            <label className={`flex flex-col gap-1.5 ${labelCls} px-1 pb-1 -mx-1`}>
                                Your name
                                <input className={`${inputCls} h-11 px-3.5`} value={name} onChange={e => setName(e.target.value)} placeholder="What your friends call you" type="text" autoComplete="name" required={!isLogin} />
                            </label>
                        </Collapse>
                        <Collapse open={!isLogin}>
                            <label className={`flex flex-col gap-1.5 ${labelCls} px-1 pb-1 -mx-1`}>
                                Username
                                <input className={`${inputCls} h-11 px-3.5`} value={username} onChange={e => setUsername(e.target.value)} placeholder="People invite you by this" type="text" autoComplete="username" maxLength={21} required={!isLogin} />
                            </label>
                        </Collapse>
                        <label className={`flex flex-col gap-1.5 ${labelCls}`}>
                            Email
                            <input className={`${inputCls} h-11 px-3.5`} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" type="email" autoComplete="email" required />
                        </label>
                        <label className={`flex flex-col gap-1.5 ${labelCls}`}>
                            Password
                            <span className="relative">
                                <input className={`${inputCls} h-11 px-3.5 pr-11`} value={password} onChange={e => setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} autoComplete={isLogin ? 'current-password' : 'new-password'} minLength={6} required />
                                <motion.button {...tapFlat} type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 px-3 flex items-center text-faint hover:text-ink">
                                    <Icon name={showPassword ? 'visibility_off' : 'visibility'} size={20} />
                                </motion.button>
                            </span>
                        </label>

                        <Pop show={!!error} className="text-[13px] text-coral-strong">{error}</Pop>
                        <Pop show={!!notice} className="px-3 py-2.5 rounded-[10px] bg-green-tint text-green-on text-[13px]">{notice}</Pop>

                        <Button type="submit" height={46} wide disabled={loading} className="mt-1 text-[15px]">
                            {loading ? 'Just a moment...' : isLogin ? 'Sign in' : 'Create account'}
                        </Button>
                    </form>

                    <p className="m-0 text-[13px] leading-normal text-faint">Pick a username: people invite you to groups by it, and your email stays private.</p>
                </motion.div>
            </div>

            <div className="hidden min-[760px]:flex flex-[1_1_420px] bg-ink text-white flex-col justify-center gap-9 p-14">
                <motion.p {...enter(1)} className="m-0 text-[28px] leading-[1.25] font-medium tracking-[-0.02em] max-w-[420px] text-[#FDFDFC]" style={{ textWrap: 'pretty' } as React.CSSProperties}>
                    Tap an item, pick who had it. Tax and tip land where they belong.
                </motion.p>
                <motion.div {...enter(2)} className="bg-white text-ink rounded-[14px] p-5 max-w-[380px] flex flex-col gap-3.5">
                    <div className="flex justify-between text-[13px] text-muted"><span>Corner Market · Oct 3</span><span>12 items</span></div>
                    {PREVIEW.map((p, i) => {
                        const t = toneFor(HUES[i % HUES.length]);
                        return (
                            <div key={p.name} className="flex items-center gap-2.5">
                                <span className="w-[26px] h-[26px] rounded-full grid place-items-center text-xs font-semibold" style={{ background: t.bg, color: t.fg }}>{p.name[0]}</span>
                                <span className="flex-1 text-sm font-medium">{p.name}</span>
                                <span className="font-mono text-sm">{fmt(p.amt)}</span>
                            </div>
                        );
                    })}
                    <div className="border-t border-dashed border-dash pt-3 flex justify-between font-semibold text-sm"><span>Total</span><span className="font-mono">{fmt(total)}</span></div>
                </motion.div>
            </div>
        </div>
    );
}
