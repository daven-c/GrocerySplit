import React, { useState, useEffect } from "react";
import type { Session as AuthSession } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import Auth from "./components/Auth";
import Dashboard from "./components/Dashboard";
import ReceiptUpload from "./components/ReceiptUpload";
import Split from "./components/Split";
import History from "./components/History";
import People from "./components/People";
import GroupDetail from "./components/GroupDetail";
import BottomNav from "./components/BottomNav";
import Account from "./components/Account";

type ViewState = 'auth' | 'dashboard' | 'group' | 'upload' | 'split' | 'history' | 'people' | 'account';

const App: React.FC = () => {
    const [auth, setAuth] = useState<AuthSession | null>(null);
    const [ready, setReady] = useState(false);
    const [view, setView] = useState<ViewState>('auth');
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

    const user = auth ? { id: auth.user.id, email: auth.user.email, name: auth.user.user_metadata?.name || auth.user.email?.split('@')[0] || 'User' } : null;

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            setAuth(data.session);
            setView(data.session ? 'dashboard' : 'auth');
            setReady(true);
        });
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            setAuth(session);
            if (!session) setView('auth');
        });
        return () => sub.subscription.unsubscribe();
    }, []);

    useEffect(() => {
        const handleHashChange = () => {
            const hash = window.location.hash.replace('#', '') as ViewState;
            if (['dashboard', 'history', 'people', 'account'].includes(hash)) {
                setView(hash);
            }
        };
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    const openGroup = (groupId: string) => {
        setActiveGroupId(groupId);
        setView('group');
    };

    const openReceipt = (sessionId: string, groupId?: string) => {
        if (groupId) setActiveGroupId(groupId);
        setActiveSessionId(sessionId);
        setView('split');
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setView('auth');
    };

    if (!ready) return <div className="min-h-screen bg-slate-50" />;

    const signedIn = !!auth;

    return (
        <div className="app-container" style={{ width: '100vw', minHeight: '100vh', background: '#f8fafc' }}>
            <div key={view} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {(!signedIn || view === 'auth') && <Auth onLogin={() => setView('dashboard')} />}
                {signedIn && view === 'dashboard' && <Dashboard user={user} onOpenGroup={openGroup} />}
                {signedIn && view === 'group' && activeGroupId && (
                    <GroupDetail
                        groupId={activeGroupId}
                        onBack={() => setView('dashboard')}
                        onImport={() => setView('upload')}
                        onOpenReceipt={openReceipt}
                    />
                )}
                {signedIn && view === 'upload' && activeGroupId && <ReceiptUpload groupId={activeGroupId} onImported={id => openReceipt(id)} onBack={() => setView('group')} />}
                {signedIn && view === 'split' && activeSessionId && <Split sessionId={activeSessionId} onBack={() => setView(activeGroupId ? 'group' : 'dashboard')} />}
                {signedIn && view === 'history' && <History onEditSession={openReceipt} />}
                {signedIn && view === 'people' && <People />}
                {signedIn && view === 'account' && <Account user={user} onLogout={handleLogout} />}
            </div>

            {signedIn && (view === 'dashboard' || view === 'history' || view === 'people' || view === 'account') && (
                <BottomNav currentView={view} />
            )}
        </div>
    );
};

export default App;
