import { describe, it, expect, vi, beforeEach } from 'vitest';

// A tiny stand-in for the Supabase client that records what was read, removed and deleted.
const calls: string[] = [];
let staleDrafts: { id: string }[] = [];
let photoPaths: { path: string }[] = [];
let removeFails = false;

const table = (name: string) => {
    const q: any = {
        _op: 'select',
        select() { return q; }, eq() { return q; }, lt() { return q; }, in(col: string, vals: string[]) { calls.push(`${name}.in(${col}:${vals.join(',')})`); return q; },
        delete() { q._op = 'delete'; calls.push(`${name}.delete`); return q; },
        then(res: (v: unknown) => unknown) {
            const data = name === 'sessions' && q._op === 'select' ? staleDrafts : name === 'session_photos' ? photoPaths : [];
            return Promise.resolve({ data, error: null }).then(res);
        },
    };
    return q;
};

vi.mock('../supabase', () => ({
    supabase: {
        auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) },
        from: (name: string) => table(name),
        storage: { from: () => ({ remove: async (paths: string[]) => { calls.push(`storage.remove(${paths.join(',')})`); if (removeFails) throw new Error('storage down'); return { data: [], error: null }; } }) },
    },
}));

import { deleteStaleDrafts } from '../api';

beforeEach(() => { calls.length = 0; staleDrafts = []; photoPaths = []; removeFails = false; });

describe('deleteStaleDrafts', () => {
    it('removes the photo files of stale drafts before deleting the drafts', async () => {
        staleDrafts = [{ id: 'd1' }, { id: 'd2' }];
        photoPaths = [{ path: 'g1/d1/a.jpg' }, { path: 'g1/d2/b.jpg' }];
        await deleteStaleDrafts();
        expect(calls.indexOf('storage.remove(g1/d1/a.jpg,g1/d2/b.jpg)')).toBeGreaterThan(-1);
        expect(calls.indexOf('storage.remove(g1/d1/a.jpg,g1/d2/b.jpg)')).toBeLessThan(calls.indexOf('sessions.delete'));
        expect(calls).toContain('sessions.in(id:d1,d2)');
    });

    it('does nothing when there are no stale drafts', async () => {
        await deleteStaleDrafts();
        expect(calls).not.toContain('sessions.delete');
        expect(calls.some(c => c.startsWith('storage.remove'))).toBe(false);
    });

    it('still deletes the drafts if the storage service is down', async () => {
        staleDrafts = [{ id: 'd1' }];
        photoPaths = [{ path: 'g1/d1/a.jpg' }];
        removeFails = true;
        await deleteStaleDrafts();
        expect(calls).toContain('sessions.delete');
    });
});
