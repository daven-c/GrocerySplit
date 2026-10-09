import { motion, Pop, UnderlineTabs, SegmentedTabs, AnimatedNumber } from '../lib/motion';
import { isEnabled } from '../lib/flags';
import { fmt } from '../lib/people';
import { AvatarStack, Icon } from './ui';
import GroupModals from './group/GroupModals';
import AddMenu from './group/AddMenu';
import ExpensesView from './group/ExpensesView';
import BalancesView from './group/BalancesView';
import ActivityView from './group/ActivityView';
import MembersView from './group/MembersView';
import { useGroupState } from './group/state';
import { createGroupActions } from './group/actions';
import type { GroupDetailProps } from './group/types';
export type { GroupTab } from './group/types';

export default function GroupDetail(props: GroupDetailProps) {
    const s = useGroupState(props);
    if (!s.group) {
        return <p className="text-center text-faint py-16 animate-pulse">{s.loading ? 'Loading group…' : 'This group is no longer available.'}</p>;
    }
    const a = createGroupActions(s, s.group);
    const { group, tab, setTab, side, setSide, error, notice, records, tones, totalCost, net, ledger, isPersonal, balanceLine, balanceColor, tile, publishedCount } = { ...s, ...a };

    if (isPersonal) {
        const owedToMe = net > 0.004 ? net : 0;
        const iOwe = net < -0.004 ? -net : 0;
        const section = 'm-0 px-1 text-[12.5px] font-extrabold uppercase tracking-[0.08em] text-faint';
        const tiles: [string, number, string][] = [['Total spent', totalCost, 'bg-wash text-ink'], ['Owed to you', owedToMe, 'bg-green-tint text-green-deep'], ['You owe', iOwe, 'bg-coral-tint text-[oklch(0.4_0.13_32)]']];
        return (
            <div className="max-w-[1040px] mx-auto flex flex-col gap-5">
                <GroupModals s={s} a={a} />
                <div className="rounded-[24px] min-[560px]:rounded-[28px] bg-warm p-4 min-[560px]:p-6 flex flex-wrap items-center gap-3 min-[560px]:gap-4">
                    <span aria-hidden="true" className="w-11 h-11 min-[560px]:w-14 min-[560px]:h-14 rounded-full bg-white grid place-items-center text-[oklch(0.5_0.1_80)] shrink-0"><Icon name="lock" fill size={24} /></span>
                    <div className="flex-[1_1_240px] min-w-0 flex flex-col gap-0.5">
                        <span className="text-[12.5px] font-extrabold uppercase tracking-[0.08em] text-[#8A6A2C]">Private notebook</span>
                        {/* The phone header already says "Personal", so the big title only shows where there is no header. */}
                        <h1 className="m-0 text-[30px] font-black tracking-title leading-[1.05] sr-only min-[760px]:not-sr-only">Personal</h1>
                        <p className="m-0 text-[14.5px] min-[560px]:text-[15px] font-semibold text-[#6E655C] max-w-[520px]">Only you can see this. Keep track of what people owe you outside any group.</p>
                    </div>
                    <AddMenu s={s} a={a} />
                </div>

                <div className="grid grid-cols-3 gap-2 min-[560px]:gap-3" aria-label="Personal totals">
                    {tiles.map(([label, value, tone]) => (
                        <div key={label} className={`px-3 py-3 min-[560px]:px-5 min-[560px]:py-4 rounded-[18px] min-[560px]:rounded-[22px] flex flex-col gap-0.5 min-w-0 ${tone}`}>
                            <span className="text-[12px] min-[560px]:text-[13.5px] font-extrabold opacity-80 truncate">{label}</span>
                            <AnimatedNumber value={value} prefix="$" className="text-[17px] min-[560px]:text-[26px] font-black tracking-[-0.02em] truncate" />
                        </div>
                    ))}
                </div>

                <Pop show={!!error} className="px-4 py-2.5 rounded-[22px] bg-coral-tint text-coral-on text-[13.5px] font-extrabold">{error}</Pop>
                <Pop show={!!notice} className="px-4 py-2.5 rounded-[22px] bg-green-tint text-green-on text-[13.5px] font-extrabold">{notice}</Pop>

                <div className="flex flex-wrap gap-6 items-start">
                    <section className="flex-[999_1_460px] min-w-0 flex flex-col gap-3" aria-label="Personal ledger">
                        <h2 className={section}>Ledger</h2>
                        <ExpensesView s={s} a={a} />
                    </section>
                    <aside className="flex-[1_1_340px] min-w-0 flex flex-col gap-3 order-first min-[840px]:order-none">
                        <SegmentedTabs id="personal-side" value={side} onChange={setSide} tabs={[{ value: 'balances', label: 'Balances' }, { value: 'people', label: `People ${group.members.length}` }]} />
                        {side === 'balances'
                            ? <section aria-label="Personal balances"><BalancesView s={s} a={a} /></section>
                            : <section aria-label="Personal people"><MembersView s={s} a={a} /></section>}
                    </aside>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-[1000px] mx-auto flex flex-col gap-6">
            <GroupModals s={s} a={a} />

            <div className="flex flex-wrap items-center justify-between gap-[18px]">
                <div className="flex flex-col gap-3 min-w-0">
                    {isPersonal ? (
                        <div className="flex flex-col gap-1.5 min-w-0">
                            <h1 className="m-0 text-[32px] font-black tracking-title leading-[1.05] flex items-center gap-2.5">Personal<Icon name="lock" fill size={24} className="text-ghost" /></h1>
                            <p className="m-0 text-base font-semibold text-muted max-w-[560px]">For expenses that don't belong to any group, plus the quick splits you've made. Only you can see this.</p>
                        </div>
                    ) : (
                        <div className="flex items-center gap-4 min-w-0">
                            <span aria-hidden="true" className="w-16 h-16 rounded-full grid place-items-center text-[26px] font-black shrink-0" style={{ background: tile.bg, color: tile.fg }}>{(group.name.trim()[0] ?? '?').toUpperCase()}</span>
                            <div className="flex flex-col gap-1.5 min-w-0">
                                <h1 className="m-0 text-[32px] font-black tracking-title leading-[1.05] truncate">{group.name}</h1>
                                <div className="flex items-center gap-2.5 flex-wrap">
                                    <AvatarStack size={26} people={group.members.map(m => ({ name: m.name, tone: tones[m.user_id] }))} />
                                    <span className={`text-[15px] font-extrabold ${balanceColor}`}>{balanceLine}</span>
                                </div>
                                <div className="text-sm font-semibold text-muted">
                                    Total cost <span className="font-extrabold text-ink">{fmt(totalCost)}</span> across {publishedCount} {publishedCount === 1 ? 'expense' : 'expenses'}
                                </div>
                            </div>
                        </div>
                    )}
                    {isPersonal && (
                        <div className="text-sm font-semibold text-muted">
                            Total cost <span className="font-extrabold text-ink">{fmt(totalCost)}</span> across {publishedCount} {publishedCount === 1 ? 'expense' : 'expenses'}
                        </div>
                    )}
                </div>
                <AddMenu s={s} a={a} />
            </div>

            <UnderlineTabs id="group" value={tab} onChange={setTab} tabs={[
                { value: 'expenses', label: 'Expenses', count: records.length },
                { value: 'balances', label: 'Balances' },
                ...(isEnabled('activity') ? [{ value: 'activity' as const, label: 'Activity' }] : []),
                { value: 'members', label: 'Members', count: group.members.length },
            ]} />

            <Pop show={!!error} className="px-4 py-2.5 rounded-[22px] bg-coral-tint text-coral-on text-[13.5px] font-extrabold">{error}</Pop>
            <Pop show={!!notice} className="px-4 py-2.5 rounded-[22px] bg-green-tint text-green-on text-[13.5px] font-extrabold">{notice}</Pop>

            <motion.div key={tab} initial={{ y: 10 }} animate={{ y: 0 }} transition={{ duration: 0.18 }}>
                {tab === 'expenses' && <ExpensesView s={s} a={a} />}

                {tab === 'balances' && ledger && <BalancesView s={s} a={a} />}

                {tab === 'activity' && isEnabled('activity') && <ActivityView s={s} a={a} />}

                {tab === 'members' && <MembersView s={s} a={a} />}
            </motion.div>
        </div>
    );
}
