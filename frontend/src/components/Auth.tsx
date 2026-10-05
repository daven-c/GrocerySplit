import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion, Pop, Collapse, SegmentedTabs, enter, tap, tapFlat } from '../lib/motion';

interface AuthProps {
    onLogin: () => void;
}

export default function Auth({ onLogin }: AuthProps) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [notice, setNotice] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        setNotice('');
        try {
            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
                if (error) throw error;
                onLogin();
            } else {
                const { data, error } = await supabase.auth.signUp({
                    email: email.trim(),
                    password,
                    options: { data: { name: name.trim() } },
                });
                if (error) throw error;
                if (data.session) onLogin();
                else setNotice('Account created! Check your email for a confirmation link, then log in.');
            }
        } catch (err: any) {
            const msg: string = err.message || 'Authentication failed';
            setError(/rate limit/i.test(msg)
                ? 'Too many sign-up emails were sent recently. Please wait about an hour and try again.'
                : msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-slate-50 font-body text-slate-900 min-h-screen flex items-center justify-center p-6">
            <motion.main {...enter(0)} className="w-full max-w-[400px]">
                <div className="flex flex-col items-center mb-10">
                    <div className="w-16 h-16 rounded-2xl bg-slate-900 text-white flex items-center justify-center mb-6 shadow-sm">
                        <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>receipt_long</span>
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
                        Grocery Split
                    </h1>
                    <p className="text-slate-500 mt-2 text-sm text-center">Precise, simple shared expenses.</p>
                </div>

                <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm">
                    <SegmentedTabs id="auth" className="mb-8" value={isLogin ? 'login' : 'signup'} onChange={v => { setIsLogin(v === 'login'); setError(''); }} tabs={[{ value: 'login', label: 'Login' }, { value: 'signup', label: 'Sign Up' }]} />

                    <form className="space-y-5" onSubmit={handleSubmit}>
                        <Pop show={!!error} className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm text-center">{error}</Pop>
                        <Pop show={!!notice} className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-sm text-center">{notice}</Pop>

                        <Collapse open={!isLogin}>
                            <div className="space-y-2 px-1 pb-1 -mx-1">
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest pl-1">Name</label>
                                <input 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all outline-none" 
                                    value={name} onChange={e => setName(e.target.value)} placeholder="Your Name" type="text" required={!isLogin}/>
                            </div>
                        </Collapse>

                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest pl-1">Email Address</label>
                            <input 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all outline-none" 
                                value={email} onChange={e => setEmail(e.target.value)} placeholder="hello@example.com" type="email" required/>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center pl-1">
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest">Password</label>
                            </div>
                            <div className="relative">
                                <input
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-4 pr-12 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all outline-none"
                                    value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" type={showPassword ? 'text' : 'password'} minLength={6} required/>
                                <motion.button {...tap} type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-900 transition-colors">
                                    <span className="material-symbols-outlined text-[20px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
                                </motion.button>
                            </div>
                        </div>

                        <motion.button {...tapFlat} disabled={loading} type="submit" className="w-full py-4 mt-6 bg-slate-900 text-white font-bold rounded-xl shadow-sm hover:bg-slate-800 transition-colors duration-200 disabled:opacity-50">
                            {loading ? 'Processing...' : 'Continue'}
                        </motion.button>
                    </form>
                </div>
            </motion.main>
        </div>
    );
}
