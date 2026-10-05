import React from 'react';
import { motion, tap, tapFlat, SegmentedTabs } from '../lib/motion';
import { SPLIT_BY, SplitBy } from '../lib/expenses';
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

/** The splitpot mark: a circle, left half ink, right half green. */
export function LogoMark({ size = 22 }: { size?: number }) {
    return <span aria-hidden="true" className="rounded-full shrink-0 inline-block" style={{ width: size, height: size, background: 'linear-gradient(90deg,#1B1A17 50%,oklch(0.7 0.19 155) 50%)' }} />;
}

export function Logo({ size = 22, word = 19 }: { size?: number; word?: number }) {
    return (
        <span className="inline-flex items-center gap-2.5">
            <LogoMark size={size} />
            <span className="font-bold tracking-[-0.02em]" style={{ fontSize: word }}>splitpot</span>
        </span>
    );
}

export function Avatar({ name, tone, size = 30, ring = false, className = '' }: { name: string; tone: Tone; size?: number; ring?: boolean; className?: string }) {
    return (
        <span
            aria-hidden="true"
            className={`grid place-items-center rounded-full font-semibold shrink-0 select-none ${ring ? 'border-2 border-white' : ''} ${className}`}
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

type Variant = 'primary' | 'secondary' | 'ghost' | 'text' | 'danger';
const VARIANTS: Record<Variant, string> = {
    primary: 'bg-ink text-white hover:bg-ink-hover disabled:opacity-35 disabled:hover:bg-ink',
    secondary: 'bg-white text-ink border border-line hover:bg-surface disabled:opacity-40',
    ghost: 'bg-transparent text-ink hover:bg-track disabled:opacity-40',
    text: 'bg-transparent text-body underline underline-offset-[3px] hover:text-ink',
    danger: 'bg-transparent text-coral hover:opacity-80',
};

export function Button({
    variant = 'primary', height = 40, wide = false, className = '', children, ...rest
}: { variant?: Variant; height?: number; wide?: boolean } & Omit<React.ComponentProps<typeof motion.button>, 'ref'>) {
    return (
        <motion.button
            type="button"
            {...(wide ? tapFlat : tap)}
            {...rest}
            className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${wide ? 'w-full' : ''} ${className}`}
            style={{ height }}
        >
            {children as React.ReactNode}
        </motion.button>
    );
}

export const inputCls = 'w-full h-[42px] px-3 border border-line rounded-[10px] bg-white text-[15px] text-ink';
export const labelCls = 'text-[13px] font-medium text-body';

/** White bordered card. */
export function Card({ className = '', children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
    return <div {...rest} className={`bg-white border border-edge rounded-[14px] ${className}`}>{children}</div>;
}

/** Inline status/error message styles. */
export function Notice({ tone, children }: { tone: 'error' | 'ok'; children: React.ReactNode }) {
    return (
        <div className={`px-3 py-2.5 rounded-[10px] text-[13px] ${tone === 'error' ? 'bg-coral-tint text-coral-on' : 'bg-green-tint text-green-on'}`}>
            {children}
        </div>
    );
}

/** Shown on a new expense/receipt: nothing exists for the group until Save is pressed. */
export function DraftBar({ what, canSave, problem, saving, onSave, onDiscard }: { what: string; canSave: boolean; problem?: string | null; saving: boolean; onSave: () => void; onDiscard: () => void }) {
    return (
        <div role="region" aria-label="Unsaved draft" className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-[14px] bg-surface border border-edge">
            <Icon name="edit_note" size={20} className="text-body" />
            <div className="flex-[1_1_200px] flex flex-col gap-0.5">
                <span className="text-sm font-semibold">New {what}, not saved yet</span>
                <span className={`text-[13px] ${problem ? 'text-coral' : 'text-muted'}`}>{problem || 'Nobody in the group sees it, and it won\'t count toward balances, until you save.'}</span>
            </div>
            <div className="flex gap-2">
                <Button variant="secondary" height={38} onClick={onDiscard} disabled={saving}>Discard</Button>
                <Button height={38} onClick={onSave} disabled={!canSave || saving}>{saving ? 'Saving…' : `Save ${what}`}</Button>
            </div>
        </div>
    );
}

/** The one control for how an expense is split, shared by both bodies of the editor. */
export function SplitByTabs({ value, onChange, disabled = false }: { value: SplitBy; onChange: (v: SplitBy) => void; disabled?: boolean }) {
    return (
        <div className={disabled ? 'opacity-60 pointer-events-none' : ''} aria-busy={disabled}>
            <SegmentedTabs id="split-by" compact value={value} onChange={onChange} tabs={SPLIT_BY.map(m => ({ value: m.value, label: m.label }))} />
        </div>
    );
}
