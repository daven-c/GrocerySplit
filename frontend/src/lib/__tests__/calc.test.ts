import { describe, it, expect } from 'vitest';
import { computeSplit, allocate } from '../calc';

const sum = (r: [string, number][]) => Math.round(r.reduce((a, [, v]) => a + v, 0) * 100) / 100;
const get = (r: [string, number][], n: string) => r.find(([k]) => k === n)![1];

describe('allocate', () => {
    it('always sums exactly to the input', () => {
        expect(allocate(100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
        expect(allocate(1, [1, 1, 1])).toEqual([1, 0, 0]);
        expect(allocate(0, [3, 2])).toEqual([0, 0]);
    });
    it('is proportional', () => {
        expect(allocate(1000, [1, 3])).toEqual([250, 750]);
    });
    it('falls back to even split when all weights are zero', () => {
        expect(allocate(101, [0, 0])).toEqual([51, 50]);
    });
});

describe('computeSplit', () => {
    it('splits a single shared item evenly', () => {
        const r = computeSplit([{ price: 10, assigned_users: ['A', 'B'] }], ['A', 'B'], 0, 0);
        expect(get(r.totals, 'A')).toBe(5);
        expect(get(r.totals, 'B')).toBe(5);
    });
    it('never loses a penny on odd splits', () => {
        const r = computeSplit([{ price: 10, assigned_users: ['A', 'B', 'C'] }], ['A', 'B', 'C'], 0, 0);
        expect(sum(r.totals)).toBe(10);
        expect(r.totals.map(([, v]) => v).sort()).toEqual([3.33, 3.33, 3.34]);
    });
    it('shares tax and tip proportionally to each person\'s items', () => {
        const r = computeSplit(
            [{ price: 30, assigned_users: ['A'] }, { price: 10, assigned_users: ['B'] }],
            ['A', 'B'], 4, 8
        );
        expect(get(r.totals, 'A')).toBe(39); // 30 + 3 tax + 6 tip
        expect(get(r.totals, 'B')).toBe(13); // 10 + 1 tax + 2 tip
        expect(sum(r.totals)).toBe(52);
    });
    it('grand total equals assigned subtotal + tax + tip even with awkward numbers', () => {
        const items = [
            { price: 3.49, assigned_users: ['A', 'B'] },
            { price: 7.99, assigned_users: ['B', 'C'] },
            { price: 0.99, assigned_users: ['A', 'B', 'C'] },
            { price: 12.5, assigned_users: ['C'] },
        ];
        const r = computeSplit(items, ['A', 'B', 'C'], 2.37, 1.11);
        expect(sum(r.totals)).toBe(Math.round((r.assignedSubtotal + 2.37 + 1.11) * 100) / 100);
    });
    it('reports unassigned items and ignores them in totals', () => {
        const r = computeSplit([{ price: 5, assigned_users: [] }, { price: 2, assigned_users: ['A'] }], ['A'], 0, 0);
        expect(r.unassignedSubtotal).toBe(5);
        expect(r.assignedSubtotal).toBe(2);
        expect(get(r.totals, 'A')).toBe(2);
    });
    it('ignores assignees who are no longer participants', () => {
        const r = computeSplit([{ price: 10, assigned_users: ['A', 'Gone'] }], ['A'], 0, 0);
        expect(get(r.totals, 'A')).toBe(10);
    });
    it('splits tax evenly when nothing is assigned yet', () => {
        const r = computeSplit([], ['A', 'B'], 2, 0);
        expect(get(r.totals, 'A')).toBe(1);
    });
    it('handles no participants', () => {
        expect(computeSplit([{ price: 5, assigned_users: ['A'] }], [], 1, 1).totals).toEqual([]);
    });
});
