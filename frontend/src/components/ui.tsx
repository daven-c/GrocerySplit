import React from 'react';
import { motion, tap, tapFlat, SegmentedTabs } from '../lib/motion';
import { METHODS, SplitMethod } from '../lib/expenses';
import type { Tone } from '../lib/people';
import { initialOf } from '../lib/people';

/** Material Symbols Outlined icon. */
export function Icon({ name, fill = false, size = 20, className = '' }: { name: string; fill?: boolean; size?: number; className?: string }) {
    return (
        <span aria-hidden="true" className={`icon ${fill ? 'icon-fill' : ''} ${className}`} style={{ fontSize: size }}>
            {name}
        </span>
    );
}

/** The splitpot mark: a circle in two halves. On white: ink + green. On the green band: white + mint. */
export function LogoMark({ size = 22, onBand = false }: { size?: number; onBand?: boolean }) {
    const bg = onBand ? 'linear-gradient(90deg,#fff 50%,oklch(0.82 0.17 150) 50%)' : 'linear-gradient(90deg,#26221E 50%,oklch(0.68 0.16 155) 50%)';
    return <span aria-hidden="true" className="rounded-full shrink-0 inline-block" style={{ width: size, height: size, background: bg }} />;
}

export function Logo({ size = 22, word = 19, onBand = false }: { size?: number; word?: number; onBand?: boolean }) {
    return (
        <span className="inline-flex items-center gap-[9px]">
            <LogoMark size={size} onBand={onBand} />
            <span className="font-black tracking-[-0.02em]" style={{ fontSize: word }}>splitpot</span>
        </span>
    );
}

export function Avatar({ name, tone, size = 30, ring = false, className = '' }: { name: string; tone: Tone; size?: number; ring?: boolean; className?: string }) {
    return (
        <span
            aria-hidden="true"
            className={`grid place-items-center rounded-full font-black shrink-0 select-none ${ring ? 'border-2 border-white' : ''} ${className}`}
            style={{ width: size, height: size, background: tone.bg, color: tone.fg, fontSize: Math.max(11, Math.round(size * 0.4)) }}
        >
            {initialOf(name)}
        </span>
    );
}

export function AvatarStack({ people, size = 30 }: { people: { name: string; tone: Tone }[]; size?: number }) {
    return (
        <span className="flex pl-2 shrink-0">
            {people.map((p, i) => <Avatar key={i} name={p.name} tone={p.tone} size={size} ring className="-ml-2" />)}
        </span>
    );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'text' | 'danger' | 'white' | 'band';
const VARIANTS: Record<Variant, string> = {
    primary: 'bg-ink text-white hover:bg-ink-hover disabled:opacity-35 disabled:hover:bg-ink',
    secondary: 'bg-soft text-ink hover:bg-[#EFEAE3] disabled:opacity-40',
    ghost: 'bg-transparent text-ink hover:bg-soft disabled:opacity-40',
    text: 'bg-transparent text-body underline underline-offset-[3px] hover:text-ink',
    danger: 'bg-transparent text-coral hover:opacity-80',
    white: 'bg-white text-ink hover:bg-wash disabled:opacity-40',
    band: 'bg-band text-white hover:bg-band-btn disabled:opacity-40',
};

export function Button({
    variant = 'primary', height = 40, wide = false, className = '', children, ...rest
}: { variant?: Variant; height?: number; wide?: boolean } & Omit<React.ComponentProps<typeof motion.button>, 'ref'>) {
    return (
        <motion.button
            type="button"
            {...(wide ? tapFlat : tap)}
            {...rest}
            className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-extrabold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${wide ? 'w-full' : ''} ${className}`}
            style={{ height }}
        >
            {children as React.ReactNode}
        </motion.button>
    );
}

export const inputCls = 'w-full h-[46px] px-4 border-[1.5px] border-line rounded-full bg-field text-[15px] font-bold text-ink';
export const labelCls = 'text-[14px] font-extrabold text-body';
/** Small inline number boxes (tax, tip, amounts). */
export const cellCls = 'h-9 px-2.5 border-[1.5px] border-line rounded-xl bg-field text-right text-[15px] font-extrabold text-ink';
/** A pill select. */
export const selectPillCls = 'h-[38px] px-3 border-[1.5px] border-line rounded-full bg-white text-[14.5px] font-extrabold text-ink';

/** White soft card: radius 24, light border, soft shadow. */
export function Card({ className = '', children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
    return <div {...rest} className={`bg-white border border-edge rounded-[24px] shadow-card ${className}`}>{children}</div>;
}

/** Inline status/error message: a pill with a filled icon. */
export function Notice({ tone, children }: { tone: 'error' | 'ok'; children: React.ReactNode }) {
    return (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-[22px] text-[13.5px] font-extrabold ${tone === 'error' ? 'bg-coral-tint text-coral-on' : 'bg-green-tint text-green-on'}`}>
            <Icon name={tone === 'error' ? 'error' : 'check_circle'} fill size={18} className="shrink-0" />
            <span>{children}</span>
        </div>
    );
}

