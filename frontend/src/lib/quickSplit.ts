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

export const joinQuickSplit = (token: string, name: string) => run('qs_join', { p_token: token, p_name: name });
export const removeQuickPerson = (token: string, name: string) => run('qs_remove_person', { p_token: token, p_name: name });
export const setQuickSplit = (token: string, patch: Partial<Pick<QuickSplit, 'tax' | 'tip' | 'paid_by'>>) => run('qs_set', { p_token: token, p_patch: patch });
export const addQuickItems = (token: string, items: { name: string; price: number }[]) => run('qs_add_items', { p_token: token, p_items: items });
export const updateQuickItem = (token: string, id: string, patch: { name?: string; price?: number }) => run('qs_update_item', { p_token: token, p_item: id, p_patch: patch });
export const deleteQuickItem = (token: string, id: string) => run('qs_delete_item', { p_token: token, p_item: id });
export const assignQuickItem = (token: string, id: string, person: string, on: boolean) => run('qs_assign', { p_token: token, p_item: id, p_person: person, p_on: on });
export const setQuickAssigned = (token: string, id: string, people: string[]) => run('qs_set_assigned', { p_token: token, p_item: id, p_people: people });
/** Owner only (even when locked). */
export const renameQuickSplit = (token: string, ownerKey: string | null, title: string) => run('qs_rename', { p_token: token, p_owner_key: ownerKey, p_title: title });
export const lockQuickSplit = (token: string, ownerKey: string | null, locked: boolean) => run('qs_lock', { p_token: token, p_owner_key: ownerKey, p_locked: locked });
/** Signed in: attach a split you made with this owner key to your account, so it is listed under Personal. */
export const claimQuickSplit = (token: string, ownerKey: string) => run('qs_claim', { p_token: token, p_owner_key: ownerKey });
export const deleteQuickSplit = (token: string, ownerKey: string | null) => run('qs_delete', { p_token: token, p_owner_key: ownerKey });

// What this browser remembers about a split: who it is, and the owner key if it made the split.
interface Remembered { me?: string; ownerKey?: string }
const slot = (token: string) => `splitpot:quick:${token}`;
export function recall(token: string): Remembered {
    try { return JSON.parse(localStorage.getItem(slot(token)) || '{}'); } catch { return {}; }
}
export function remember(token: string, patch: Remembered) {
    try { localStorage.setItem(slot(token), JSON.stringify({ ...recall(token), ...patch })); } catch { /* private mode: fine, just not remembered */ }
}

export const quickPath = (token: string) => `/s/${token}`;
export const quickToken = (pathname: string) => pathname.match(/^\/s\/([A-Za-z0-9]{16,64})\/?$/)?.[1] ?? null;

/** Make a new split, remember this browser as its owner, and open it. */
export async function startQuickSplit() {
    const { token, ownerKey } = await createQuickSplit();
    remember(token, { ownerKey });
    window.location.assign(quickPath(token));
}
