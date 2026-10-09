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

    it('creates the whole split in one database call, and remembers this browser as its owner', async () => {
        rpc.mockResolvedValue({ data: [{ token: 'T'.repeat(32), owner_key: 'OK' }], error: null });
        const token = await createFromDraft(draft, 'Ann');
        expect(token).toBe('T'.repeat(32));
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith('qs_create_from_draft', {
            p_title: 'Pizza night', p_people: ['Ann', 'Bo'], p_tax: 2, p_tip: 0, p_paid_by: 'Ann',
            p_items: [{ name: 'Pizza', price: 20, assigned: ['Ann', 'Bo'] }, { name: 'Soda', price: 3, assigned: [] }],
        });
        expect(JSON.parse(localStorage.getItem(`splitpot:quick:${'T'.repeat(32)}`)!)).toMatchObject({ ownerKey: 'OK', me: 'Ann' });
    });

    it('passes the error on and remembers nothing if it fails (nothing was created)', async () => {
        rpc.mockResolvedValue({ data: null, error: { message: 'That name is taken.' } });
        await expect(createFromDraft(draft, 'Ann')).rejects.toThrow('That name is taken.');
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(localStorage.length).toBe(0);
    });
});
