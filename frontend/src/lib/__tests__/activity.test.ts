import { describe, it, expect } from 'vitest';
import { describeChange, mergeActivity } from '../activity';

describe('activity wording', () => {
    it('words every kind of change', () => {
        expect(describeChange({ field: 'name', from: 'Rent', to: 'October rent' })).toBe('Name: "Rent" → "October rent"');
        expect(describeChange({ field: 'amount', from: 20, to: 25.5 })).toBe('Amount: $20.00 → $25.50');
        expect(describeChange({ field: 'tax', from: 1, to: 0 })).toBe('Tax: $1.00 → $0.00');
        expect(describeChange({ field: 'paid_by', from: 'Amy', to: 'Bo' })).toBe('Paid by: Amy → Bo');
        expect(describeChange({ field: 'paid_by', from: null, to: 'Bo' })).toBe('Paid by: nobody → Bo');
        expect(describeChange({ field: 'category', from: 'dining', to: 'groceries' })).toBe('Category: Dining & drinks → Groceries');
        expect(describeChange({ field: 'date', from: '2026-10-01', to: '2026-10-03' })).toBe('Date: Oct 1, 2026 → Oct 3, 2026');
        expect(describeChange({ field: 'kind', from: 'expense', to: 'receipt' })).toBe('Now split by item');
        expect(describeChange({ field: 'kind', from: 'receipt', to: 'expense' })).toBe('Now split as one total');
        expect(describeChange({ field: 'split', from: 'exact', to: 'shares' })).toBe('Split changed (amounts → shares)');
        expect(describeChange({ field: 'split', from: 'exact', to: 'exact' })).toBe('Split changed');
        expect(describeChange({ field: 'items', added: ['Bread'], removed: ['Eggs'], changed: ['Milk', 'Oats'] })).toBe('Items: added Bread; removed Eggs; changed Milk, Oats');
    });

    it('merges expenses and transfers into one list, newest first', () => {
        const e = (id: string, at: string) => ({ id, group_id: 'g', session_id: 's', action: 'created' as const, actor: null, kind: 'expense' as const, name: 'x', total: 1, changes: [], created_at: at });
        const t = (id: string, at: string) => ({ id, group_id: 'g', settlement_id: 's', action: 'created' as const, actor: null, from_user: 'a', to_user: 'b', amount: 1, prev_from_user: null, prev_to_user: null, prev_amount: null, created_at: at });
        const merged = mergeActivity([e('e1', '2026-10-01T10:00:00Z'), e('e2', '2026-10-03T10:00:00Z')], [t('t1', '2026-10-02T10:00:00Z')]);
        expect(merged.map(m => m.id)).toEqual(['e-e2', 't-t1', 'e-e1']);
    });
});
