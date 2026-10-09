import { describe, it, expect, vi, beforeEach } from 'vitest';

// A scripted stand-in for the Supabase client: each call to from(table).<op>() resolves to whatever the script says.
type Result = { data?: unknown; error?: { message: string } | null };
let script: Record<string, Result> = {};
const calls: string[] = [];

const from = (table: string) => {
    let op = 'select';
    const q: any = {
        insert: () => { op = 'insert'; return q; }, update: () => { op = 'update'; return q; }, delete: () => { op = 'delete'; return q; }, select: () => q,
        eq: (c: string, v: unknown) => { calls.push(`${table}.${op}.eq(${c}=${String(v)})`); return q; },
        in: (c: string, v: unknown[]) => { calls.push(`${table}.${op}.in(${c}=${v.join(',')})`); return q; },
        single: () => q, order: () => q, lt: () => q,
        then: (res: (v: unknown) => unknown) => {
            calls.push(`${table}.${op}`);
            const r = script[`${table}.${op}`] ?? { data: [], error: null };
            return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(res);
        },
    };
    return q;
};

vi.mock('../supabase', () => ({ supabase: { from: (t: string) => from(t), auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) }, storage: { from: () => ({ remove: async () => ({}) }) } } }));

import { createSession, importReceiptIntoSession } from '../api';

beforeEach(() => { script = {}; calls.length = 0; });

describe('createSession', () => {
    it('removes the session again if its items could not be saved, and says why', async () => {
        script['sessions.insert'] = { data: { id: 's-new' } };
        script['items.insert'] = { error: { message: 'items refused' } };
        await expect(createSession({ groupId: 'g1', name: 'Costco', items: [{ name: 'Milk', price: 4 }] })).rejects.toThrow('items refused');
        expect(calls).toContain('sessions.delete.eq(id=s-new)');
    });

    it('leaves it alone when everything worked', async () => {
        script['sessions.insert'] = { data: { id: 's-ok' } };
        await expect(createSession({ groupId: 'g1', name: 'Costco', items: [{ name: 'Milk', price: 4 }] })).resolves.toBe('s-ok');
        expect(calls.some(c => c.startsWith('sessions.delete'))).toBe(false);
    });
});

describe('importReceiptIntoSession', () => {
    const input = { store: 'Corner Market', tax: 1, tip: 0, items: [{ name: 'Oat Milk', price: 5 }, { name: 'Eggs', price: 6 }] };

    it('takes the imported items back out if the totals could not be updated', async () => {
        script['sessions.select'] = { data: { name: 'Receipt', tax: 0, tip: 0 } };
        script['items.insert'] = { data: [{ id: 'i1' }, { id: 'i2' }] };
        script['sessions.update'] = { error: { message: 'update refused' } };
        await expect(importReceiptIntoSession('s1', input)).rejects.toThrow('update refused');
        expect(calls).toContain('items.delete.in(id=i1,i2)');
    });

    it('keeps the items when it all worked', async () => {
        script['sessions.select'] = { data: { name: 'Receipt', tax: 0, tip: 0 } };
        script['items.insert'] = { data: [{ id: 'i1' }, { id: 'i2' }] };
        await importReceiptIntoSession('s1', input);
        expect(calls.some(c => c.startsWith('items.delete'))).toBe(false);
    });
});
