// Real-database test of quick splits, signed out (they need no account). Opt in: npm run test:integration.
import { describe, it, expect } from 'vitest';
import { supabase } from '../supabase';
import {
    addQuickItems, assignQuickItem, createQuickSplit, deleteQuickSplit, getQuickSplit, joinQuickSplit, lockQuickSplit,
    removeQuickPerson, setQuickSplit, updateQuickItem,
} from '../quickSplit';

const run = process.env.INTEGRATION ? describe : describe.skip;

run('quick split, signed out, against the real database', () => {
    let token = '', key = '';

    it('is created with a private token, and the tables themselves are closed', async () => {
        await supabase.auth.signOut({ scope: 'local' });
        ({ token, ownerKey: key } = await createQuickSplit('Test dinner'));
        expect(token).toMatch(/^[0-9a-f]{32}$/);
        const direct = await supabase.from('quick_splits').select('*');
        expect(direct.error).not.toBeNull(); // no table access: only the functions
        expect((await getQuickSplit('0'.repeat(32)))).toBeNull(); // a wrong token reveals nothing
    });

    it('people are unique by name, ignoring case', async () => {
        await joinQuickSplit(token, 'Ann');
        await joinQuickSplit(token, 'Bo');
        await expect(joinQuickSplit(token, 'ann')).rejects.toThrow('That name is taken.');
        expect((await getQuickSplit(token))!.people).toEqual(['Ann', 'Bo']);
    });

    it('items, tax, and taps from different people all land (nobody overwrites anybody)', async () => {
        await addQuickItems(token, [{ name: 'Pasta', price: 30 }, { name: 'Salad', price: 10 }]);
        await setQuickSplit(token, { tax: 2, tip: 3, paid_by: 'Ann' });
        const id = (await getQuickSplit(token))!.items[0].id;
        await Promise.all([assignQuickItem(token, id, 'Ann', true), assignQuickItem(token, id, 'Bo', true)]);
        const d = (await getQuickSplit(token))!;
        expect([...d.items[0].assigned].sort()).toEqual(['Ann', 'Bo']);
        expect(d).toMatchObject({ tax: 2, tip: 3, paid_by: 'Ann' });
        await updateQuickItem(token, id, { price: 31.5 });
        expect((await getQuickSplit(token))!.items[0].price).toBe(31.5);
    });

    it('removing a person clears them from items and from paid-by', async () => {
        await removeQuickPerson(token, 'Ann');
        const d = (await getQuickSplit(token))!;
        expect(d.people).toEqual(['Bo']);
        expect(d.items[0].assigned).toEqual(['Bo']);
        expect(d.paid_by).toBeNull();
    });

    it('only the owner can lock; a locked split rejects every edit until unlocked', async () => {
        await expect(lockQuickSplit(token, 'wrong', true)).rejects.toThrow('Only the owner');
        await lockQuickSplit(token, key, true);
        await expect(joinQuickSplit(token, 'Cy')).rejects.toThrow('locked');
        await expect(addQuickItems(token, [{ name: 'X', price: 1 }])).rejects.toThrow('locked');
        expect((await getQuickSplit(token))!.locked).toBe(true); // still readable
        await lockQuickSplit(token, key, false);
        await joinQuickSplit(token, 'Cy');
    });

    it('only the owner can delete it', async () => {
        await expect(deleteQuickSplit(token, 'wrong')).rejects.toThrow('Only the owner');
        await deleteQuickSplit(token, key);
        expect(await getQuickSplit(token)).toBeNull();
    });
});
