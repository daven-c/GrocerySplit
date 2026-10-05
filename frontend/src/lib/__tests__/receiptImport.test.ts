import { describe, it, expect } from 'vitest';
import { parseReceiptJson, EXAMPLE_RECEIPT_JSON, RECEIPT_PROMPT } from '../receiptImport';

describe('parseReceiptJson', () => {
    it('parses the documented example', () => {
        const r = parseReceiptJson(EXAMPLE_RECEIPT_JSON);
        expect(r.items).toHaveLength(3);
        expect(r.tax).toBe(1.25);
        expect(r.store).toBe('Corner Market');
        expect(r.date).toBe('2026-10-05');
    });
    it('accepts a fenced response with chatter around it', () => {
        const r = parseReceiptJson('Here you go!\n```json\n{"items":[{"name":"Milk","price":"$3.50"}]}\n```');
        expect(r.items).toEqual([{ name: 'Milk', price: 3.5 }]);
    });
    it('accepts a bare array and legacy item/cost keys', () => {
        const r = parseReceiptJson('[{"item":"Bread","cost":2.25}]');
        expect(r.items).toEqual([{ name: 'Bread', price: 2.25 }]);
        expect(r.tax).toBe(0);
    });
    it('skips invalid rows and counts them', () => {
        const r = parseReceiptJson('{"items":[{"name":"A","price":1},{"name":"","price":2},{"name":"B","price":-3},{"name":"C"}]}');
        expect(r.items).toHaveLength(1);
        expect(r.skipped).toBe(3);
    });
    it('rejects garbage and empty item lists', () => {
        expect(() => parseReceiptJson('nope')).toThrow(/valid JSON/);
        expect(() => parseReceiptJson('{"items":[]}')).toThrow(/No valid items/);
        expect(() => parseReceiptJson('{"foo":1}')).toThrow(/items/);
    });
    it('ignores a malformed date and clamps negative tax', () => {
        const r = parseReceiptJson('{"date":"yesterday","tax":-5,"items":[{"name":"A","price":1}]}');
        expect(r.date).toBeUndefined();
        expect(r.tax).toBe(0);
    });
    it('prompt documents the schema keys the parser reads', () => {
        for (const k of ['"items"', '"name"', '"price"', '"tax"', '"date"']) expect(RECEIPT_PROMPT).toContain(k);
    });
});
