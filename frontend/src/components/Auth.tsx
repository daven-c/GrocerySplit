import React, { useState } from 'react';
import axios from 'axios';

interface AuthProps {
    onLogin: (token: string, user: any) => void;
}

export default function Auth({ onLogin }: AuthProps) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
            const payload = isLogin ? { email, password } : { email, password, name };
            const res = await axios.post(endpoint, payload);
            if (res.data.token) {
                onLogin(res.data.token, res.data.user);
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-slate-50 font-body text-slate-900 min-h-screen flex items-center justify-center p-6">
            <main className="w-full max-w-[400px]">
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
                    <div className="flex p-1 bg-slate-100 rounded-full mb-8">
                        <button 
                            onClick={() => { setIsLogin(true); setError(''); }}
                            className={`flex-1 py-2 text-sm font-semibold rounded-full transition-all ${isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
                            Login
                        </button>
                        <button 
                            onClick={() => { setIsLogin(false); setError(''); }}
                            className={`flex-1 py-2 text-sm font-semibold rounded-full transition-all ${!isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
                            Sign Up
                        </button>
                    </div>

                    <form className="space-y-5" onSubmit={handleSubmit}>
                        {error && (
                            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm text-center">
                                {error}
                            </div>
                        )}

                        {!isLogin && (
                            <div className="space-y-2">
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest pl-1">Name</label>
                                <input 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all outline-none" 
                                    value={name} onChange={e => setName(e.target.value)} placeholder="Your Name" type="text" required={!isLogin}/>
                            </div>
                        )}

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
                            <input 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all outline-none" 
                                value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" type="password" required/>
                        </div>

                        <button disabled={loading} type="submit" className="w-full py-4 mt-6 bg-slate-900 text-white font-bold rounded-xl shadow-sm hover:bg-slate-800 active:scale-[0.98] transition-all duration-200 disabled:opacity-50">
                            {loading ? 'Processing...' : 'Continue'}
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
}
