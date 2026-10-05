import React, { useState, useEffect } from "react";
import type { Session as AuthSession } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import Auth from "./components/Auth";
import Dashboard from "./components/Dashboard";
import ReceiptUpload from "./components/ReceiptUpload";
import Split from "./components/Split";
import GroupDetail from "./components/GroupDetail";
import Account from "./components/Account";
import Admin from "./components/Admin";
import { AnimatePresence, MotionConfig, motion } from "./lib/motion";

type ViewState = 'auth' | 'dashboard' | 'group' | 'upload' | 'split' | 'account' | 'admin';

const App: React.FC = () => {
    const [auth, setAuth] = useState<AuthSession | null>(null);
    const [ready, setReady] = useState(false);
    const [view, setView] = useState<ViewState>('auth');
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

    const user = auth ? { id: auth.user.id, email: auth.user.email, name: auth.user.user_metadata?.name || auth.user.email?.split('@')[0] || 'User' } : null;

    useEffect(() => {
        let done = false;
        // Whatever happens (rejection, a stuck cross-tab lock), never leave the user on an empty screen.
        const finish = (session: AuthSession | null) => {
            if (done) return;
            done = true;
            setAuth(session);
            setView(session ? 'dashboard' : 'auth');
            setReady(true);
        };
        supabase.auth.getSession()
            .then(({ data }) => finish(data.session))
            .catch(err => {
                console.error('Could not restore session', err);
                finish(null);
            });
        const timer = setTimeout(() => {
            console.warn('Session restore timed out; showing sign-in');
            finish(null);
        }, 6000);

        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            setAuth(session);
            // A late session (after the timeout) should still land on the app, not the sign-in screen.
            setView(v => (session ? (v === 'auth' ? 'dashboard' : v) : 'auth'));
            if (session) setReady(true);
        });
        return () => {
            clearTimeout(timer);
            sub.subscription.unsubscribe();
        };
    }, []);

    const openGroup = (groupId: string) => {
        setActiveGroupId(groupId);
        setView('group');
    };

    const openReceipt = (sessionId: string) => {
        setActiveSessionId(sessionId);
        setView('split');
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setView('auth');
    };

    if (!ready) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center" role="status" aria-label="Loading">
                <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
            </div>
        );
    }

    const signedIn = !!auth;

    return (
        <MotionConfig reducedMotion="user">
        <div className="app-container" style={{ width: '100vw', minHeight: '100vh', background: '#f8fafc' }}>
            <AnimatePresence mode="wait" initial={false}>
            <motion.div key={view} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                {(!signedIn || view === 'auth') && <Auth onLogin={() => setView('dashboard')} />}
                {signedIn && view === 'dashboard' && <Dashboard user={user} onOpenGroup={openGroup} onOpenAccount={() => setView('account')} onOpenAdmin={() => setView('admin')} onLogout={handleLogout} />}
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
                {signedIn && view === 'admin' && <Admin onBack={() => setView('dashboard')} />}
                {signedIn && view === 'account' && <Account user={user} onBack={() => setView('dashboard')} onLogout={handleLogout} />}
            </motion.div>
            </AnimatePresence>
        </div>
        </MotionConfig>
    );
};

export default App;
