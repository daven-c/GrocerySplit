import React, { useState, useEffect } from "react";
import axios from "axios";
import Auth from "./components/Auth";
import Dashboard from "./components/Dashboard";
import ReceiptUpload from "./components/ReceiptUpload";
import Split from "./components/Split";
import History from "./components/History";
import Groups from "./components/Groups";
import BottomNav from "./components/BottomNav";
import Account from "./components/Account";

type ViewState = 'auth' | 'dashboard' | 'upload' | 'split' | 'history' | 'groups' | 'account';

const App: React.FC = () => {
    const [token, setToken] = useState<string | null>(localStorage.getItem('token') || null);
    const [user, setUser] = useState<any>(JSON.parse(localStorage.getItem('user') || 'null'));
    const [view, setView] = useState<ViewState>(token ? 'dashboard' : 'auth');
    const [activeSessionId, setActiveSessionId] = useState<number | null>(null);

    useEffect(() => {
        const handleHashChange = () => {
            const hash = window.location.hash.replace('#', '') as ViewState;
            if (['dashboard', 'history', 'groups', 'account'].includes(hash)) {
                setView(hash);
            }
        };
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    useEffect(() => {
        if (token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
        } else {
            delete axios.defaults.headers.common['Authorization'];
            localStorage.removeItem('token');
            localStorage.removeItem('user');
        }
    }, [token, user]);

    const handleLogin = (authToken: string, userData: any) => {
        setToken(authToken);
        setUser(userData);
        setView('dashboard');
    };

    const handleEditSession = (sessionId: number) => {
        setActiveSessionId(sessionId);
        setView('split');
    };

    const handleNewUpload = () => {
        setActiveSessionId(null);
        setView('upload');
    };

    const handleLogout = () => {
        setUser(null);
        setToken(null);
        setView('auth');
    };

    return (
        <div className="app-container" style={{ width: '100vw', minHeight: '100vh', background: '#f8fafc' }}>
            <div key={view} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {view === 'auth' && <Auth onLogin={handleLogin} />}
                {view === 'dashboard' && <Dashboard user={user} token={token} onNewSplit={handleNewUpload} onEditSession={handleEditSession} />}
                {view === 'upload' && <ReceiptUpload onUploadComplete={() => setView('split')} onBack={() => setView('dashboard')} />}
                {view === 'split' && <Split token={token} editSessionId={activeSessionId} onBack={() => setView('dashboard')} onSave={() => setView('dashboard')} />}
                {view === 'history' && <History token={token} onEditSession={handleEditSession} />}
                {view === 'groups' && <Groups token={token} />}
                {view === 'account' && <Account user={user} onLogout={handleLogout} />}
            </div>
            
            {(view === 'dashboard' || view === 'history' || view === 'groups' || view === 'account') && (
                <BottomNav currentView={view} />
            )}
        </div>
    );
};

export default App;
