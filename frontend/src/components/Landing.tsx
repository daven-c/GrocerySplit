import React, { useState } from 'react';
import { motion, FROM, enter, tapFlat, spring } from '../lib/motion';
import { Icon, Logo } from './ui';
import { toneFor } from '../lib/people';
import { useQuickSplitStart } from './QuickSplitStart';
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
    { icon: 'photo_camera', title: 'Read the receipt', body: 'Copy our prompt into any AI chat with a photo of the receipt. Paste back what it returns and every line item appears.', bg: 'oklch(0.965 0.03 158)', fg: 'oklch(0.42 0.11 158)' },
    { icon: 'touch_app', title: 'Tap who had what', body: 'Pick a person and tap their items, or split one item between a few people. Shared staples take one tap.', bg: 'oklch(0.97 0.03 250)', fg: 'oklch(0.45 0.13 250)' },
    { icon: 'handshake', title: 'Settle up', body: 'Splitpot tracks who paid and who owes, across every group. Mark payments as you make them.', bg: 'oklch(0.97 0.03 40)', fg: 'oklch(0.5 0.15 35)' },
];
const POINTS = [
    { title: 'Exact, every time', body: 'All the math runs in whole cents. Tax and tip are shared by what each person bought, and the totals always match the receipt.' },
    { title: 'Rent and bills too', body: 'Not everything has items. Split one total by amounts, or by shares for the bigger room.' },
    { title: 'Groups for everything', body: 'A household, a weekend away, a book club. Invite people by username and everyone sees the same expenses.' },
    { title: 'Quick splits, no account', body: 'One dinner, one link. Friends open it, add their name and tap what they had.' },
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
    const quickStart = useQuickSplitStart();
    const quick = quickStart.ask;
    return (
        <div className="bg-white text-ink font-sans">
            {quickStart.dialog}
            <div className="bg-band text-white">
                <header className="max-w-[1160px] mx-auto px-6 py-[18px] flex items-center gap-2">
                    <Logo size={24} word={21} onBand />
                    <nav className="ml-auto flex items-center gap-1.5">
                        <a href="#how" className="h-10 px-3.5 flex items-center text-[15px] font-extrabold text-[oklch(0.88_0.05_155)] hover:text-white">How it works</a>
                        <motion.button {...tapFlat} onClick={onSignIn} className="h-10 px-3.5 text-[15px] font-extrabold text-[oklch(0.88_0.05_155)] hover:text-white">Sign in</motion.button>
                        <motion.button {...tapFlat} onClick={onGetStarted} className="h-[42px] px-5 rounded-full bg-white text-band-deep text-[15px] font-black">Get started</motion.button>
                    </nav>
                </header>

                <section className="max-w-[1160px] mx-auto px-6 pt-14 flex flex-wrap gap-12 items-end">
                    <div className="flex-[1_1_440px] flex flex-col gap-6 pb-20">
                        <motion.h1 {...enter(0)} className="m-0 font-black leading-[1.02] tracking-tightest text-[clamp(42px,6vw,70px)]" style={{ textWrap: 'balance' } as React.CSSProperties}>
                            Split the groceries down to the penny.
                        </motion.h1>
                        <motion.p {...enter(1)} className="m-0 text-[19px] leading-normal font-semibold text-[oklch(0.88_0.05_155)] max-w-[480px]" style={{ textWrap: 'pretty' } as React.CSSProperties}>
                            Snap the receipt, tap who had what, and Splitpot works out everyone's share with tax and tip included. Rent and bills too, and balances carry across every group you're in.
                        </motion.p>
                        <motion.div {...enter(2)} className="flex flex-wrap gap-2.5 items-center">
                            <motion.button {...tapFlat} onClick={onGetStarted} className="h-[52px] px-6 rounded-full bg-white text-band-deep text-base font-black">Start a group, free</motion.button>
                            {isEnabled('quickSplit') && (
                                <motion.button {...tapFlat} disabled={quickStart.starting} onClick={quick} className="h-[52px] px-[22px] rounded-full bg-band-btn text-white text-base font-extrabold flex items-center gap-1.5 hover:bg-band-btn-hover disabled:opacity-60">
                                    <Icon name="bolt" size={20} />Quick split, no account
                                </motion.button>
                            )}
                        </motion.div>
                    </div>

                    <div className="flex-[1_1_380px] flex justify-center -mb-[120px]">
                        <motion.div {...enter(2)} className="w-full max-w-[420px] bg-white text-ink rounded-[28px] shadow-landing overflow-hidden">
                            <div className="px-[22px] py-5 flex justify-between items-center">
                                <span className="flex items-center gap-3">
                                    <span className="w-[42px] h-[42px] rounded-full grid place-items-center bg-[oklch(0.95_0.05_155)] text-[oklch(0.45_0.13_155)]"><Icon name="shopping_basket" size={21} /></span>
                                    <span className="flex flex-col"><span className="text-[17px] font-black">Corner Market</span><span className="text-[13px] font-bold text-faint">Maple St. House · Oct 3</span></span>
                                </span>
                                <span className="text-[22px] font-black tracking-[-0.02em]">$96.27</span>
                            </div>
                            {ROWS.map(r => (
                                <div key={r.name} className="px-[22px] py-3.5 flex flex-col gap-2.5 border-t border-rule">
                                    <div className="flex justify-between"><span className="text-[15.5px] font-extrabold">{r.name}</span><span className="text-[15px] font-extrabold">{r.price}</span></div>
                                    <div className="flex gap-1.5 items-center">
                                        {'SPJL'.split('').map(c => {
                                            const on = r.who.includes(c);
                                            const t = toneFor(H[c]);
                                            return (
                                                <span key={c} className="w-8 h-8 rounded-full grid place-items-center text-[13px] font-black" style={{ background: on ? t.bg : '#fff', color: on ? t.fg : '#C2B8AC', border: `1.5px ${on ? 'solid' : 'dashed'} ${on ? t.bg : '#E3DBD0'}` }}>{c}</span>
                                            );
                                        })}
                                        <span className="ml-auto text-[13px] font-bold text-faint">{r.note}</span>
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    </div>
                </section>
            </div>

            <section id="how" className="max-w-[1160px] mx-auto px-6 pt-[180px] pb-24 flex flex-col gap-11">
                <motion.h2 {...reveal()} className="m-0 font-black leading-[1.08] tracking-[-0.035em] max-w-[640px] text-[clamp(30px,4vw,46px)]" style={{ textWrap: 'balance' } as React.CSSProperties}>
                    Three steps from crumpled receipt to settled up.
                </motion.h2>
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
                    {STEPS.map((st, i) => (
                        <motion.div key={st.title} {...reveal(i)} className="flex flex-col gap-3.5 p-[26px] rounded-[28px]" style={{ background: st.bg }}>
                            <span className="w-12 h-12 rounded-full bg-white grid place-items-center" style={{ color: st.fg }}><Icon name={st.icon} size={24} /></span>
                            <span className="text-[21px] font-black tracking-[-0.02em]">{st.title}</span>
                            <span className="text-base leading-[1.55] font-semibold text-body">{st.body}</span>
                        </motion.div>
                    ))}
                </div>
            </section>

            <section className="max-w-[1160px] mx-auto px-6 pb-24 grid gap-10" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
                {POINTS.map((p, i) => (
                    <motion.div key={p.title} {...reveal(i)} className="flex flex-col gap-2">
                        <span className="text-lg font-black">{p.title}</span>
                        <span className="text-[15.5px] leading-[1.55] font-semibold text-[#6E655C]">{p.body}</span>
                    </motion.div>
                ))}
            </section>

            <section className="max-w-[1160px] mx-auto px-6 pb-24">
                <motion.div {...reveal()} className="bg-warm rounded-[32px] px-11 py-14 flex flex-wrap gap-6 items-center justify-between">
                    <h2 className="m-0 font-black leading-[1.1] tracking-[-0.03em] max-w-[560px] text-[clamp(28px,3.4vw,40px)]">Your next shop is the easy one.</h2>
                    <motion.button {...tapFlat} onClick={onGetStarted} className="h-[52px] px-6 rounded-full bg-ink text-white text-base font-black hover:bg-ink-hover">Create your first group</motion.button>
                </motion.div>
            </section>

            <footer className="max-w-[1160px] mx-auto px-6 pt-7 pb-10 border-t border-rule flex flex-wrap gap-4 justify-between text-sm font-bold text-faint">
                <span>Splitpot · costsplit.davenc.dev</span>
                <span>Made for households, trips and anyone who shares a fridge.</span>
            </footer>
        </div>
    );
}
