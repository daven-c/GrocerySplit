import React, { useState, useEffect, useCallback } from "react";
import type { Session as AuthSession } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { MotionConfig, motion } from "./lib/motion";
import { useNarrow } from "./lib/hooks";
import { AppDataProvider } from "./lib/appData";
import Landing from "./components/Landing";
import Auth from "./components/Auth";
import Shell, { NavView } from "./components/Shell";
import Dashboard from "./components/Dashboard";
import GroupDetail, { GroupTab } from "./components/GroupDetail";
import ReceiptUpload from "./components/ReceiptUpload";
import Split from "./components/Split";
import ExpenseEditor from "./components/ExpenseEditor";
import Friends from "./components/Friends";
import Account from "./components/Account";
import Admin from "./components/Admin";

type View = 'landing' | 'auth' | 'home' | 'group' | 'import' | 'split' | 'expense' | 'friends' | 'account' | 'admin';

const App: React.FC = () => {
    const [auth, setAuth] = useState<AuthSession | null>(null);
    const [ready, setReady] = useState(false);
    const [view, setView] = useState<View>('landing');
    const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
    const [groupId, setGroupId] = useState<string | null>(null);
    const [groupTab, setGroupTab] = useState<GroupTab>('expenses');
    const [recordId, setRecordId] = useState<string | null>(null);
    const [newGroupTick, setNewGroupTick] = useState(0);
    const narrow = useNarrow();

    const user = auth ? { id: auth.user.id, email: auth.user.email, name: auth.user.user_metadata?.name || auth.user.email?.split('@')[0] || 'User' } : null;

    useEffect(() => {
        let done = false;
        // Whatever happens (rejection, a stuck cross-tab lock), never leave the user on an empty screen.
        const finish = (session: AuthSession | null) => {
            if (done) return;
            done = true;
            setAuth(session);
            setView(session ? 'home' : 'landing');
            setReady(true);
        };
        supabase.auth.getSession()
            .then(({ data }) => finish(data.session))
            .catch(err => {
                console.error('Could not restore session', err);
                finish(null);
            });
        const timer = setTimeout(() => {
            console.warn('Session restore timed out; showing the landing page');
            finish(null);
        }, 6000);

        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            setAuth(session);
            // A late session (after the timeout) should still land in the app; sign-out returns to the landing page.
            setView(v => (session ? (v === 'landing' || v === 'auth' ? 'home' : v) : 'landing'));
            if (session) setReady(true);
        });
        return () => {
            clearTimeout(timer);
            sub.subscription.unsubscribe();
        };
    }, []);

    const openGroup = useCallback((id: string, tab: GroupTab = 'expenses') => {
        setGroupId(id);
        setGroupTab(tab);
        setView('group');
    }, []);

    const openRecord = useCallback((id: string, kind: 'receipt' | 'expense') => {
        setRecordId(id);
        setView(kind === 'expense' ? 'expense' : 'split');
    }, []);

    const handleNav = (v: NavView) => setView(v);
    const handleLogout = async () => {
        await supabase.auth.signOut();
        setAuth(null); // don't depend solely on the auth listener to leave the app shell
        setView('landing');
    };

    // Back: record -> its group, import -> group, group -> home.
    const back = () => setView(v => (v === 'group' ? 'home' : groupId ? 'group' : 'home'));

    if (!ready) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center" role="status" aria-label="Loading">
                <div className="w-7 h-7 border-[3px] border-edge border-t-ink rounded-full animate-spin" />
            </div>
        );
    }

    const signedIn = !!auth && !!user;

    return (
        <MotionConfig reducedMotion="user">
            {!signedIn && view !== 'auth' && (
                <Landing onSignIn={() => { setAuthMode('login'); setView('auth'); }} onGetStarted={() => { setAuthMode('signup'); setView('auth'); }} />
            )}
            {!signedIn && view === 'auth' && (
                <motion.div key={authMode} initial={{ opacity: 0.8 }} animate={{ opacity: 1 }}>
                    <Auth initialMode={authMode} onLogin={() => setView('home')} onBack={() => setView('landing')} />
                </motion.div>
            )}
            {signedIn && user && (
                <AppDataProvider userId={user.id}>
                    <Shell
                        view={view as Exclude<View, 'landing' | 'auth'>}
                        narrow={narrow}
                        user={user}
                        groupId={groupId}
                        recordId={recordId}
                        onNav={handleNav}
                        onOpenGroup={id => openGroup(id)}
                        onNewGroup={() => { setView('home'); setNewGroupTick(t => t + 1); }}
                        onBack={back}
                    >
                        {view === 'home' && <Dashboard user={user} narrow={narrow} newGroupTick={newGroupTick} onOpenGroup={openGroup} onGoFriends={() => setView('friends')} />}
                        {view === 'group' && groupId && (
                            <GroupDetail
                                key={groupId}
                                groupId={groupId}
                                initialTab={groupTab}
                                narrow={narrow}
                                onBack={() => setView('home')}
                                onImport={() => setView('import')}
                                onOpenRecord={openRecord}
                            />
                        )}
                        {view === 'import' && groupId && <ReceiptUpload groupId={groupId} narrow={narrow} onImported={id => openRecord(id, 'receipt')} onBack={() => setView('group')} />}
                        {view === 'split' && recordId && <Split sessionId={recordId} narrow={narrow} onBack={() => setView(groupId ? 'group' : 'home')} />}
                        {view === 'expense' && recordId && <ExpenseEditor sessionId={recordId} narrow={narrow} onBack={() => setView(groupId ? 'group' : 'home')} />}
                        {view === 'friends' && <Friends />}
                        {view === 'account' && <Account user={user} onLogout={handleLogout} />}
                        {view === 'admin' && <Admin />}
                    </Shell>
                </AppDataProvider>
            )}
        </MotionConfig>
    );
};

export default App;
