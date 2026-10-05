import React, { useEffect } from 'react';
import { motion, AnimatePresence, MotionConfig, animate, useMotionValue, useTransform } from 'framer-motion';

export { motion, AnimatePresence, MotionConfig };

export const spring = { type: 'spring', stiffness: 460, damping: 32 } as const;
const gentle = { type: 'spring', stiffness: 380, damping: 30 } as const;

/** Press/hover feedback. Wide controls get subtler scaling so they never overflow their container. */
export const tap = { whileHover: { scale: 1.04 }, whileTap: { scale: 0.93 }, transition: spring } as const;
export const tapFlat = { whileTap: { scale: 0.97 }, transition: spring } as const;
export const tapRow = { whileHover: { scale: 1.012 }, whileTap: { scale: 0.985 }, transition: spring } as const;

export const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.18 } } as const;
export const fadeUp = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
    transition: { duration: 0.2 },
} as const;

/** Staggered entrance for list rows; index is capped so long lists don't take forever to settle. */
export const listItem = (i = 0) => ({
    layout: true as const,
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } },
    transition: { ...gentle, delay: Math.min(i, 8) * 0.035 },
});

/** Entrance-only stagger (no layout animation) for rows that resize themselves, like accordions. */
export const enter = (i = 0) => ({
    initial: { opacity: 0, y: 14 },
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

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="backdrop"
                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
                    {...fade}
                    onClick={onClose}
                >
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
                        initial={{ opacity: 0, scale: 0.92, y: 14 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        transition={spring}
                        onClick={e => e.stopPropagation()}
                    >
                        {children}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

/** Height-animated disclosure. */
export function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
    return (
        <AnimatePresence initial={false}>
            {open && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
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
                    initial={{ opacity: 0, scale: 0.96, y: -4 }}
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
    const text = useTransform(mv, v => `${prefix}${v.toFixed(decimals)}`);
    useEffect(() => {
        const controls = animate(mv, value, { duration: 0.5, ease: 'easeOut' });
        return () => controls.stop();
    }, [value, mv]);
    return <motion.span className={className}>{text}</motion.span>;
}

/** Segmented control whose highlight slides between options. */
export function SegmentedTabs<T extends string>({
    id, tabs, value, onChange, size = 'md', className = '',
}: {
    id: string;
    tabs: { value: T; label: string }[];
    value: T;
    onChange: (v: T) => void;
    size?: 'md' | 'sm';
    className?: string;
}) {
    return (
        <div role="tablist" className={`flex bg-slate-200 p-1 shadow-inner ${size === 'sm' ? 'rounded-lg' : 'rounded-xl'} ${className}`}>
            {tabs.map(t => {
                const active = value === t.value;
                return (
                    <motion.button
                        key={t.value}
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(t.value)}
                        {...tapFlat}
                        className={`relative flex-1 font-bold transition-colors ${size === 'sm' ? 'py-2 text-xs rounded-md' : 'py-2.5 text-sm rounded-lg'} ${active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        {active && <motion.span layoutId={`${id}-pill`} className={`absolute inset-0 bg-white shadow-sm ${size === 'sm' ? 'rounded-md' : 'rounded-lg'}`} transition={spring} />}
                        <span className="relative">{t.label}</span>
                    </motion.button>
                );
            })}
        </div>
    );
}
