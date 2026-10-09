import type { SplitData, SplitMethod } from './expenses';

// The shapes the database sends back for the queries in api.ts, before they are tidied into the app's own types.
// Numbers can arrive as strings (Postgres numeric), and columns added later can be missing on old rows.

export interface ItemRow {
    id: string;
    name: string;
    price: number | string;
    assigned_users: string[] | null;
}

export interface SessionRow {
    id: string;
    group_id: string;
    user_id: string | null;
    paid_by: string | null;
    kind: 'receipt' | 'expense' | null;
    draft: boolean | null;
    category: string | null;
    amount: number | string | null;
    split_method: SplitMethod | null;
    split_data: SplitData | null;
    name: string;
    session_date: string;
    tax: number | string;
    tip: number | string;
    participants: string[] | null;
    updated_at: string;
    items?: ItemRow[] | null;
    session_photos?: { count: number }[] | null;
}

export interface GroupMemberRow {
    user_id: string;
    role: 'owner' | 'member';
    joined_at: string | null;
    pinned: boolean | null;
    profiles: { name: string; email: string; username: string | null } | null;
}

export interface GuestRow {
    id: string;
    name: string;
    created_at: string | null;
    linked_user: string | null;
    linked_username: string | null;
}

export interface GroupRow {
    id: string;
    name: string;
    owner_id: string;
    created_at: string;
    personal: boolean | null;
    group_members?: GroupMemberRow[] | null;
    group_guests?: GuestRow[] | null;
}
