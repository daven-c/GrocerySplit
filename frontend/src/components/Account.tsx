import React from 'react';

interface AccountProps {
    user: any;
    onLogout: () => void;
}

export default function Account({ user, onLogout }: AccountProps) {
    return (
        <div className="bg-slate-50 font-body text-slate-900 min-h-screen pb-32">
            <header className="sticky top-0 w-full z-50 bg-white border-b border-slate-200">
                <div className="flex justify-start items-center px-6 py-4 w-full">
                    <h1 className="font-headline font-extrabold text-xl text-slate-900">Account & Settings</h1>
                </div>
            </header>
            
            <main className="pt-8 px-6 max-w-2xl mx-auto flex flex-col space-y-6">
                <section className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 border border-slate-200 rounded-3xl p-6 shadow-lg flex items-center gap-5 text-white animate-in slide-in-from-bottom-4 duration-500 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                    <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-3xl font-extrabold shadow-inner border border-white/30">
                        {user?.name?.charAt(0) || 'U'}
                    </div>
                    <div className="z-10">
                        <h2 className="font-headline font-extrabold text-2xl tracking-tight">{user?.name || 'User'}</h2>
                        <p className="text-sm font-medium opacity-90">{user?.email || 'email@example.com'}</p>
                    </div>
                </section>

                <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-bottom-6 duration-500 delay-100 fill-mode-both">
                    <div className="bg-white border text-center border-slate-200 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow">
                        <span className="block text-3xl font-black text-indigo-600 mb-1">12</span>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Receipts</span>
                    </div>
                    <div className="bg-white border text-center border-slate-200 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow">
                        <span className="block text-3xl font-black text-pink-600 mb-1">5</span>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Groups</span>
                    </div>
                </div>

                <section className="animate-in slide-in-from-bottom-8 duration-500 delay-200 fill-mode-both">
                    <h3 className="font-headline font-bold text-lg text-slate-900 mb-3 px-2">App Preferences</h3>
                    <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer group">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                                    <span className="material-symbols-outlined text-[16px]">payments</span>
                                </div>
                                <span className="font-bold text-slate-700 text-sm">Default Currency</span>
                            </div>
                            <span className="text-sm text-slate-600 font-bold bg-slate-100 px-3 py-1 rounded-lg">USD ($)</span>
                        </div>
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer group">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center group-hover:bg-amber-200 transition-colors">
                                    <span className="material-symbols-outlined text-[16px]">notifications_active</span>
                                </div>
                                <span className="font-bold text-slate-700 text-sm">Push Notifications</span>
                            </div>
                            <div className="w-12 h-6 bg-indigo-500 rounded-full flex items-center px-1 justify-end transition-all cursor-pointer">
                                <div className="w-4 h-4 bg-white rounded-full shadow-sm"></div>
                            </div>
                        </div>
                        <div className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer group">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-200 flex items-center justify-center group-hover:bg-black transition-colors">
                                    <span className="material-symbols-outlined text-[16px]">dark_mode</span>
                                </div>
                                <span className="font-bold text-slate-700 text-sm">Dark Mode</span>
                            </div>
                            <div className="w-12 h-6 bg-slate-200 rounded-full flex items-center px-1 justify-start transition-all cursor-pointer">
                                <div className="w-4 h-4 bg-white rounded-full shadow-sm"></div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="pt-4 animate-in slide-in-from-bottom-10 duration-500 delay-300 fill-mode-both">
                    <button onClick={onLogout} className="w-full bg-white text-red-600 font-bold py-4 rounded-2xl hover:bg-red-50 transition-colors shadow-sm flex items-center justify-center gap-2 border border-red-200 active:scale-[0.98]">
                        <span className="material-symbols-outlined shrink-0">logout</span>
                        Sign Out
                    </button>
                </section>
            </main>
        </div>
    );
}
