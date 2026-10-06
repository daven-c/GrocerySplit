import React, { useState } from 'react';
import { motion, FROM, enter, tapFlat, spring } from '../lib/motion';
import { Icon, Logo } from './ui';
import { toneFor } from '../lib/people';
import { startQuickSplit } from '../lib/quickSplit';
import { isEnabled } from '../lib/flags';

interface LandingProps {
    onSignIn: () => void;
    onGetStarted: () => void;
}

const H: Record<string, number> = { S: 250, P: 30, J: 155, L: 75 };
const ROWS = [
    { name: 'Oat milk', price: '$4.99', who: 'SP', note: '$2.50 each' },
    { name: 'Avocados (4)', price: '$5.00', who: 'J', note: 'Just Jonah' },
    { name: 'Olive oil, 1L', price: '$14.99', who: 'SPJL', note: '$3.75 each' },
    { name: 'Cold brew concentrate', price: '$9.99', who: 'L', note: 'Just Leo' },
];
const STEPS = [
    { n: '01', title: 'Add the cost', body: 'Import a grocery receipt with any AI chat, or enter any bill by hand: rent, utilities, dinner, a trip.' },
    { n: '02', title: 'Say who shares it', body: 'Tap who had what on a receipt, or pick who is in on a bill and split it by amount or shares.' },
    { n: '03', title: 'Settle up', body: 'Splitpot tracks who paid and who owes, across every group. Mark payments as you make them.' },
];
const POINTS = [
    { title: 'Exact, every time', body: 'All the math runs in whole cents. Tax and tip are shared by what each person bought, and the totals always match.' },
    { title: 'Groups for everything', body: 'A household, a weekend away, a book club. Invite people by email and everyone sees the same expenses.' },
    { title: 'One balance per friend', body: 'See what you owe each person across all the groups you share, in one place.' },
];

