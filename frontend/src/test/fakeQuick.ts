import { vi } from 'vitest';
import type { QuickSplit } from '../lib/quickSplit';

/**
 * An in-memory stand-in for the qs_* database functions, with the same rules: unique names, locked = read-only,
 * the split itself is the owner's, and everyone else can only tap THEMSELVES (with the key joining gave them).
 */
interface State extends QuickSplit { gone: boolean; ownerKey: string; seq: number; claimed: boolean; keys: Record<string, string> }

const blank = (): State => ({
    title: 'Dinner', tax: 0, tip: 0, paid_by: null, locked: false, version: 0, expires_at: '2026-11-05T00:00:00Z',
    people: [], items: [], gone: false, ownerKey: 'OWNER', seq: 0, claimed: false, keys: {},
});

const s: { state: State } = { state: blank() };
const guard = (write = true) => {
    if (s.state.gone) throw new Error('This split was not found, or it has expired.');
    if (write && s.state.locked) throw new Error('This split is locked by its owner.');
};
const isOwner = (key?: string | null) => (!!key && key === s.state.ownerKey) || s.state.claimed;
const ownerOnly = (key: string | null | undefined, what: string) => { if (!isOwner(key)) throw new Error(`Only the owner can ${what}.`); };
const item = (id: string) => s.state.items.find(i => i.id === id)!;

export const fakeQuick = {
    get state() { return s.state; },
    reset() { s.state = blank(); },
    /** `keys` are the member keys people were given when they joined (default: "key-<name>"). */
    seed(p: Partial<Omit<State, 'items'>> & { items?: { name: string; price: number; assigned?: string[] }[]; paidBy?: string }) {
        const { items = [], paidBy, ...rest } = p;
        const people = rest.people ?? [];
        s.state = {
            ...blank(), ...rest, paid_by: paidBy ?? rest.paid_by ?? null,
            keys: rest.keys ?? Object.fromEntries(people.map(n => [n, `key-${n}`])),
            items: items.map((i, n) => ({ id: `i${n}`, name: i.name, price: i.price, assigned: i.assigned ?? [] })), seq: items.length,
        };
    },
    api: {
        getQuickSplit: vi.fn(async () => (s.state.gone ? null : structuredClone({ ...s.state, is_owner: s.state.claimed }))),
        claimQuickSplit: vi.fn(async (_t: string, key: string) => {
            guard(false);
            if (key !== s.state.ownerKey) throw new Error('Only the owner can claim this split.');
            s.state.claimed = true;
        }),
        joinQuickSplit: vi.fn(async (_t: string, name: string) => {
            guard();
            if (s.state.people.some(p => p.toLowerCase() === name.trim().toLowerCase())) throw new Error('That name is taken.');
            s.state.people.push(name.trim());
            s.state.keys[name.trim()] = `key-${name.trim()}`;
            return `key-${name.trim()}`;
        }),
        reclaimQuickSplit: vi.fn(async (_t: string, name: string) => {
            guard();
            if (!s.state.people.includes(name)) throw new Error('That person is not on the split.');
            return `key-${name}`;
        }),
        removeQuickPerson: vi.fn(async (_t: string, name: string, key: string | null) => {
            guard(); ownerOnly(key, 'remove people');
            s.state.people = s.state.people.filter(p => p !== name);
            s.state.items.forEach(i => { i.assigned = i.assigned.filter(a => a !== name); });
        }),
        setQuickSplit: vi.fn(async (_t: string, patch: any, key: string | null) => {
            guard(); ownerOnly(key, 'change this');
            if ('title' in patch) throw new Error('Only the owner can rename this split.');
            Object.assign(s.state, patch);
        }),
        addQuickItems: vi.fn(async (_t: string, items: { name: string; price: number }[], key: string | null, memberKey?: string | null) => {
            guard();
            if (!isOwner(key) && !(memberKey && Object.values(s.state.keys).includes(memberKey))) throw new Error('Join the split with your name to add items.');
            for (const i of items) s.state.items.push({ id: `i${s.state.seq++}`, name: i.name, price: i.price, assigned: [] });
        }),
        updateQuickItem: vi.fn(async (_t: string, id: string, patch: any, key: string | null) => { guard(); ownerOnly(key, 'edit items'); Object.assign(item(id), patch); }),
        deleteQuickItem: vi.fn(async (_t: string, id: string, key: string | null) => { guard(); ownerOnly(key, 'delete items'); s.state.items = s.state.items.filter(i => i.id !== id); }),
        assignQuickItem: vi.fn(async (_t: string, id: string, person: string, on: boolean, keys: { memberKey?: string | null; ownerKey?: string | null }) => {
            guard();
            if (!isOwner(keys.ownerKey) && !(keys.memberKey && keys.memberKey === s.state.keys[person])) throw new Error('You can only choose items for yourself.');
            const it = item(id);
            it.assigned = on ? (it.assigned.includes(person) ? it.assigned : [...it.assigned, person]) : it.assigned.filter(a => a !== person);
        }),
        setQuickAssigned: vi.fn(async (_t: string, id: string, people: string[], key: string | null) => {
            guard(); ownerOnly(key, 'assign other people');
            item(id).assigned = s.state.people.filter(p => people.includes(p));
        }),
        renameQuickSplit: vi.fn(async (_t: string, key: string | null, title: string) => {
            guard(false); ownerOnly(key, 'rename this split');
            s.state.title = title.trim();
        }),
        lockQuickSplit: vi.fn(async (_t: string, key: string | null, locked: boolean) => {
            guard(false); ownerOnly(key, 'lock this split');
            s.state.locked = locked;
        }),
        deleteQuickSplit: vi.fn(async () => { s.state.gone = true; }),
    },
};
