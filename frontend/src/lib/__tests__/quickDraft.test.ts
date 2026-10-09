// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('../supabase', () => ({ supabase: { rpc: (fn: string, args: any) => rpc(fn, args) } }));

import { createFromDraft, isQuickDraft, quickToken } from '../quickSplit';

const draft = {
    title: ' Pizza night ', tax: 2, tip: 0, paid_by: 'Ann', locked: false, version: 0, expires_at: '', people: ['Ann', 'Bo'],
    items: [{ id: 'd1', name: 'Pizza', price: 20, assigned: ['Ann', 'Bo'] }, { id: 'd2', name: 'Soda', price: 3, assigned: [] }],
};

beforeEach(() => {
    rpc.mockReset();
    localStorage.clear();
});

describe('quick split drafts', () => {
    it('knows the draft path and keeps it apart from real links', () => {
        expect(isQuickDraft('/s/new')).toBe(true);
        expect(isQuickDraft('/s/new/')).toBe(true);
        expect(isQuickDraft('/s/' + 'a'.repeat(32))).toBe(false);
        expect(quickToken('/s/new')).toBeNull();
    });

    it('creates the split only when asked, then replays people, items, settings and who had what', async () => {
        rpc.mockImplementation(async (fn: string) => {
            if (fn === 'qs_create') return { data: [{ token: 'T'.repeat(32), owner_key: 'OK' }], error: null };
            if (fn === 'qs_get') return { data: { ...draft, items: [{ id: 'r1', name: 'Pizza', price: 20, assigned: [] }, { id: 'r2', name: 'Soda', price: 3, assigned: [] }] }, error: null };
            return { data: null, error: null };
        });
        const token = await createFromDraft(draft, 'Ann');
        expect(token).toBe('T'.repeat(32));
        expect(rpc.mock.calls.map(c => c[0])).toEqual(['qs_create', 'qs_join', 'qs_join', 'qs_add_items', 'qs_set', 'qs_get', 'qs_set_assigned']);
        expect(rpc.mock.calls[0][1]).toEqual({ p_title: 'Pizza night' });
        expect(rpc.mock.calls.at(-1)![1]).toMatchObject({ p_item: 'r1', p_people: ['Ann', 'Bo'], p_owner_key: 'OK' });
        expect(JSON.parse(localStorage.getItem(`splitpot:quick:${'T'.repeat(32)}`)!)).toMatchObject({ ownerKey: 'OK', me: 'Ann' });
    });

    it('deletes the half-made split if a step fails', async () => {
        rpc.mockImplementation(async (fn: string) => {
            if (fn === 'qs_create') return { data: [{ token: 'T'.repeat(32), owner_key: 'OK' }], error: null };
            if (fn === 'qs_add_items') return { data: null, error: { message: 'boom' } };
            return { data: null, error: null };
        });
        await expect(createFromDraft(draft)).rejects.toThrow('boom');
        expect(rpc.mock.calls.at(-1)![0]).toBe('qs_delete');
    });
});
