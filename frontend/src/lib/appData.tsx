import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { listGroups, listSessions, listSettlements, myInvites, isAdmin, Group, Session, Settlement, Invite } from './api';

export interface AppData {
    me: string;
    groups: Group[];
    sessions: Session[];
    settlements: Settlement[];
    invites: Invite[];
    isAdmin: boolean;
    loading: boolean;
    error: string;
    /** Reload everything (call after any change that affects lists or balances). */
    refresh: () => Promise<void>;
}

const Ctx = createContext<AppData | null>(null);

export function useAppData(): AppData {
    const v = useContext(Ctx);
    if (!v) throw new Error('useAppData must be used inside <AppDataProvider>');
    return v;
}

/** One shared copy of everything the signed-in shell, home and friends screens render. */
export function AppDataProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
    const [groups, setGroups] = useState<Group[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [settlements, setSettlements] = useState<Settlement[]>([]);
    const [invites, setInvites] = useState<Invite[]>([]);
    const [admin, setAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const alive = useRef(true);
    // StrictMode runs cleanup then setup again on mount, so re-arm the flag in setup.
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

    const refresh = useCallback(async () => {
        try {
            const [g, s, st, inv, adm] = await Promise.all([
                listGroups(), listSessions(), listSettlements(), myInvites(), isAdmin().catch(() => false),
            ]);
            if (!alive.current) return;
            setGroups(g); setSessions(s); setSettlements(st); setInvites(inv); setAdmin(adm);
            setError('');
        } catch (err: any) {
            if (alive.current) setError(err.message || 'Failed to load your data');
        } finally {
            if (alive.current) setLoading(false);
        }
    }, []);

    useEffect(() => { void refresh(); }, [refresh, userId]);

    const value = useMemo<AppData>(
        () => ({ me: userId, groups, sessions, settlements, invites, isAdmin: admin, loading, error, refresh }),
        [userId, groups, sessions, settlements, invites, admin, loading, error, refresh]
    );
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
