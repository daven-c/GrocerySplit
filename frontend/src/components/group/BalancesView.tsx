import type { GroupState } from './state';
import type { GroupActions } from './actions';
import { motion, AnimatePresence, AnimatedNumber, listItem } from '../../lib/motion';
import { fmt } from '../../lib/people';
import { Avatar, Button, Card, Icon } from '../ui';

export default function BalancesView({ s, a }: { s: GroupState; a: GroupActions }) {
    const { me, group, settling, tones, ledger, maxNet, settle, who, isPersonal } = { ...s, ...a };
    if (!ledger) return null;
    return (
        <div className="flex flex-wrap gap-5 items-start">
            <Card className="flex-[999_1_420px] min-w-0 p-5 flex flex-col gap-4">
                <span className="text-lg font-black">Where everyone stands</span>
                {[...ledger.members].sort((a, b) => b.net - a.net).map((m, i) => {
                    const member = group.members.find(x => x.user_id === m.userId)!;
                    const square = Math.abs(m.net) < 0.005;
                    const w = `${(Math.abs(m.net) / maxNet) * 100}%`;
                    return (
                        <motion.div key={m.userId} {...listItem(i)} className="flex items-center gap-3">
                            <Avatar name={member.name} tone={tones[m.userId]} size={40} />
                            <span className={isPersonal ? 'flex-1 min-w-0 flex flex-col' : 'w-[84px] shrink-0 flex flex-col'}>
                                <span className="text-[15px] font-extrabold truncate">{who(m.userId)}</span>
                                <span className="text-[12.5px] font-bold text-faint">{square ? 'all square' : m.net > 0 ? 'up' : 'down'}</span>
                            </span>
                            {!isPersonal && <span className="grid grid-cols-[1fr_2px_1fr] items-center h-7 flex-1 min-w-[60px]" aria-hidden="true">
                                <span className="flex justify-end"><motion.span className="h-3 rounded-l-md bg-[oklch(0.78_0.12_32)]" initial={false} animate={{ width: m.net < 0 ? w : '0%' }} transition={{ duration: 0.3 }} /></span>
                                <span className="h-7 bg-line rounded-[1px]" />
                                <span className="flex"><motion.span className="h-3 rounded-r-md bg-[oklch(0.74_0.14_155)]" initial={false} animate={{ width: m.net > 0 ? w : '0%' }} transition={{ duration: 0.3 }} /></span>
                            </span>}
                            <span className="w-[90px] text-right shrink-0">
                                {square ? <span className="text-base font-black text-faint">Settled</span> : <AnimatedNumber value={Math.abs(m.net)} prefix={m.net < 0 ? '-$' : '+$'} className={`text-base font-black ${m.net > 0 ? 'text-green' : 'text-coral'}`} />}
                            </span>
                        </motion.div>
                    );
                })}
                <span className="text-[12.5px] font-semibold text-faint leading-[1.5]">{isPersonal ? 'Up means they are owed money; down means they owe money. It always adds up to zero.' : 'Up means the group owes them; down means they owe the group. It always adds up to zero.'}</span>
            </Card>

            <div className="flex-[1_1_320px] min-w-0 flex flex-col gap-2.5">
                <span className="text-[17px] font-black px-1.5">Settle up</span>
                <AnimatePresence initial={false}>
                    {ledger.transfers.map((t, i) => {
                        const mine = t.from === me || t.to === me;
                        const fromM = group.members.find(x => x.user_id === t.from);
                        const toM = group.members.find(x => x.user_id === t.to);
                        return (
                            <motion.div key={`${t.from}-${t.to}`} {...listItem(i)} className={`flex items-center gap-2.5 py-3 pl-3.5 pr-3 rounded-[22px] ${mine ? 'bg-wash' : 'bg-white border border-edge'}`}>
                                <span className="flex items-center gap-0.5 shrink-0">
                                    {fromM && <Avatar name={fromM.name} tone={tones[t.from]} size={34} />}
                                    <Icon name="arrow_forward" size={18} className="text-ghost" />
                                    {toM && <Avatar name={toM.name} tone={tones[t.to]} size={34} />}
                                </span>
                                <span className="flex-1 min-w-0 flex flex-col gap-px">
                                    <span className="text-[14.5px] font-extrabold"><span>{who(t.from)}</span> {t.from === me ? 'pay' : 'pays'} <span>{who(t.to)}</span></span>
                                    <span className="text-base font-black">{fmt(t.amount)}</span>
                                </span>
                                <Button variant={mine ? 'primary' : 'secondary'} height={36} className="px-3.5 text-[13.5px] shrink-0" disabled={settling} onClick={() => settle(t.from, t.to, t.amount)}>
                                    {t.from === me ? 'Mark paid' : t.to === me ? 'Mark received' : 'Record transfer'}
                                </Button>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
                {ledger.transfers.length === 0 && (
                    <p className="m-0 flex items-center gap-2.5 p-[18px] rounded-[22px] bg-green-tint text-[15px] font-extrabold text-[oklch(0.38_0.11_155)]"><Icon name="check_circle" fill size={22} />Everyone's square. Nothing to settle.</p>
                )}
                <span className="text-[12.5px] font-semibold text-faint leading-[1.5] px-1.5">The fewest payments that settle everyone. Recording one doesn't move money; it just updates the balances.</span>
            </div>
        </div>
    );
}
