import type { GroupState } from './state';
import type { GroupActions } from './actions';
import { motion, AnimatePresence, spring, tapFlat } from '../../lib/motion';
import { Button, Icon } from '../ui';

export default function AddMenu({ s, a }: { s: GroupState; a: GroupActions }) {
    const { addOpen, setAddOpen, addRef, addReceipt, addExpense, openPayback } = { ...s, ...a };
    return (
    <div className="relative" ref={addRef}>
        <Button height={46} className="pl-4 pr-5 text-[15px]" aria-expanded={addOpen} aria-haspopup="menu" onClick={() => setAddOpen(o => !o)}>
            <Icon name="add" size={21} />Add expense
        </Button>
        <AnimatePresence>
            {addOpen && (
                <motion.div
                    role="menu"
                    className="absolute left-0 sm:left-auto sm:right-0 top-[54px] z-10 w-[300px] max-w-[calc(100vw-32px)] bg-white border border-edge rounded-[22px] shadow-popover p-2 flex flex-col gap-0.5 origin-top-left sm:origin-top-right"
                    initial={{ opacity: 0.8, scale: 0.94, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: -4 }} transition={spring}
                >
                    {[
                        { icon: 'payments', hue: 250, title: 'Add an expense', desc: 'Rent, bills, one total split by amounts or shares', go: addExpense },
                        { icon: 'checklist', hue: 75, title: 'Split by item', desc: 'Type the items in, or import them from a receipt, then tap who had what', go: addReceipt },
                        { icon: 'swap_horiz', hue: 330, title: 'Record a transfer', desc: 'Someone paid someone back, or you did', go: openPayback },
                    ].map(o => (
                        <motion.button key={o.title} role="menuitem" {...tapFlat} onClick={o.go} className="flex items-center gap-3 p-2.5 rounded-2xl bg-white text-left text-ink hover:bg-wash transition-colors">
                            <span className="w-10 h-10 rounded-full grid place-items-center shrink-0" style={{ background: `oklch(0.95 0.05 ${o.hue})`, color: `oklch(0.45 0.13 ${o.hue})` }}><Icon name={o.icon} size={21} /></span>
                            <span className="flex flex-col gap-px"><span className="text-[15px] font-extrabold">{o.title}</span><span className="text-[13px] font-semibold text-muted leading-[1.35]">{o.desc}</span></span>
                        </motion.button>
                    ))}
                </motion.div>
            )}
        </AnimatePresence>
    </div>
    );
}
