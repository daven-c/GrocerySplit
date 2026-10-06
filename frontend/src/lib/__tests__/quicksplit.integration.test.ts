// Real-database test of quick splits, signed out (they need no account). Opt in: npm run test:integration.
import { describe, it, expect } from 'vitest';
import { supabase } from '../supabase';
import {
    addQuickItems, assignQuickItem, createQuickSplit, deleteQuickItem, deleteQuickSplit, getQuickSplit, joinQuickSplit, lockQuickSplit,
    reclaimQuickSplit, removeQuickPerson, renameQuickSplit, setQuickAssigned, setQuickSplit, updateQuickItem,
} from '../quickSplit';

const run = process.env.INTEGRATION ? describe : describe.skip;

run('quick split, signed out, against the real database', () => {
    let token = '', key = '', ann = '', bo = '', pasta = '';

    it('is created with a private token, and the tables themselves are closed', async () => {
        await supabase.auth.signOut({ scope: 'local' });
        ({ token, ownerKey: key } = await createQuickSplit('Test dinner'));
        expect(token).toMatch(/^[0-9a-f]{32}$/);
        const direct = await supabase.from('quick_splits').select('*');
        expect(direct.error).not.toBeNull(); // no table access: only the functions
        expect((await getQuickSplit('0'.repeat(32)))).toBeNull(); // a wrong token reveals nothing
    });

    it('people are unique by name, ignoring case, and each gets a private key when they join', async () => {
        ann = await joinQuickSplit(token, 'Ann');
        bo = await joinQuickSplit(token, 'Bo');
        expect(ann).not.toBe(bo);
        await expect(joinQuickSplit(token, 'ann')).rejects.toThrow('That name is taken.');
        expect((await getQuickSplit(token))!.people).toEqual(['Ann', 'Bo']);
    });

    it('only the owner can add, edit or delete items, set tax/tip/payer, or remove people', async () => {
        await expect(addQuickItems(token, [{ name: 'x', price: 1 }], null)).rejects.toThrow('Only the owner');
        await expect(addQuickItems(token, [{ name: 'x', price: 1 }], ann)).rejects.toThrow('Only the owner'); // a member key is not the owner key
        await addQuickItems(token, [{ name: 'Pasta', price: 30 }, { name: 'Salad', price: 10 }], key);
        await setQuickSplit(token, { tax: 2, tip: 3, paid_by: 'Ann' }, key);
        pasta = (await getQuickSplit(token))!.items[0].id;
        await expect(updateQuickItem(token, pasta, { price: 1 }, ann)).rejects.toThrow('Only the owner');
        await expect(deleteQuickItem(token, pasta, null)).rejects.toThrow('Only the owner');
        await expect(setQuickSplit(token, { tax: 99 }, ann)).rejects.toThrow('Only the owner');
        await expect(removeQuickPerson(token, 'Bo', ann)).rejects.toThrow('Only the owner');
        await expect(setQuickAssigned(token, pasta, ['Ann', 'Bo'], ann)).rejects.toThrow('Only the owner');
        await updateQuickItem(token, pasta, { price: 31.5 }, key);
        const d = (await getQuickSplit(token))!;
        expect(d).toMatchObject({ tax: 2, tip: 3, paid_by: 'Ann' });
        expect(d.items[0].price).toBe(31.5);
    });

    it('people tap only THEMSELVES on and off items, and taps from different people all land', async () => {
        await Promise.all([assignQuickItem(token, pasta, 'Ann', true, { memberKey: ann }), assignQuickItem(token, pasta, 'Bo', true, { memberKey: bo })]);
        expect([...(await getQuickSplit(token))!.items[0].assigned].sort()).toEqual(['Ann', 'Bo']);
        await expect(assignQuickItem(token, pasta, 'Bo', false, { memberKey: ann })).rejects.toThrow('only choose items for yourself'); // Ann cannot deselect Bo
        await expect(assignQuickItem(token, pasta, 'Bo', false, {})).rejects.toThrow('only choose items for yourself');
        await expect(assignQuickItem(token, pasta, 'Ann', false, { memberKey: 'made-up' })).rejects.toThrow('only choose items for yourself');
        expect([...(await getQuickSplit(token))!.items[0].assigned].sort()).toEqual(['Ann', 'Bo']);
        await assignQuickItem(token, pasta, 'Ann', false, { memberKey: ann }); // her own, fine
        expect((await getQuickSplit(token))!.items[0].assigned).toEqual(['Bo']);
        await assignQuickItem(token, pasta, 'Bo', false, { ownerKey: key }); // the owner can act for anyone
        expect((await getQuickSplit(token))!.items[0].assigned).toEqual([]);
        await setQuickAssigned(token, pasta, ['Ann', 'Bo'], key);
        expect((await getQuickSplit(token))!.items[0].assigned).toHaveLength(2);
    });

    it('a lost session is recovered by tapping your own name again: a new key, and every device you used keeps working', async () => {
        const ann2 = await reclaimQuickSplit(token, 'Ann');
        expect(ann2).not.toBe(ann);
        await assignQuickItem(token, pasta, 'Ann', true, { memberKey: ann2 });
        await assignQuickItem(token, pasta, 'Ann', false, { memberKey: ann }); // the first device still works
        await expect(assignQuickItem(token, pasta, 'Bo', true, { memberKey: ann2 })).rejects.toThrow('only choose items for yourself'); // never for someone else
        await expect(reclaimQuickSplit(token, 'Nobody')).rejects.toThrow('not on the split');
    });

    it('removing a person (owner) clears them from items and from paid-by', async () => {
        await removeQuickPerson(token, 'Ann', key);
        const d = (await getQuickSplit(token))!;
        expect(d.people).toEqual(['Bo']);
        expect(d.items[0].assigned).toEqual(['Bo']);
        expect(d.paid_by).toBeNull();
    });

    it('only the owner can lock; a locked split rejects every edit until unlocked', async () => {
        await expect(lockQuickSplit(token, 'wrong', true)).rejects.toThrow('Only the owner');
        await lockQuickSplit(token, key, true);
        await expect(joinQuickSplit(token, 'Cy')).rejects.toThrow('locked');
        await expect(addQuickItems(token, [{ name: 'X', price: 1 }], key)).rejects.toThrow('locked');
        await expect(assignQuickItem(token, pasta, 'Bo', false, { memberKey: bo })).rejects.toThrow('locked');
        expect((await getQuickSplit(token))!.locked).toBe(true); // still readable
        await lockQuickSplit(token, key, false);
        await joinQuickSplit(token, 'Cy');
    });

    it('only the owner can rename it (even when locked); the open edit function refuses a title', async () => {
        await expect(setQuickSplit(token, { title: 'hijack' } as any, key)).rejects.toThrow('Only the owner');
        await expect(renameQuickSplit(token, 'wrong', 'hijack')).rejects.toThrow('Only the owner');
        await renameQuickSplit(token, key, 'Renamed by owner');
        await lockQuickSplit(token, key, true);
        await renameQuickSplit(token, key, 'Renamed while locked');
        expect((await getQuickSplit(token))!.title).toBe('Renamed while locked');
        await lockQuickSplit(token, key, false);
    });

    it('only the owner can delete it', async () => {
        await expect(deleteQuickSplit(token, 'wrong')).rejects.toThrow('Only the owner');
        await deleteQuickSplit(token, key);
        expect(await getQuickSplit(token)).toBeNull();
    });
});
