/**
 * Feature flags: switch whole features on or off without removing their code.
 *
 * Order of precedence (first one that mentions a flag wins):
 *   1. This browser's override:  localStorage 'splitpot:flags' = {"activity": true}   (handy for trying a flag out)
 *   2. The build:                VITE_FEATURES="activity,-personal"   (a bare name turns it on, "-name" turns it off)
 *   3. The default below.
 *
 * A flag only hides the feature in the app. Turning one off never deletes data, and the database keeps working.
 */
export const FLAG_DEFAULTS = {
    /** The Activity tab (ledger of expense, receipt and transfer changes). Off for now; the database still records it. */
    activity: false,
    /** Shareable no-account quick splits: the landing page and Home buttons, and the /s/<token> page. */
    quickSplit: true,
    /** The private Personal section. */
    personal: true,
} as const;

export type Flag = keyof typeof FLAG_DEFAULTS;
const NAMES = Object.keys(FLAG_DEFAULTS) as Flag[];

/** "activity,-personal" -> { activity: true, personal: false }. Unknown names are ignored. */
export function parseFlags(spec: string | undefined | null): Partial<Record<Flag, boolean>> {
    const out: Partial<Record<Flag, boolean>> = {};
    for (const raw of (spec ?? '').split(',')) {
        const t = raw.trim();
        if (!t) continue;
        const off = t.startsWith('-');
        const name = (off ? t.slice(1) : t.replace(/^\+/, '')) as Flag;
        if (NAMES.includes(name)) out[name] = !off;
    }
    return out;
}

function fromStorage(): Partial<Record<Flag, boolean>> {
    try {
        const o = JSON.parse(localStorage.getItem('splitpot:flags') || '{}');
        return Object.fromEntries(Object.entries(o).filter(([k, v]) => NAMES.includes(k as Flag) && typeof v === 'boolean'));
    } catch {
        return {};
    }
}

/** Read at call time, so an override takes effect on the next render. */
export function isEnabled(flag: Flag): boolean {
    const local = fromStorage()[flag];
    if (local !== undefined) return local;
    const built = parseFlags(import.meta.env.VITE_FEATURES as string | undefined)[flag];
    return built ?? FLAG_DEFAULTS[flag];
}
