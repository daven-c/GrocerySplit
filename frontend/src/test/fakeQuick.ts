import { vi } from 'vitest';
import type { QuickSplit } from '../lib/quickSplit';

/** An in-memory stand-in for the qs_* database functions, with the same rules (unique names, locked = read-only). */
interface State extends QuickSplit { gone: boolean; ownerKey: string; seq: number }

const blank = (): State => ({
    title: 'Dinner', tax: 0, tip: 0, paid_by: null, locked: false, version: 0, expires_at: '2026-11-05T00:00:00Z',
    people: [], items: [], gone: false, ownerKey: 'OWNER', seq: 0,
});

const s: { state: State } = { state: blank() };
const guard = (write = true) => {
    if (s.state.gone) throw new Error('This split was not found, or it has expired.');
    if (write && s.state.locked) throw new Error('This split is locked by its owner.');
};
const item = (id: string) => s.state.items.find(i => i.id === id)!;

export const fakeQuick = {
    get state() { return s.state; },
    reset() { s.state = blank(); },
    seed(p: Partial<Omit<State, 'items'>> & { items?: { name: string; price: number; assigned?: string[] }[]; paidBy?: string }) {
        const { items = [], paidBy, ...rest } = p;
        s.state = { ...blank(), ...rest, paid_by: paidBy ?? rest.paid_by ?? null, items: items.map((i, n) => ({ id: `i${n}`, name: i.name, price: i.price, assigned: i.assigned ?? [] })), seq: items.length };
    },
    api: {
        getQuickSplit: vi.fn(async () => (s.state.gone ? null : structuredClone(s.state))),
        joinQuickSplit: vi.fn(async (_t: string, name: string) => {
            guard();
            if (s.state.people.some(p => p.toLowerCase() === name.trim().toLowerCase())) throw new Error('That name is taken.');
            s.state.people.push(name.trim());
        }),
        removeQuickPerson: vi.fn(async (_t: string, name: string) => {
            guard();
            s.state.people = s.state.people.filter(p => p !== name);
            s.state.items.forEach(i => { i.assigned = i.assigned.filter(a => a !== name); });
        }),
        setQuickSplit: vi.fn(async (_t: string, patch: any) => { guard(); Object.assign(s.state, patch); }),
        addQuickItems: vi.fn(async (_t: string, items: { name: string; price: number }[]) => {
            guard();
            for (const i of items) s.state.items.push({ id: `i${s.state.seq++}`, name: i.name, price: i.price, assigned: [] });
        }),
        updateQuickItem: vi.fn(async (_t: string, id: string, patch: any) => { guard(); Object.assign(item(id), patch); }),
        deleteQuickItem: vi.fn(async (_t: string, id: string) => { guard(); s.state.items = s.state.items.filter(i => i.id !== id); }),
        assignQuickItem: vi.fn(async (_t: string, id: string, person: string, on: boolean) => {
            guard();
            const it = item(id);
            it.assigned = on ? (it.assigned.includes(person) ? it.assigned : [...it.assigned, person]) : it.assigned.filter(a => a !== person);
        }),
        setQuickAssigned: vi.fn(async (_t: string, id: string, people: string[]) => { guard(); item(id).assigned = s.state.people.filter(p => people.includes(p)); }),
        lockQuickSplit: vi.fn(async (_t: string, key: string, locked: boolean) => {
            guard(false);
            if (key !== s.state.ownerKey) throw new Error('Only the owner can lock this split.');
            s.state.locked = locked;
        }),
        deleteQuickSplit: vi.fn(async () => { s.state.gone = true; }),
    },
};
