import React, { useEffect, useRef } from 'react';
import { motion, tapFlat } from '../lib/motion';
import { useAppData } from '../lib/appData';
import { useHomeTotals } from '../lib/totals';
import { firstName, fmt, greeting, HUES, toneFor } from '../lib/people';
import { startQuickSplit } from '../lib/quickSplit';
import { isEnabled } from '../lib/flags';
import { Icon, Logo } from './ui';
import { Toaster } from './Toast';

export type NavView = 'home' | 'friends' | 'personal' | 'account' | 'admin';
export type ShellView = 'home' | 'group' | 'import' | 'split' | 'expense' | 'friends' | 'account' | 'admin';

interface ShellProps {
    view: ShellView;
    narrow: boolean;
    user: { id: string; name: string; email?: string } | null;
    groupId: string | null;
    recordId: string | null;
    onNav: (v: NavView) => void;
    onOpenGroup: (id: string) => void;
    onNewGroup: () => void;
    onBack: () => void;
    children: React.ReactNode;
}

/** Home highlights for every group-ish screen (the Personal section highlights itself). */
const navFor = (view: ShellView, personal: boolean): NavView | null =>
    ['group', 'import', 'split', 'expense'].includes(view) ? (personal ? 'personal' : 'home') : view === 'account' ? null : (view as NavView);

