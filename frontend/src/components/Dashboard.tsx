import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface DashboardProps {
    user: any;
    token: string | null;
    onNewSplit: () => void;
    onEditSession: (sessionId: number) => void;
}

export default function Dashboard({ user, token, onNewSplit, onEditSession }: DashboardProps) {
    const [sessions, setSessions] = useState<any[]>([]);
    const [oweTotals, setOweTotals] = useState<Record<string, number>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'cost_high' | 'cost_low'>('date_desc');

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                // Fetch the list of historical sessions from the old JSON implementation
                const sessRes = await axios.get('/api/sessions');
                if (sessRes.data && sessRes.data.sessions) {
                    setSessions(sessRes.data.sessions);
                }
                
                // Fetch active session's split totals
                const calcRes = await axios.get('/api/calculate');
                if (calcRes.data) {
                    setOweTotals(calcRes.data);
                }
            } catch (err) {
                console.error("Failed to fetch dashboard data:", err);
            }
        };
        fetchDashboardData();
    }, [token]);

    const activeTotal = Object.values(oweTotals).reduce((a, b) => a + b, 0);

    const sortedSessions = React.useMemo(() => {
        let filtered = sessions;
        if (searchQuery) {
            const lowerCaseQuery = searchQuery.toLowerCase();
            filtered = filtered.filter(session =>
                session.name.toLowerCase().includes(lowerCaseQuery) ||
                (session.items && Object.values(session.items).some((item: any) => item.name.toLowerCase().includes(lowerCaseQuery)))
            );
        }
        return filtered.sort((a, b) => {
            const dateA = new Date(a.updated_at).getTime();
            const dateB = new Date(b.updated_at).getTime();
            const costA = Object.values(a.items || {}).reduce((sum: number, i: any) => sum + i.price, 0);
            const costB = Object.values(b.items || {}).reduce((sum: number, i: any) => sum + i.price, 0);
            switch (sortBy) {
                case 'date_desc': return dateB - dateA;
                case 'date_asc': return dateA - dateB;
                case 'cost_high': return costB - costA;
                case 'cost_low': return costA - costB;
                default: return 0;
            }
        });
    }, [sessions, searchQuery, sortBy]);

    return (
        <div className="bg-slate-50 font-body text-slate-900 min-h-screen pb-24">
            
            <header className="sticky top-0 w-full z-50 bg-white border-b border-slate-200">
                <div className="flex justify-between items-center px-6 py-4 max-w-2xl mx-auto">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center">
                            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>receipt_long</span>
                        </div>
                        <h1 className="font-headline font-extrabold tracking-tight text-xl text-slate-900">Grocery Split</h1>
                    </div>
                </div>
            </header>

            <main className="pt-8 px-6 max-w-2xl mx-auto">
                <section className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900">Welcome back{user ? `, ${user.name.split(' ')[0]}` : ''}</h2>
                        <p className="text-slate-500 text-sm mt-1">Here is your summary for this month.</p>
                    </div>
                </section>

                <section className="grid grid-cols-2 gap-4 mb-10">
                    <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-black rounded-3xl p-6 shadow-xl shadow-indigo-900/20 flex flex-col justify-between aspect-[4/3] relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500 opacity-20 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-indigo-400 transition-colors duration-700"></div>
                        <div className="absolute bottom-0 left-0 w-24 h-24 bg-purple-500 opacity-20 rounded-full blur-2xl -ml-10 -mb-10 group-hover:bg-purple-400 transition-colors duration-700"></div>
                        <div className="relative z-10">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300/80 mb-1">Active Split Total</p>
                            <h2 className="font-headline text-3xl font-extrabold text-white">${activeTotal.toFixed(2)}</h2>
                        </div>
                        <div className="flex -space-x-2 mt-4 relative z-10">
                            {Object.keys(oweTotals).slice(0, 3).map((u, i) => (
                                <div key={i} className="w-8 h-8 rounded-full border-2 border-slate-900 bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-700 capitalize shadow-sm">
                                    {u.charAt(0)}
                                </div>
                            ))}
                            {Object.keys(oweTotals).length > 3 && (
                                <div className="w-8 h-8 rounded-full border-2 border-slate-900 bg-slate-800 flex items-center justify-center text-[10px] font-bold text-indigo-300">
                                    +{Object.keys(oweTotals).length - 3}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between aspect-[4/3] hover:shadow-md transition-shadow">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Saved Sessions</p>
                            <h2 className="font-headline text-3xl font-extrabold text-slate-700">{sessions.length}</h2>
                        </div>
                        <div className="flex -space-x-2 mt-4">
                            <div className="w-10 h-10 rounded-full border-2 border-white bg-emerald-100 flex items-center justify-center font-bold text-emerald-600 shadow-sm">
                                <span className="material-symbols-outlined text-[18px]">archive</span>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="grid grid-cols-2 gap-4 mb-10">
                    <button onClick={onNewSplit} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-4 px-2 rounded-2xl hover:from-blue-700 hover:to-indigo-700 transition-all flex flex-col items-center justify-center gap-2 shadow-lg shadow-blue-500/30 active:scale-[0.98]">
                        <span className="material-symbols-outlined text-[28px]">document_scanner</span>
                        <span className="text-sm tracking-wide">Scan Receipt</span>
                    </button>
                    <button onClick={async () => {
                        try {
                            const res = await axios.post('/api/sessions', {
                                name: `Manual Receipt || ${new Date().toISOString().split('T')[0]}`
                            });
                            // Route directly to this established active session
                            onEditSession(res.data.id);
                        } catch(err) {
                            console.error("Failed to initialize manual session", err);
                        }
                    }} className="w-full bg-white border-2 border-slate-100 text-indigo-900 font-bold py-4 px-2 rounded-2xl hover:border-indigo-100 hover:bg-indigo-50 transition-all flex flex-col items-center justify-center gap-2 shadow-sm active:scale-[0.98]">
                        <span className="material-symbols-outlined text-[28px] text-indigo-500">edit_document</span>
                        <span className="text-sm tracking-wide">Manual Receipt</span>
                    </button>
                </div>

                <section className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-headline font-bold text-xl text-slate-900">Recent Groceries</h2>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 mb-6">
                        <div className="flex-1 flex items-center bg-white border border-slate-200 rounded-2xl px-3 py-2 shadow-sm focus-within:border-slate-400 transition-colors">
                            <span className="material-symbols-outlined text-slate-400 mr-2 text-[20px]">search</span>
                            <input 
                                type="text" 
                                placeholder="Search past receipts..." 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-transparent border-none outline-none text-sm font-semibold text-slate-700"
                            />
                        </div>
                        <select 
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value as any)}
                            className="bg-white border border-slate-200 rounded-2xl px-4 py-2 text-sm font-bold text-slate-700 shadow-sm outline-none focus:border-slate-400 appearance-none min-w-[140px]"
                        >
                            <option value="date_desc">Newest First</option>
                            <option value="date_asc">Oldest First</option>
                            <option value="cost_high">Highest Cost</option>
                            <option value="cost_low">Lowest Cost</option>
                        </select>
                    </div>
                    
                    <div className="space-y-3">
                        {sortedSessions.length === 0 ? (
                            <p className="text-center text-slate-400 font-semibold py-8 bg-white border border-slate-200 border-dashed rounded-3xl">
                                No matching groceries found.
                            </p>
                        ) : (
                            sortedSessions.map((s) => {
                                const participants = s.users ? s.users.length : 0;
                                const sessionTotal = Object.values(s.items || {}).reduce((sum: number, i: any) => sum + i.price, 0);
                                return (
                                    <button onClick={() => onEditSession(s.id)} key={s.id} className="w-full flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-200 transition-all hover:border-slate-300 shadow-sm hover:shadow active:scale-[0.99] group cursor-pointer text-left">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600 border border-slate-100 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                                                <span className="material-symbols-outlined">receipt</span>
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-900 text-sm group-hover:text-slate-700 transition-colors">{s.name}</h4>
                                                <p className="text-xs text-slate-500 font-medium tracking-wide">
                                                    {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : 'Unknown'} &bull; {s.item_count || 0} Items &bull; {s.participant_count || 0} People
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right flex items-center gap-3">
                                            <p className="font-headline font-bold text-slate-900">${sessionTotal.toFixed(2)}</p>
                                            <span className="material-symbols-outlined text-slate-300 group-hover:text-slate-600 transition-colors">chevron_right</span>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </section>
            </main>
        </div>
    );
}
