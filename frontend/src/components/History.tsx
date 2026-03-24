import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';

interface HistoryProps {
    token: string | null;
    onEditSession: (sessionId: number) => void;
}

export default function History({ token, onEditSession }: HistoryProps) {
    const [sessions, setSessions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'cost_high' | 'cost_low'>('date_desc');
    
    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            try {
                const res = await axios.get('/api/sessions');
                if (res.data?.sessions) setSessions(res.data.sessions);
            } catch (err) {
                console.error("History fetch failed", err);
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, [token]);

    const sortedSessions = useMemo(() => {
        let filtered = sessions;

        // Filtering
        if (searchQuery) {
            const lowerCaseQuery = searchQuery.toLowerCase();
            filtered = filtered.filter(session =>
                session.name.toLowerCase().includes(lowerCaseQuery) ||
                (session.items && Object.values(session.items).some((item: any) => item.name.toLowerCase().includes(lowerCaseQuery)))
            );
        }

        // Sorting
        return filtered.sort((a, b) => {
            const dateA = new Date(a.updated_at).getTime();
            const dateB = new Date(b.updated_at).getTime();
            const costA = Object.values(a.items || {}).reduce((sum: number, i: any) => sum + i.price, 0);
            const costB = Object.values(b.items || {}).reduce((sum: number, i: any) => sum + i.price, 0);

            switch (sortBy) {
                case 'date_desc':
                    return dateB - dateA;
                case 'date_asc':
                    return dateA - dateB;
                case 'cost_high':
                    return costB - costA;
                case 'cost_low':
                    return costA - costB;
                default:
                    return 0;
            }
        });
    }, [sessions, searchQuery, sortBy]);

    return (
        <div className="bg-slate-50 font-body text-slate-900 min-h-screen pb-24">
            <header className="sticky top-0 w-full z-50 bg-white border-b border-slate-200">
                <div className="flex justify-start items-center px-6 py-4 w-full">
                    <h1 className="font-headline font-extrabold text-xl text-slate-900">Receipt History</h1>
                </div>
            </header>
            
            <main className="pt-24 px-6 pb-32 max-w-2xl mx-auto flex flex-col items-center">
                
                <div className="w-full flex flex-col sm:flex-row gap-3 mb-8">
                    <div className="flex-1 flex items-center bg-white border border-slate-200 rounded-2xl px-3 py-2 shadow-sm focus-within:border-slate-400 transition-colors">
                        <span className="material-symbols-outlined text-slate-400 mr-2 text-[20px]">search</span>
                        <input 
                            type="text" 
                            placeholder="Search history..." 
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

                <div className="w-full space-y-4">
                    {loading ? (
                        <p className="text-center text-slate-400 font-semibold py-8 animate-pulse">Loading history...</p>
                    ) : sortedSessions.length === 0 ? (
                        <p className="text-center text-slate-400 font-semibold py-8 bg-white border border-slate-200 border-dashed rounded-3xl">No receipts found.</p>
                    ) : (
                        sortedSessions.map((s) => {
                            const participants = s.users ? s.users.length : 0;
                            const sessionTotal = Object.values(s.items || {}).reduce((sum: number, i: any) => sum + i.price, 0);
                            return (
                                <button onClick={() => onEditSession(s.id)} key={s.id} className="w-full flex items-center justify-between p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow hover:border-slate-300 transition-all active:scale-[0.99] text-left group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600 border border-slate-100 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                                            <span className="material-symbols-outlined text-[28px]">receipt_long</span>
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900 text-lg group-hover:text-slate-700 transition-colors">{s.name}</h3>
                                            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mt-1">
                                                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">calendar_today</span>{s.updated_at ? new Date(s.updated_at).toLocaleDateString() : 'Unknown Date'}</span>
                                                <span>&bull;</span>
                                                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">shopping_cart</span>{s.item_count || 0} items</span>
                                                <span>&bull;</span>
                                                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">group</span>{s.participant_count || 0}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right flex items-center gap-4">
                                        <p className="font-headline font-extrabold text-2xl text-slate-900">${sessionTotal.toFixed(2)}</p>
                                        <span className="material-symbols-outlined text-slate-300 group-hover:text-slate-600 transition-colors">chevron_right</span>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </main>
        </div>
    );
}
