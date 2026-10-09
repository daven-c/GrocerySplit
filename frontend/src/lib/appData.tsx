import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { listGroups, listSessions, listSettlements, myInvites, isAdmin, deleteStaleDrafts, Group, Session, Settlement, Invite } from './api';

export interface AppData {
    me: string;
    groups: Group[];
    sessions: Session[];
    settlements: Settlement[];
    invites: Invite[];
    isAdmin: boolean;
    loading: boolean;
    error: string;
    /** Reload everything from the server (after saves, and whenever you move between screens). */
    refresh: () => Promise<void>;
    /**
     * Apply an edit to the shared copy immediately, so Home, Friends and group balances reflect it as you type
     * rather than after a reload. A no-op when nothing actually changed.
     */
    patchSession: (id: string, updater: (s: Session) => Session) => void;
}

const Ctx = createContext<AppData | null>(null);

export function useAppData(): AppData {
    const v = useContext(Ctx);
    if (!v) throw new Error('useAppData must be used inside <AppDataProvider>');
    return v;
}

export const BACKGROUND_REFRESH_MS = 60_000;
export const REFRESH_COOLDOWN_MS = 10_000;

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
    const latest = useRef(0);
    // StrictMode runs cleanup then setup again on mount, so re-arm the flag in setup.
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

    /** `silent` is a background top-up: a failure then leaves what is on screen alone instead of showing an error. */
    const load = useCallback(async (silent = false) => {
        const ticket = ++latest.current; // overlapping refreshes: only the most recent response may win
        try {
            const [g, s, st, inv, adm] = await Promise.all([
                listGroups(), listSessions(), listSettlements(), myInvites(), isAdmin().catch(() => false),
            ]);
            if (!alive.current || ticket !== latest.current) return;
            // An unsaved draft is not an expense yet, so it never reaches lists or balances.
            setGroups(g); setSessions(s.filter(x => !x.draft)); setSettlements(st); setInvites(inv); setAdmin(adm);
            setError('');
        } catch (err: any) {
            if (!silent && alive.current && ticket === latest.current) setError(err.message || 'Failed to load your data');
        } finally {
            if (alive.current && ticket === latest.current) setLoading(false);
        }
    }, []);
    const refresh = useCallback(() => load(false), [load]);

    const patchSession = useCallback((id: string, updater: (s: Session) => Session) => {
        setSessions(prev => {
            let changed = false;
            const next = prev.map(s => {
                if (s.id !== id) return s;
                const n = updater(s);
                if (JSON.stringify(n) !== JSON.stringify(s)) changed = true;
                return n;
            });
            return changed ? next : prev; // same array = no re-render, so effects that call this can't loop
        });
    }, []);

    useEffect(() => {
        void deleteStaleDrafts().catch(() => {});
        void refresh();
    }, [refresh, userId]);

    // Other people change shared groups while this tab sits open, so top the data up when the person comes back to
    // the tab and once a minute while they are looking at it (but not while they are typing in a field).
    useEffect(() => {
        let last = Date.now();
        const typing = () => {
            const el = document.activeElement;
            return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
        };
        const run = (returning: boolean) => {
            if (document.visibilityState !== 'visible') return;
            if (!returning && typing()) return;
            if (returning && Date.now() - last < REFRESH_COOLDOWN_MS) return; // flipping tabs quickly shouldn't refetch each time
            last = Date.now();
            void load(true);
        };
        const onBack = () => run(true);
        const timer = setInterval(() => run(false), BACKGROUND_REFRESH_MS);
        document.addEventListener('visibilitychange', onBack);
        window.addEventListener('focus', onBack);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onBack);
            window.removeEventListener('focus', onBack);
        };
    }, [load]);

    const value = useMemo<AppData>(
        () => ({ me: userId, groups, sessions, settlements, invites, isAdmin: admin, loading, error, refresh, patchSession }),
        [userId, groups, sessions, settlements, invites, admin, loading, error, refresh, patchSession]
    );
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