export default function Shell({ view, narrow, user, groupId, recordId, onNav, onNewGroup, onBack, children }: ShellProps) {
    const { groups, sessions, invites, isAdmin, refresh } = useAppData();
    const totals = useHomeTotals();
    const inPersonal = !!groups.find(g => g.id === groupId)?.personal;
    const activeNav = navFor(view, inPersonal);
    const inGroup = ['group', 'import', 'split', 'expense'].includes(view);
    const isHome = view === 'home';

    // Scroll to the top on every view change.
    const pageKey = `${view}:${groupId ?? ''}:${recordId ?? ''}`;
    useEffect(() => { window.scrollTo?.(0, 0); }, [pageKey]);

    // Re-sync with the server on every screen change, so other people's changes (and anything saved on the
    // way out of an editor) show up without a reload. The provider already loads on mount, so skip the first.
    const first = useRef(true);
    useEffect(() => {
        if (first.current) { first.current = false; return; }
        void refresh();
    }, [pageKey, refresh]);

    const nav: { id: NavView; label: string; icon: string; badge?: number }[] = [
        { id: 'home', label: 'Home', icon: 'home', badge: invites.length || undefined },
        { id: 'friends', label: 'People', icon: 'group' },
        ...(isEnabled('personal') ? [{ id: 'personal' as NavView, label: 'Personal', icon: 'lock' }] : []),
        ...(isAdmin ? [{ id: 'admin' as NavView, label: 'Admin', icon: 'admin_panel_settings' }] : []),
    ];

    const groupName = groups.find(g => g.id === groupId)?.name ?? '';
    const recordName = sessions.find(s => s.id === recordId)?.name ?? '';
    const titles: Partial<Record<ShellView, string>> = { group: groupName, import: 'Scan a receipt', split: recordName || 'Receipt', expense: recordName || 'Expense', friends: 'People', account: 'Account', admin: 'Admin' };

    const meTone = toneFor(HUES[0]);
    const initial = (user?.name?.trim()[0] ?? '?').toUpperCase();
    const greet = user ? `${greeting()}, ${firstName(user.name)}.` : greeting();
    const net = totals.net;
    const overall = Math.abs(net) < 0.005 ? "Overall you're all square" : net > 0 ? "Overall you're up" : "Overall you're down";
    const startQuick = startQuickSplit;

    const avatarBtn = (size: number, border = false) => (
        <motion.button
            {...tapFlat}
            onClick={() => onNav('account')}
            aria-label="Account"
            className={`grid place-items-center rounded-full font-black p-0 shrink-0 ${border ? 'border-2 border-white/30' : ''}`}
            style={{ width: size, height: size, background: meTone.bg, color: meTone.fg, fontSize: Math.round(size * 0.4) }}
        >
            {initial}
        </motion.button>
    );

    const main = (
        <main className={`flex-1 min-w-0 ${narrow ? 'px-4 pb-8' : 'px-10 pb-16'} ${isHome ? (narrow ? '-mt-[50px]' : '-mt-16') : narrow ? 'pt-6' : 'pt-9'}`}>
            <motion.div key={pageKey} initial={{ opacity: 0.7, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                {children}
            </motion.div>
        </main>
    );

    if (narrow) {
        return (
            <div className="min-h-screen flex flex-col bg-white">
                {isHome ? (
                    <div className="bg-band text-white pt-5 px-[22px] pb-[74px] flex flex-col gap-[22px]">
                        <div className="flex items-center justify-between">
                            <Logo size={20} word={19} onBand />
                            <span className="flex gap-2 items-center">
                                {isEnabled('quickSplit') && (
                                    <motion.button {...tapFlat} onClick={startQuick} title="Quick split" aria-label="Quick split" className="w-9 h-9 rounded-full bg-band-btn text-white grid place-items-center"><Icon name="bolt" size={19} /></motion.button>
                                )}
                                {avatarBtn(36)}
                            </span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <h1 className="m-0 text-[14.5px] font-bold text-band-text">{greet} {overall}</h1>
                            <span className="text-[46px] font-black tracking-[-0.03em] leading-none">{fmt(net)}</span>
                        </div>
                    </div>
                ) : (
                    <header className="sticky top-0 z-[5] h-[58px] flex items-center gap-2 px-3 bg-white/95 backdrop-blur-[10px] border-b border-rule">
                        {inGroup && (
                            <motion.button {...tapFlat} onClick={onBack} aria-label="Back" className="w-[38px] h-[38px] rounded-full bg-soft text-ink grid place-items-center">
                                <Icon name="arrow_back" size={20} />
                            </motion.button>
                        )}
                        <span className="flex-1 min-w-0 truncate font-black text-[17px] pl-1.5">{titles[view]}</span>
                        {avatarBtn(36)}
                    </header>
                )}
                {main}
                <nav
                    aria-label="Primary"
                    className="sticky bottom-0 z-[5] grid bg-white/95 backdrop-blur-[10px] border-t border-rule px-2 pt-2 pb-[22px]"
                    style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
                >
                    {nav.map(n => {
                        const on = activeNav === n.id;
                        return (
                            <motion.button
                                key={n.id}
                                {...tapFlat}
                                onClick={() => onNav(n.id)}
                                aria-current={on ? 'page' : undefined}
                                className={`relative flex flex-col items-center gap-[3px] text-[11.5px] font-extrabold ${on ? 'text-[oklch(0.36_0.09_158)]' : 'text-[#A39A90]'}`}
                            >
                                <span className={`relative w-14 h-[30px] rounded-full grid place-items-center ${on ? 'bg-[oklch(0.93_0.06_155)]' : ''}`}>
                                    <Icon name={n.icon} size={23} fill={on} />
                                    {n.badge ? <span className="absolute -top-0.5 right-1 min-w-[16px] h-4 px-1 rounded-full bg-[oklch(0.85_0.15_90)] text-[oklch(0.3_0.08_158)] text-[10px] leading-4 text-center font-black">{n.badge}</span> : null}
                                </span>
                                {n.label}
                            </motion.button>
                        );
                    })}
                </nav>
                <Toaster />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-white">
            <div className={`bg-band text-white px-10 ${isHome ? 'pb-[104px]' : ''}`}>
                <header className="h-[72px] flex items-center gap-1.5 max-w-[1120px] mx-auto">
                    <motion.button {...tapFlat} onClick={() => onNav('home')} aria-label="Splitpot home" className="mr-[22px] text-white"><Logo size={24} word={21} onBand /></motion.button>
                    <nav aria-label="Primary" className="flex items-center gap-1.5">
                        {nav.map(n => {
                            const on = activeNav === n.id;
                            return (
                                <motion.button
                                    key={n.id}
                                    {...tapFlat}
                                    onClick={() => onNav(n.id)}
                                    aria-current={on ? 'page' : undefined}
                                    className={`h-[38px] px-4 rounded-full flex items-center gap-1.5 text-[15px] font-extrabold transition-colors ${on ? 'bg-white/[0.16] text-white' : 'text-band-text hover:bg-white/[0.12]'}`}
                                >
                                    {n.label}
                                    {n.badge ? <span className="min-w-[18px] h-[18px] px-[5px] rounded-full bg-[oklch(0.85_0.15_90)] text-[oklch(0.3_0.08_158)] text-[11px] font-black grid place-items-center">{n.badge}</span> : null}
                                </motion.button>
                            );
                        })}
                    </nav>
                    <span className="ml-auto">{avatarBtn(38, true)}</span>
                </header>
                {isHome && (
                    <div className="max-w-[1120px] mx-auto pt-[34px] flex flex-wrap items-end justify-between gap-6">
                        <div className="flex flex-col gap-2">
                            <h1 className="m-0 text-base font-bold text-band-text">{greet} {overall}</h1>
                            <span className="text-[60px] font-black tracking-[-0.035em] leading-none">{fmt(net)}</span>
                        </div>
                        <div className="flex gap-2.5">
                            {isEnabled('quickSplit') && (
                                <motion.button {...tapFlat} onClick={startQuick} className="h-[46px] px-5 rounded-full bg-band-btn hover:bg-band-btn-hover text-white flex items-center gap-1.5 text-[15px] font-extrabold" title="A shareable page to split one bill, no group needed">
                                    <Icon name="bolt" size={19} />Quick split
                                </motion.button>
                            )}
                            <motion.button {...tapFlat} onClick={onNewGroup} className="h-[46px] px-5 rounded-full bg-white text-band-deep flex items-center gap-1.5 text-[15px] font-extrabold">
                                <Icon name="add" size={19} />New group
                            </motion.button>
                        </div>
                    </div>
                )}
            </div>
            {main}
            <Toaster />
        </div>
    );
}
