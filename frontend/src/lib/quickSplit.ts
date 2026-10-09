import { supabase } from './supabase';

/** A quick split as the link's page sees it. Anyone holding the link can read and edit it, unless it is locked. */
export interface QuickSplit {
    title: string;
    tax: number;
    tip: number;
    paid_by: string | null;
    locked: boolean;
    version: number;
    expires_at: string;
    /** The signed-in account owns it, so it can be managed without the owner key (on any device). */
    is_owner?: boolean;
    people: string[];
    items: { id: string; name: string; price: number; assigned: string[] }[];
}

const run = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data;
};

export async function createQuickSplit(title = 'Dinner'): Promise<{ token: string; ownerKey: string }> {
    const data = await run('qs_create', { p_title: title });
    const row = Array.isArray(data) ? data[0] : data;
    return { token: row.token, ownerKey: row.owner_key };
}

/** null when the link is wrong or the split has expired. */
export async function getQuickSplit(token: string): Promise<QuickSplit | null> {
    const d = await run('qs_get', { p_token: token });
    if (!d) return null;
    return {
        ...d,
        tax: Number(d.tax),
        tip: Number(d.tip),
        items: (d.items ?? []).map((i: any) => ({ ...i, price: Number(i.price), assigned: i.assigned ?? [] })),
    };
}

/** Joining returns this person's private member key: keep it, it is what lets them (and only them) tap their own items. */
export const joinQuickSplit = async (token: string, name: string): Promise<string> => String(await run('qs_join', { p_token: token, p_name: name }));

/** "I'm Ann": get a fresh private key for a name that is already on the split (after losing a session or switching device). */
export const reclaimQuickSplit = async (token: string, name: string): Promise<string> => String(await run('qs_reclaim', { p_token: token, p_name: name }));

// Everything about the split itself is the owner's: pass the owner key, or null when signed in as the owning account.
export const removeQuickPerson = (token: string, name: string, ownerKey: string | null) => run('qs_remove_person', { p_token: token, p_name: name, p_owner_key: ownerKey });
export const setQuickSplit = (token: string, patch: Partial<Pick<QuickSplit, 'tax' | 'tip' | 'paid_by'>>, ownerKey: string | null) => run('qs_set', { p_token: token, p_patch: patch, p_owner_key: ownerKey });
/** The owner, or anyone who has joined (their member key), may add items. */
export const addQuickItems = (token: string, items: { name: string; price: number }[], ownerKey: string | null, memberKey?: string | null) =>
    run('qs_add_items', { p_token: token, p_items: items, p_owner_key: ownerKey, p_member_key: memberKey ?? null });
export const updateQuickItem = (token: string, id: string, patch: { name?: string; price?: number }, ownerKey: string | null) => run('qs_update_item', { p_token: token, p_item: id, p_patch: patch, p_owner_key: ownerKey });
export const deleteQuickItem = (token: string, id: string, ownerKey: string | null) => run('qs_delete_item', { p_token: token, p_item: id, p_owner_key: ownerKey });
/** Anyone may tap THEMSELVES on or off an item (with their member key); the owner may tap anyone. */
export const assignQuickItem = (token: string, id: string, person: string, on: boolean, keys: { memberKey?: string | null; ownerKey?: string | null }) =>
    run('qs_assign', { p_token: token, p_item: id, p_person: person, p_on: on, p_member_key: keys.memberKey ?? null, p_owner_key: keys.ownerKey ?? null });
export const setQuickAssigned = (token: string, id: string, people: string[], ownerKey: string | null) => run('qs_set_assigned', { p_token: token, p_item: id, p_people: people, p_owner_key: ownerKey });
/** Owner only (even when locked). */
export const renameQuickSplit = (token: string, ownerKey: string | null, title: string) => run('qs_rename', { p_token: token, p_owner_key: ownerKey, p_title: title });
export const lockQuickSplit = (token: string, ownerKey: string | null, locked: boolean) => run('qs_lock', { p_token: token, p_owner_key: ownerKey, p_locked: locked });
/** Signed in: attach a split you made with this owner key to your account, so it is listed under Personal. */
export const claimQuickSplit = (token: string, ownerKey: string) => run('qs_claim', { p_token: token, p_owner_key: ownerKey });
export const deleteQuickSplit = (token: string, ownerKey: string | null) => run('qs_delete', { p_token: token, p_owner_key: ownerKey });

// What this browser remembers about a split: who it is, and the owner key if it made the split.
interface Remembered { me?: string; ownerKey?: string; memberKey?: string }
const slot = (token: string) => `splitpot:quick:${token}`;
export function recall(token: string): Remembered {
    try { return JSON.parse(localStorage.getItem(slot(token)) || '{}'); } catch { return {}; }
}
export function remember(token: string, patch: Remembered) {
    try { localStorage.setItem(slot(token), JSON.stringify({ ...recall(token), ...patch })); } catch { /* private mode: fine, just not remembered */ }
}

export const quickPath = (token: string) => `/s/${token}`;
export const quickToken = (pathname: string) => pathname.match(/^\/s\/([A-Za-z0-9]{16,64})\/?$/)?.[1] ?? null;

/** The page for a split nobody has created yet: you set it up here, and nothing exists until you press Create. */
export const quickDraftPath = '/s/new';
export const isQuickDraft = (pathname: string) => /^\/s\/new\/?$/.test(pathname);

/** Open the quick split page. Nothing is created (or saved) until the person presses Create there. */
export function startQuickSplit() {
    window.location.assign(quickDraftPath);
}

/** Create the real split from a draft: same title, people, items, who had what, tax, tip and payer. Returns its token. */
export async function createFromDraft(d: QuickSplit, me?: string): Promise<string> {
    const { token, ownerKey } = await createQuickSplit(d.title.trim() || 'Dinner');
    try {
        remember(token, { ownerKey, ...(me ? { me } : {}) });
        for (const name of d.people) await joinQuickSplit(token, name);
        if (d.items.length) await addQuickItems(token, d.items.map(i => ({ name: i.name, price: i.price })), ownerKey);
        const patch = { ...(d.tax > 0 ? { tax: d.tax } : {}), ...(d.tip > 0 ? { tip: d.tip } : {}), ...(d.paid_by ? { paid_by: d.paid_by } : {}) };
        if (Object.keys(patch).length) await setQuickSplit(token, patch, ownerKey);
        if (d.items.some(i => i.assigned.length)) {
            const saved = await getQuickSplit(token);
            for (const [n, it] of d.items.entries()) {
                if (it.assigned.length && saved?.items[n]) await setQuickAssigned(token, saved.items[n].id, it.assigned, ownerKey);
            }
        }
    } catch (err) {
        await deleteQuickSplit(token, ownerKey).catch(() => {});
        throw err;
    }
    return token;
}
