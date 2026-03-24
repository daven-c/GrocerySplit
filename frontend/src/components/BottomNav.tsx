import React from 'react';

interface BottomNavProps {
    currentView: 'dashboard' | 'history' | 'groups' | 'account';
}

export default function BottomNav({ currentView }: BottomNavProps) {
    return (
        <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center justify-center gap-2 p-2 bg-white border border-slate-200 shadow-lg rounded-full z-50">
            <button 
                onClick={() => window.location.hash = 'dashboard'} 
                className={`flex items-center justify-center rounded-full w-12 h-12 transition-all active:scale-95 ${currentView === 'dashboard' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400 hover:text-slate-900 bg-transparent'}`}>
                <span className="material-symbols-outlined" style={currentView === 'dashboard' ? { fontVariationSettings: "'FILL' 1" } : {}}>home</span>
            </button>
            <button 
                onClick={() => window.location.hash = 'history'} 
                className={`flex items-center justify-center rounded-full w-12 h-12 transition-all active:scale-95 ${currentView === 'history' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400 hover:text-slate-900 bg-transparent'}`}>
                <span className="material-symbols-outlined" style={currentView === 'history' ? { fontVariationSettings: "'FILL' 1" } : {}}>receipt_long</span>
            </button>
            <button 
                onClick={() => window.location.hash = 'groups'} 
                className={`flex items-center justify-center rounded-full w-12 h-12 transition-all active:scale-95 ${currentView === 'groups' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400 hover:text-slate-900 bg-transparent'}`}>
                <span className="material-symbols-outlined" style={currentView === 'groups' ? { fontVariationSettings: "'FILL' 1" } : {}}>group</span>
            </button>
            <button 
                onClick={() => window.location.hash = 'account'} 
                className={`flex items-center justify-center rounded-full w-12 h-12 transition-all active:scale-95 ${currentView === 'account' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400 hover:text-slate-900 bg-transparent'}`}>
                <span className="material-symbols-outlined" style={currentView === 'account' ? { fontVariationSettings: "'FILL' 1" } : {}}>person</span>
            </button>
        </nav>
    );
}
