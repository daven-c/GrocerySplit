import type { Member } from './api';

/** Person hues, assigned by position in the group (you first) and repeating after five. */
export const HUES = [250, 30, 155, 75, 330];

export interface Tone {
    hue: number;
    /** Avatar background / text, and the tint used to highlight a person's rows. */
    bg: string;
    fg: string;
    tint: string;
}

export const toneFor = (hue: number): Tone => ({
    hue,
    bg: `oklch(0.89 0.09 ${hue})`,
    fg: `oklch(0.42 0.15 ${hue})`,
    tint: `oklch(0.965 0.035 ${hue})`,
});

/** Stable tones for a group's members: you are always the first hue, others follow join order. */
export function memberTones(members: Pick<Member, 'user_id'>[], meId: string): Record<string, Tone> {
    const ordered = [...members.filter(m => m.user_id === meId), ...members.filter(m => m.user_id !== meId)];
    return Object.fromEntries(ordered.map((m, i) => [m.user_id, toneFor(HUES[i % HUES.length])]));
}

const GROUP_HUES = [155, 330, 75, 250, 30];
/** A stable hue for a group, from its id. */
export function groupHue(groupId: string): number {
    let h = 0;
    for (const c of groupId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return GROUP_HUES[h % GROUP_HUES.length];
}
/** The colored circle behind a group's initial (46px in lists, 64px in the group header). */
export function groupTile(groupId: string): { bg: string; fg: string } {
    const hue = groupHue(groupId);
    return { bg: `oklch(0.93 0.06 ${hue})`, fg: `oklch(0.4 0.14 ${hue})` };
}
/** Color of a group's dot. */
export function groupDot(groupId: string): string {
    return `oklch(0.68 0.17 ${groupHue(groupId)})`;
}

export const initialOf = (name: string) => (name.trim()[0] ?? '?').toUpperCase();
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "$1,234.56" (sign dropped; callers choose the wording). */
export const fmt = (n: number) => `$${money.format(Math.abs(n))}`;
/** Like fmt, but a negative amount keeps its minus sign (for balances where someone is down). */
export const fmtSigned = (n: number) => `${n < -0.004 ? '-' : ''}$${money.format(Math.abs(n))}`;

export function greeting(date = new Date()): string {
    const h = date.getHours();
    return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
}

/**
 * How each person is named in sentences and menus: the plain name, plus their @username when someone else in the
 * same list shares that name, so two "Sam"s can be told apart.
 */
export function labelMap(members: { user_id: string; name: string; username?: string }[]): Record<string, string> {
    const count = new Map<string, number>();
    for (const m of members) count.set(m.name.trim().toLowerCase(), (count.get(m.name.trim().toLowerCase()) ?? 0) + 1);
    return Object.fromEntries(members.map(m => [
        m.user_id,
        (count.get(m.name.trim().toLowerCase()) ?? 0) > 1 && m.username ? `${m.name} (@${m.username})` : m.name,
    ]));
}

/** Today's date where the person is (YYYY-MM-DD). The database's own "today" is UTC, which is already tomorrow on a US evening. */
export function localToday(now: Date = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
