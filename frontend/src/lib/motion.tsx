import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, MotionConfig, MotionGlobalConfig, animate, useMotionValue, useTransform } from 'framer-motion';

export { motion, AnimatePresence, MotionConfig };

// Browsers pause animation frames in hidden/occluded tabs. Framer would then never finish an entrance,
// leaving content stuck at its starting opacity. While hidden, jump straight to the end state instead.
if (typeof document !== 'undefined') {
    const sync = () => { MotionGlobalConfig.skipAnimations = document.visibilityState === 'hidden'; };
    sync();
    document.addEventListener('visibilitychange', sync);
}

/**
 * Entrances start at partial opacity, never 0: if an animation is ever delayed or throttled the content
 * is still readable and clickable rather than invisible. Fades multiply as animated elements nest, so
 * only a page's outermost wrapper fades noticeably; tab content slides without fading.
 */
export const FROM = 0.8;

export const spring = { type: 'spring', stiffness: 460, damping: 32 } as const;
const gentle = { type: 'spring', stiffness: 380, damping: 30 } as const;

/** Press/hover feedback. Wide controls get subtler scaling so they never overflow their container. */
export const tap = { whileHover: { scale: 1.04 }, whileTap: { scale: 0.93 }, transition: spring } as const;
export const tapFlat = { whileTap: { scale: 0.97 }, transition: spring } as const;
export const tapRow = { whileHover: { scale: 1.012 }, whileTap: { scale: 0.985 }, transition: spring } as const;

export const fade = { initial: { opacity: FROM }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.18 } } as const;
export const fadeUp = {
    initial: { opacity: FROM, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
    transition: { duration: 0.2 },
} as const;

/** Staggered entrance for list rows; index is capped so long lists don't take forever to settle. */
export const listItem = (i = 0) => ({
    layout: true as const,
    initial: { opacity: FROM, y: 14 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } },
    transition: { ...gentle, delay: Math.min(i, 8) * 0.035 },
});

/** Entrance-only stagger (no layout animation) for rows that resize themselves, like accordions. */
export const enter = (i = 0) => ({
    initial: { opacity: FROM, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { ...gentle, delay: Math.min(i, 8) * 0.035 },
});

export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    // Portal to <body>: dialogs must not inherit a page's mid-animation opacity/transform (fades multiply,
    // and `fixed` positioning is relative to any transformed ancestor).
    if (typeof document === 'undefined') return null;
    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    key="backdrop"
                    className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
                    {...fade}
                    onClick={onClose}
                >
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        className="bg-white rounded-[24px] border border-edge p-6 w-full max-w-sm shadow-popover"
                        initial={{ opacity: FROM, scale: 0.92, y: 14 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        transition={spring}
                        onClick={e => e.stopPropagation()}
                    >
                        {children}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}

/** Height-animated disclosure. */
export function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
    return (
        <AnimatePresence initial={false}>
            {open && (
                <motion.div
                    initial={{ height: 0, opacity: FROM }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                    style={{ overflow: 'hidden' }}
                >
                    {children}
                </motion.div>
            )}
        </AnimatePresence>
    );
}

/** Fades/scales a message in and out as `show` changes (banners, toasts). */
export function Pop({ show, className, children }: { show: boolean; className?: string; children: React.ReactNode }) {
    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    className={className}
                    initial={{ opacity: FROM, scale: 0.96, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                >
                    {children}
                </motion.div>
            )}
        </AnimatePresence>
    );
}

/** Counts smoothly from the previous value to the next. */
export function AnimatedNumber({ value, prefix = '', decimals = 2, className }: { value: number; prefix?: string; decimals?: number; className?: string }) {
    const mv = useMotionValue(value);
    const text = useTransform(mv, v => `${prefix}${v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`);
    useEffect(() => {
        const controls = animate(mv, value, { duration: 0.5, ease: 'easeOut' });
        return () => controls.stop();
    }, [value, mv]);
    return <motion.span className={className}>{text}</motion.span>;
}

/** Segmented control (soft pill track, white active pill) whose highlight slides between options. */
export function SegmentedTabs<T extends string>({
    id, tabs, value, onChange, compact = false, className = '',
}: {
    id: string;
    tabs: { value: T; label: string }[];
    value: T;
    onChange: (v: T) => void;
    /** kept for API compatibility with earlier callers */
    size?: 'md' | 'sm';
    /** Smaller labels, for controls with many options. */
    compact?: boolean;
    className?: string;
}) {
    return (
        <div role="tablist" className={`grid p-1 bg-soft rounded-full ${className}`} style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
            {tabs.map(t => {
                const active = value === t.value;
                return (
                    <motion.button
                        key={t.value}
                        role="tab"
                        type="button"
                        aria-selected={active}
                        onClick={() => onChange(t.value)}
                        {...tapFlat}
                        className={`relative rounded-full font-extrabold text-ink ${compact ? 'h-[34px] text-[13.5px]' : 'h-10 text-[14.5px]'}`}
                    >
                        {active && <motion.span layoutId={`${id}-pill`} className="absolute inset-0 bg-white rounded-full shadow-seg" transition={spring} />}
                        <span className="relative">{t.label}</span>
                    </motion.button>
                );
            })}
        </div>
    );
}

/** Group tabs: filled pills (active ink on white text, inactive soft), with an optional count at 70% opacity. */
export function UnderlineTabs<T extends string>({
    id, tabs, value, onChange,
}: {
    id: string;
    tabs: { value: T; label: string; count?: number }[];
    value: T;
    onChange: (v: T) => void;
}) {
    return (
        <div role="tablist" className="flex flex-wrap gap-1.5">
            {tabs.map(t => {
                const active = value === t.value;
                return (
                    <button
                        key={t.value}
                        role="tab"
                        type="button"
                        aria-selected={active}
                        onClick={() => onChange(t.value)}
                        className={`relative h-10 px-[18px] rounded-full text-[14.5px] font-extrabold flex items-center gap-1.5 transition-colors ${active ? 'bg-ink text-white' : 'bg-soft text-body hover:bg-[#EFEAE3]'}`}
                    >
                        {active && <motion.span layoutId={`${id}-pill`} className="absolute inset-0 rounded-full bg-ink" transition={spring} />}
                        <span className="relative">{t.label}</span>
                        {t.count !== undefined && <span className="relative text-[12.5px] opacity-70">{t.count}</span>}
                    </button>
                );
            })}
        </div>
    );
}
