// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { FLAG_DEFAULTS, isEnabled, parseFlags } from '../flags';

beforeEach(() => localStorage.removeItem('splitpot:flags'));

describe('feature flags', () => {
    it('Activity is off by default, the others are on', () => {
        expect(FLAG_DEFAULTS).toEqual({ activity: false, quickSplit: true, personal: true });
        expect(isEnabled('activity')).toBe(false);
        expect(isEnabled('quickSplit')).toBe(true);
        expect(isEnabled('personal')).toBe(true);
    });

    it('parses a build setting: bare or + turns on, - turns off, junk is ignored', () => {
        expect(parseFlags('activity,-personal')).toEqual({ activity: true, personal: false });
        expect(parseFlags(' +activity , -quickSplit ,nonsense, -nope')).toEqual({ activity: true, quickSplit: false });
        expect(parseFlags('')).toEqual({});
        expect(parseFlags(undefined)).toEqual({});
    });

    it("this browser's override wins and is read on every call", () => {
        localStorage.setItem('splitpot:flags', JSON.stringify({ activity: true, personal: false }));
        expect(isEnabled('activity')).toBe(true);
        expect(isEnabled('personal')).toBe(false);
        expect(isEnabled('quickSplit')).toBe(true); // not mentioned: falls back
        localStorage.removeItem('splitpot:flags');
        expect(isEnabled('activity')).toBe(false);
    });

    it('ignores a broken override', () => {
        localStorage.setItem('splitpot:flags', '{not json');
        expect(isEnabled('activity')).toBe(false);
        localStorage.setItem('splitpot:flags', JSON.stringify({ activity: 'yes', bogus: true }));
        expect(isEnabled('activity')).toBe(false);
    });
});
