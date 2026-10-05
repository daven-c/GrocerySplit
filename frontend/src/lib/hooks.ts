import { useEffect, useRef, useState, useCallback } from 'react';

/** True below the 760px breakpoint (phone layout). Defaults to wide where matchMedia is unavailable. */
export function useNarrow(): boolean {
    const query = '(max-width: 759px)';
    const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
    const [narrow, setNarrow] = useState(get);
    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const mql = window.matchMedia(query);
        const on = () => setNarrow(mql.matches);
        on();
        if (mql.addEventListener) mql.addEventListener('change', on);
        else (mql as any).addListener?.(on);
        return () => {
            if (mql.removeEventListener) mql.removeEventListener('change', on);
            else (mql as any).removeListener?.(on);
        };
    }, []);
    return narrow;
}

/** Close a popover on outside click or Escape. */
export function useDismiss(ref: React.RefObject<HTMLElement>, open: boolean, close: () => void) {
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open, ref, close]);
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Debounced autosave. Call `schedule(fn)` on every change; the last fn runs after `delay` ms of quiet.
 * `flush()` runs a pending save immediately (used when leaving the screen).
 */
export function useAutosave(delay = 600) {
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pending = useRef<(() => Promise<void>) | null>(null);
    const [state, setState] = useState<SaveState>('idle');
    const alive = useRef(true);
    // StrictMode runs cleanup then setup again on mount, so re-arm the flag in setup.
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

    const run = useCallback(async () => {
        const fn = pending.current;
        pending.current = null;
        timer.current = null;
        if (!fn) return;
        if (alive.current) setState('saving');
        try {
            await fn();
            if (alive.current) setState('saved');
        } catch (err) {
            console.error('Autosave failed', err);
            if (alive.current) setState('error');
        }
    }, []);

    const schedule = useCallback((fn: () => Promise<void>) => {
        pending.current = fn;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(run, delay);
    }, [delay, run]);

    const flush = useCallback(async () => {
        if (timer.current) clearTimeout(timer.current);
        await run();
    }, [run]);

    /** Drop a pending save (used when the form becomes invalid, so a stale state is never written). */
    const cancel = useCallback(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        pending.current = null;
    }, []);

    // Don't lose an edit made just before navigating away.
    useEffect(() => () => { if (pending.current) void run(); }, [run]);

    return { schedule, flush, cancel, state };
}
