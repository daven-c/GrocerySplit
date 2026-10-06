import React, { useEffect, useRef } from 'react';
import { motion, tapFlat, spring } from '../lib/motion';
import { useAppData } from '../lib/appData';
import { groupDot, HUES, toneFor } from '../lib/people';
import { Avatar, Icon, Logo } from './ui';

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
const navFor = (view: ShellView, personal: boolean): NavView => (['home', 'group', 'import', 'split', 'expense'].includes(view) ? (personal ? 'personal' : 'home') : (view as NavView));

export default function Shell({ view, narrow, user, groupId, recordId, onNav, onOpenGroup, onNewGroup, onBack, children }: ShellProps) {
    const { groups, sessions, invites, isAdmin, refresh } = useAppData();
    const inPersonal = !!groups.find(g => g.id === groupId)?.personal;
    const activeNav = navFor(view, inPersonal);
    const inGroup = ['group', 'import', 'split', 'expense'].includes(view);

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
        { id: 'personal', label: 'Personal', icon: 'lock' },
        { id: 'account', label: 'Account', icon: 'person' },
        ...(isAdmin ? [{ id: 'admin' as NavView, label: 'Admin', icon: 'admin_panel_settings' }] : []),
    ];

    const groupName = groups.find(g => g.id === groupId)?.name ?? '';
    const recordName = sessions.find(s => s.id === recordId)?.name ?? '';
    const titles: Partial<Record<ShellView, string>> = { group: groupName, import: 'Import receipt', split: recordName || 'Receipt', expense: recordName || 'Expense', friends: 'People', account: 'Account', admin: 'Admin' };

    const main = (
        <main className={`flex-1 min-w-0 ${narrow ? 'px-4 pt-6 pb-8' : 'px-12 pt-10 pb-16'}`}>
            <motion.div key={pageKey} initial={{ opacity: 0.7, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                {children}
            </motion.div>
        </main>
    );

    if (narrow) {
        return (
            <div className="min-h-screen flex flex-col bg-white">
                <header className="sticky top-0 z-[5] h-14 flex items-center gap-2.5 px-4 bg-white/90 backdrop-blur-[10px] border-b border-edge">
                    {inGroup && (
                        <motion.button {...tapFlat} onClick={onBack} aria-label="Back" className="-ml-1.5 p-1.5 text-ink">
                            <Icon name="arrow_back" size={22} />
                        </motion.button>
                    )}
                    {view === 'home' ? <Logo size={18} word={17} /> : <span className="font-semibold text-[15px] truncate">{titles[view]}</span>}
                </header>
                {main}
                <nav
                    aria-label="Primary"
                    className="sticky bottom-0 z-[5] grid bg-white/95 backdrop-blur-[10px] border-t border-edge px-2 pt-1.5 pb-[18px]"
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
                                className={`relative h-[52px] flex flex-col items-center justify-center gap-[3px] text-[11px] font-semibold ${on ? 'text-ink' : 'text-faint'}`}
                            >
                                <span className="relative">
                                    <Icon name={n.icon} size={24} fill={on} />
                                    {n.badge ? <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-coral text-white text-[10px] leading-4 text-center">{n.badge}</span> : null}
                                </span>
                                {n.label}
                            </motion.button>
                        );
                    })}
                </nav>
            </div>
        );
    }

    const me = user ? { name: user.name, tone: toneFor(HUES[0]) } : null;
    return (
        <div className="flex min-h-screen bg-white">
            <aside className="w-[244px] shrink-0 border-r border-edge bg-surface sticky top-0 h-screen flex flex-col gap-6 px-3.5 py-[22px]" aria-label="Sidebar">
                <div className="px-2.5"><Logo size={20} word={18} /></div>

                <nav className="flex flex-col gap-0.5" aria-label="Primary">
                    {nav.map(n => {
                        const on = activeNav === n.id;
                        return (
                            <motion.button
                                key={n.id}
                                {...tapFlat}
                                onClick={() => onNav(n.id)}
                                aria-current={on ? 'page' : undefined}
                                className={`relative h-[38px] px-2.5 flex items-center gap-3 rounded-lg text-sm text-ink text-left ${on ? 'font-semibold' : 'font-medium hover:bg-edge/60'}`}
                            >
                                {on && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-edge" transition={spring} />}
                                <Icon name={n.icon} size={20} className="relative text-body" />
                                <span className="relative">{n.label}</span>
                                {n.badge ? <span className="relative ml-auto text-xs font-semibold text-coral">{n.badge}</span> : null}
                            </motion.button>
                        );
                    })}
                </nav>

                <div className="flex flex-col gap-0.5 min-h-0">
                    <div className="flex items-center justify-between px-2.5 pb-1.5">
                        <span className="text-xs font-medium text-faint">Groups</span>
                        <motion.button {...tapFlat} onClick={onNewGroup} title="New group" aria-label="New group" className="text-muted hover:text-ink"><Icon name="add" size={18} /></motion.button>
                    </div>
                    <div className="flex flex-col gap-0.5 overflow-y-auto">
                        {groups.filter(g => !g.personal).map(g => {
                            const on = inGroup && groupId === g.id;
                            return (
                                <motion.button
                                    key={g.id}
                                    {...tapFlat}
                                    onClick={() => onOpenGroup(g.id)}
                                    aria-current={on ? 'page' : undefined}
                                    className={`relative h-[34px] px-2.5 flex items-center gap-2.5 rounded-lg text-sm text-ink text-left ${on ? '' : 'hover:bg-edge/60'}`}
                                >
                                    {on && <motion.span layoutId="group-active" className="absolute inset-0 rounded-lg bg-edge" transition={spring} />}
                                    <span className="relative w-2 h-2 rounded-sm shrink-0" style={{ background: groupDot(g.id) }} />
                                    <span className="relative flex-1 truncate">{g.name}</span>
                                </motion.button>
                            );
                        })}
                    </div>
                </div>

                {me && (
                    <div className="mt-auto flex items-center gap-2.5 px-2.5 py-2">
                        <Avatar name={me.name} tone={me.tone} size={30} />
                        <div className="min-w-0 flex flex-col">
                            <span className="text-sm font-semibold truncate">{user!.name}</span>
                            <span className="text-xs text-faint truncate">{user!.email}</span>
                        </div>
                    </div>
                )}
            </aside>
            <div className="flex-1 min-w-0 flex flex-col">{main}</div>
        </div>
    );
}