/** Sections fade up as they scroll in; they start at 0.8 opacity so they are never invisible. */
const reveal = (i = 0) => {
    const base = { initial: { opacity: FROM, y: 18 }, transition: { ...spring, delay: i * 0.06 } };
    // Without IntersectionObserver (very old browsers, test environments) just animate on mount.
    return typeof IntersectionObserver === 'undefined'
        ? { ...base, animate: { opacity: 1, y: 0 } }
        : { ...base, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-60px' } };
};

export default function Landing({ onSignIn, onGetStarted }: LandingProps) {
    const [starting, setStarting] = useState(false);
    const quick = () => { setStarting(true); startQuickSplit().catch(() => setStarting(false)); };
    return (
        <div className="bg-white text-ink font-sans">
            <header className="max-w-[1160px] mx-auto px-6 py-[22px] flex items-center gap-6">
                <Logo size={22} word={19} />
                <nav className="ml-auto flex items-center gap-2">
                    <a href="#how" className="px-3 py-2 text-sm font-medium text-body hover:text-green">How it works</a>
                    <motion.button {...tapFlat} onClick={onSignIn} className="px-3 py-2 text-sm font-medium text-body hover:text-green">Sign in</motion.button>
                    <motion.button {...tapFlat} onClick={onGetStarted} className="h-[38px] px-4 rounded-[10px] bg-ink text-white text-sm font-semibold hover:bg-ink-hover">Get started</motion.button>
                </nav>
            </header>

            <section className="max-w-[1160px] mx-auto px-6 pt-[72px] pb-24 flex flex-wrap gap-14 items-center">
                <div className="flex-[1_1_440px] flex flex-col gap-6">
                    <motion.h1 {...enter(0)} className="m-0 font-semibold leading-[1.02] tracking-tightest text-[clamp(40px,6vw,68px)]" style={{ textWrap: 'balance' } as React.CSSProperties}>
                        Split any cost, down to the penny.
                    </motion.h1>
                    <motion.p {...enter(1)} className="m-0 text-[19px] leading-normal text-body max-w-[500px]" style={{ textWrap: 'pretty' } as React.CSSProperties}>
                        Groceries, rent, bills and trips. Add what was spent, say who shares it, and Splitpot works out who owes whom, tax and tip included. Balances carry across every group you're in.
                    </motion.p>
                    <motion.div {...enter(2)} className="flex flex-wrap gap-3 items-center">
                        <motion.button {...tapFlat} onClick={onGetStarted} className="h-12 px-[22px] rounded-xl bg-ink text-white text-base font-semibold hover:bg-ink-hover">Start a group, free</motion.button>
                        {isEnabled('quickSplit') && <motion.button {...tapFlat} disabled={starting} onClick={quick} className="h-12 px-[18px] rounded-xl border border-line text-base font-semibold text-ink hover:bg-wash disabled:opacity-60">Split one bill, no account</motion.button>}
                        <a href="#how" className="h-12 px-[18px] flex items-center text-base font-semibold text-ink hover:text-green">See how it works</a>
                    </motion.div>
                </div>

                <div className="flex-[1_1_380px] flex justify-center">
                    <motion.div {...enter(2)} className="w-full max-w-[420px] relative">
                        <div className="bg-white border border-edge rounded-[18px] shadow-landing overflow-hidden">
                            <div className="px-5 py-[18px] flex justify-between items-baseline border-b border-rule">
                                <div className="flex flex-col gap-0.5"><span className="text-[17px] font-semibold">Corner Market</span><span className="text-[13px] text-faint">Maple St. House · Oct 3</span></div>
                                <span className="text-[22px] font-semibold tracking-[-0.02em]">$96.27</span>
                            </div>
                            {ROWS.map((r, i) => (
                                <div key={r.name} className={`px-5 py-3.5 flex flex-col gap-2.5 ${i ? 'border-t border-rule' : ''}`}>
                                    <div className="flex justify-between"><span className="text-[15px] font-medium">{r.name}</span><span className="font-mono text-sm">{r.price}</span></div>
                                    <div className="flex gap-1.5 items-center">
                                        {'SPJL'.split('').map(c => {
                                            const on = r.who.includes(c);
                                            const t = toneFor(H[c]);
                                            return (
                                                <span key={c} className="w-7 h-7 rounded-full grid place-items-center text-xs font-semibold" style={{ background: on ? t.bg : 'transparent', color: on ? t.fg : '#B3AFA6', border: `1px ${on ? 'solid' : 'dashed'} ${on ? t.bg : '#CFCBC2'}` }}>{c}</span>
                                            );
                                        })}
                                        <span className="ml-auto text-xs text-faint">{r.note}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <motion.div {...enter(4)} className="hidden min-[520px]:flex absolute -bottom-[62px] -left-8 bg-white border border-edge rounded-[14px] shadow-popover px-4 py-3 items-center gap-3">
                            <span className="w-9 h-9 rounded-full grid place-items-center bg-green-tint text-green-on"><Icon name="home" size={20} /></span>
                            <div className="flex flex-col"><span className="text-sm font-semibold">Rent · Oct 1</span><span className="text-xs text-faint">$2,400.00 · split 4 ways</span></div>
                        </motion.div>
                    </motion.div>
                </div>
            </section>

            <section id="how" className="bg-ink text-white">
                <div className="max-w-[1160px] mx-auto px-6 py-24 flex flex-col gap-14">
                    <motion.h2 {...reveal()} className="m-0 font-semibold leading-[1.1] tracking-[-0.03em] max-w-[620px] text-[clamp(30px,4vw,44px)]" style={{ textWrap: 'balance' } as React.CSSProperties}>
                        Three steps from crumpled receipt to settled up.
                    </motion.h2>
                    <div className="grid gap-10" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
                        {STEPS.map((s, i) => (
                            <motion.div key={s.n} {...reveal(i)} className="flex flex-col gap-3 border-t border-[#3A3833] pt-5">
                                <span className="font-mono text-[13px] text-green-mint">{s.n}</span>
                                <span className="text-xl font-semibold tracking-[-0.01em]">{s.title}</span>
                                <span className="text-[15px] leading-[1.55] text-[#BDB9B0]">{s.body}</span>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="max-w-[1160px] mx-auto px-6 py-24 grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
                {POINTS.map((p, i) => (
                    <motion.div key={p.title} {...reveal(i)} className="flex flex-col gap-2.5">
                        <span className="text-lg font-semibold tracking-[-0.01em]">{p.title}</span>
                        <span className="text-[15px] leading-[1.55] text-body">{p.body}</span>
                    </motion.div>
                ))}
            </section>

            <section className="max-w-[1160px] mx-auto px-6 pb-24">
                <motion.div {...reveal()} className="bg-green-band rounded-[20px] px-10 py-14 flex flex-wrap gap-6 items-center justify-between">
                    <h2 className="m-0 font-semibold leading-[1.1] tracking-[-0.03em] text-green-deep max-w-[560px] text-[clamp(26px,3.4vw,38px)]">Your next shared cost is the easy one.</h2>
                    <motion.button {...tapFlat} onClick={onGetStarted} className="h-12 px-[22px] rounded-xl bg-ink text-white text-base font-semibold hover:bg-ink-hover">Create your first group</motion.button>
                </motion.div>
            </section>

            <footer className="max-w-[1160px] mx-auto px-6 pt-7 pb-10 border-t border-edge flex flex-wrap gap-4 justify-between text-[13px] text-faint">
                <span>Splitpot · costsplit.davenc.dev</span>
                <span>Made for households, trips and anyone who shares a fridge or a lease.</span>
            </footer>
        </div>
    );
}