/** Shown on a new expense/receipt: nothing exists for the group until Save is pressed. */
export function DraftBar({ what, canSave, problem, saving, onSave, onDiscard }: { what: string; canSave: boolean; problem?: string | null; saving: boolean; onSave: () => void; onDiscard: () => void }) {
    return (
        <div role="region" aria-label="Unsaved draft" className="flex flex-wrap items-center gap-3 py-3 pl-[18px] pr-3 rounded-[22px] bg-warm">
            <Icon name="edit_note" size={22} className="text-[#8A6D2B]" />
            <div className="flex-[1_1_220px] flex flex-col gap-px">
                <span className="text-[15px] font-black">New {what}, not saved yet</span>
                <span className={`text-[13.5px] font-semibold ${problem ? 'text-coral' : 'text-[#6E655C]'}`}>{problem || 'Nobody in the group sees it, and it won\'t count toward balances, until you save.'}</span>
            </div>
            <div className="flex gap-2">
                <Button variant="white" height={40} onClick={onDiscard} disabled={saving}>Discard</Button>
                <Button height={40} onClick={onSave} disabled={!canSave || saving}>{saving ? 'Saving…' : `Save ${what}`}</Button>
            </div>
        </div>
    );
}

/** Shown while an existing record has edits that are not saved yet. Nothing is written until Save; Cancel puts it back. */
export function ChangesBar({ canSave, problem, saving, onSave, onCancel }: { canSave: boolean; problem?: string | null; saving: boolean; onSave: () => void; onCancel: () => void }) {
    return (
        <div role="region" aria-label="Unsaved changes" className="flex flex-wrap items-center gap-3 py-3 pl-[18px] pr-3 rounded-[22px] bg-warm">
            <Icon name="edit_note" size={22} className="text-[#8A6D2B]" />
            <div className="flex-[1_1_220px] flex flex-col gap-px">
                <span className="text-[15px] font-black">Unsaved changes</span>
                <span className={`text-[13.5px] font-semibold ${problem ? 'text-coral' : 'text-[#6E655C]'}`}>{problem || 'Nobody else sees them until you save.'}</span>
            </div>
            <div className="flex gap-2">
                <Button variant="white" height={40} onClick={onCancel} disabled={saving}>Cancel</Button>
                <Button height={40} onClick={onSave} disabled={!canSave || saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
            </div>
        </div>
    );
}

/** How one total is shared out (older expenses saved as equal/percent open as amounts). */
export function SplitByTabs({ value, onChange, disabled = false }: { value: SplitMethod; onChange: (v: SplitMethod) => void; disabled?: boolean }) {
    return (
        <div className={disabled ? 'opacity-60 pointer-events-none' : ''} aria-busy={disabled}>
            <SegmentedTabs id="split-by" compact value={value} onChange={onChange} tabs={METHODS.map(m => ({ value: m.value, label: m.label }))} />
        </div>
    );
}
