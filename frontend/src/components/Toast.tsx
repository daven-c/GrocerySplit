import { useEffect, useState } from 'react';
import { motion, AnimatePresence, spring } from '../lib/motion';
import { Icon } from './ui';

// A tiny global toast: call `toast('Saved')` from anywhere; one <Toaster /> per page shows it for 2.4s.
type Listener = (msg: string | null) => void;
let listener: Listener | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function toast(message: string) {
    listener?.(message);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => listener?.(null), 2400);
}

/** An ink pill at the bottom center with a mint check, after a save, join, invite or settle. */
export function Toaster() {
    const [message, setMessage] = useState<string | null>(null);
    useEffect(() => {
        listener = setMessage;
        return () => { if (listener === setMessage) listener = null; if (timer) clearTimeout(timer); };
    }, []);
    return (
        // Always on the page, so screen readers pick up what is put into it ("Changes saved", "Link copied").
        <div role="status" aria-live="polite" className="fixed inset-x-0 bottom-6 z-[120] flex justify-center pointer-events-none">
            <AnimatePresence>
                {message && (
                    <motion.div
                        key={message}
                        initial={{ opacity: 0.8, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={spring}
                        className="flex items-center gap-2 px-[18px] py-3 rounded-full bg-ink text-white text-[14.5px] font-extrabold shadow-toast"
                    >
                        <Icon name="check_circle" fill size={19} className="text-green-mint" />
                        {message}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
