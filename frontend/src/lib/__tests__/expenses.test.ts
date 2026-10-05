import { describe, it, expect } from 'vitest';
import { splitExpense, convertSplit, everyoneEqual, totalOf, myShare, categoryOf, CATEGORIES } from '../expenses';
import { memberTones, HUES, fmt, firstName, initialOf, greeting, groupDot } from '../people';

const sum = (shares: Record<string, number>) => Math.round(Object.values(shares).reduce((a, b) => a + b, 0) * 100) / 100;

describe('splitExpense', () => {
    it('equal: splits evenly and never loses a penny', () => {
        const r = splitExpense(100, 'equal', everyoneEqual(['a', 'b', 'c']));
        expect(r.valid).toBe(true);
        expect(sum(r.shares)).toBe(100);
        expect(Object.values(r.shares).sort()).toEqual([33.33, 33.33, 33.34]);
    });
    it('equal: only included members pay', () => {
        const r = splitExpense(90, 'equal', { a: 1, c: 1 });
        expect(r.shares).toEqual({ a: 45, c: 45 });
    });
    it('exact: valid only when amounts add up to the total, and reports what is left', () => {
        expect(splitExpense(100, 'exact', { a: 60, b: 40 })).toMatchObject({ valid: true, remaining: 0, shares: { a: 60, b: 40 } });
        const under = splitExpense(100, 'exact', { a: 60, b: 30 });
        expect(under).toMatchObject({ valid: false, remaining: 10 });
        expect(under.problem).toMatch(/10\.00 still to assign/);
        const over = splitExpense(100, 'exact', { a: 70, b: 40 });
        expect(over).toMatchObject({ valid: false, remaining: -10 });
        expect(over.problem).toMatch(/10\.00 over/);
    });
    it('exact: handles floating point amounts without drift', () => {
        expect(splitExpense(0.3, 'exact', { a: 0.1, b: 0.2 }).valid).toBe(true);
    });
    it('percent: must add up to 100 and allocates pennies exactly', () => {
        const ok = splitExpense(100, 'percent', { a: 50, b: 25, c: 25 });
        expect(ok).toMatchObject({ valid: true, shares: { a: 50, b: 25, c: 25 } });
        const thirds = splitExpense(100, 'percent', { a: 33.33, b: 33.33, c: 33.34 });
        expect(thirds.valid).toBe(true);
        expect(sum(thirds.shares)).toBe(100);
        const bad = splitExpense(100, 'percent', { a: 60, b: 30 });
        expect(bad).toMatchObject({ valid: false, remaining: 10 });
        expect(splitExpense(100, 'percent', { a: 60, b: 50 }).problem).toMatch(/10% over/);
    });
    it('shares: proportional with exact pennies', () => {
        const r = splitExpense(1000, 'shares', { a: 2, b: 1, c: 1 });
        expect(r.shares).toEqual({ a: 500, b: 250, c: 250 });
        expect(sum(splitExpense(100, 'shares', { a: 1, b: 1, c: 1 }).shares)).toBe(100);
    });
    it('rejects empty, negative and all-zero input', () => {
        expect(splitExpense(10, 'equal', {})).toMatchObject({ valid: false, problem: 'Choose at least one person.' });
        expect(splitExpense(10, 'exact', { a: -5, b: 15 }).valid).toBe(false);
        expect(splitExpense(10, 'shares', { a: 0, b: 0 }).valid).toBe(false);
        expect(splitExpense(10, 'percent', { a: 0, b: 0 }).valid).toBe(false);
    });
    it('a zero total is a valid, all-zero split', () => {
        const r = splitExpense(0, 'equal', everyoneEqual(['a', 'b']));
        expect(r).toMatchObject({ valid: true, shares: { a: 0, b: 0 } });
    });
});

describe('convertSplit', () => {
    it('keeps who is included and seeds sensible values', () => {
        expect(convertSplit('equal', 'shares', { a: 1, b: 1 }, 50)).toEqual({ a: 1, b: 1 });
        expect(convertSplit('equal', 'percent', { a: 1, b: 1, c: 1 }, 50)).toEqual({ a: 33.34, b: 33.33, c: 33.33 });
        expect(convertSplit('equal', 'exact', { a: 1, b: 1 }, 10.01)).toEqual({ a: 5.01, b: 5 });
        expect(splitExpense(10.01, 'exact', convertSplit('equal', 'exact', { a: 1, b: 1 }, 10.01)).valid).toBe(true);
        expect(splitExpense(100, 'percent', convertSplit('equal', 'percent', { a: 1, b: 1, c: 1 }, 100)).valid).toBe(true);
    });
});

describe('totalOf / myShare', () => {
    const receipt = { tax: 1, tip: 0, participants: ['Me', 'Amy'], items: [{ price: 8, assigned_users: ['Me', 'Amy'] }] };
    it('receipts total items + tax + tip; expenses use their amount', () => {
        expect(totalOf(receipt)).toBe(9);
        expect(totalOf({ ...receipt, kind: 'expense', amount: 2400 })).toBe(2400);
    });
    it('shares: receipts by name, expenses by id', () => {
        expect(myShare(receipt, { user_id: 'me', name: 'Me' })).toBe(4.5);
        const exp = { ...receipt, kind: 'expense' as const, amount: 100, split_method: 'percent' as const, split_data: { me: 70, amy: 30 } };
        expect(myShare(exp, { user_id: 'me', name: 'Me' })).toBe(70);
        expect(myShare(exp, { user_id: 'amy', name: 'Amy' })).toBe(30);
        expect(myShare(exp, undefined)).toBe(0);
    });
});

describe('people helpers', () => {
    it('you always get the first hue; others follow in order and repeat after five', () => {
        const members = ['a', 'me', 'b', 'c', 'd', 'e'].map(user_id => ({ user_id }));
        const t = memberTones(members, 'me');
        expect(t.me.hue).toBe(HUES[0]);
        expect(t.a.hue).toBe(HUES[1]);
        expect(t.e.hue).toBe(HUES[5 % HUES.length]);
        expect(t.me.bg).toBe('oklch(0.89 0.09 250)');
    });
    it('formats money and names', () => {
        expect(fmt(1234.5)).toBe('$1,234.50');
        expect(fmt(-3)).toBe('$3.00');
        expect(firstName('Daven Chang')).toBe('Daven');
        expect(initialOf('  priya')).toBe('P');
        expect(greeting(new Date('2026-10-05T08:00:00'))).toBe('Morning');
        expect(greeting(new Date('2026-10-05T15:00:00'))).toBe('Afternoon');
        expect(greeting(new Date('2026-10-05T21:00:00'))).toBe('Evening');
        expect(groupDot('abc')).toMatch(/^oklch\(0\.68 0\.17 \d+\)$/);
    });
    it('categories resolve with a fallback', () => {
        expect(categoryOf('rent').icon).toBe('home');
        expect(categoryOf('mystery').id).toBe('other');
        expect(CATEGORIES.map(c => c.id)).toContain('groceries');
    });
});
