import { useEffect, useState } from 'react';
import { motion, AnimatePresence, spring } from '../lib/motion';
import { Icon } from './ui';

// A tiny global toast: call `toast('Saved')` from anywhere; one <Toaster /> per page shows it for 2.4s.
type Tone = 'ok' | 'error';
type Listener = (msg: { text: string; tone: Tone } | null) => void;
let listener: Listener | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function show(text: string, tone: Tone, ms: number) {
    listener?.({ text, tone });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => listener?.(null), ms);
}

export const toast = (message: string) => show(message, 'ok', 2400);
/** Something the person asked for did not happen. Stays a little longer so it can be read. */
export const toastError = (message: string) => show(message, 'error', 5000);

/** An ink pill at the bottom center with a mint check, after a save, join, invite or settle. */
export function Toaster() {
    const [message, setMessage] = useState<{ text: string; tone: Tone } | null>(null);
    useEffect(() => {
        listener = setMessage;
        return () => { if (listener === setMessage) listener = null; if (timer) clearTimeout(timer); };
    }, []);
    return (
        // Always on the page, so screen readers pick up what is put into it ("Changes saved", "Link copied").
        <div role="status" aria-live={message?.tone === 'error' ? 'assertive' : 'polite'} className="fixed inset-x-0 bottom-6 z-[120] flex justify-center pointer-events-none">
            <AnimatePresence>
                {message && (
                    <motion.div
                        key={message.text}
                        initial={{ opacity: 0.8, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={spring}
                        className={`flex items-center gap-2 px-[18px] py-3 rounded-full text-white text-[14.5px] font-extrabold shadow-toast ${message.tone === 'error' ? 'bg-coral-strong' : 'bg-ink'}`}
                    >
                        <Icon name={message.tone === 'error' ? 'error' : 'check_circle'} fill size={19} className={message.tone === 'error' ? 'text-white' : 'text-green-mint'} />
                        {message.text}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
