import type { GroupState } from './state';
import type { GroupActions } from './actions';
import { motion, listItem, tapFlat } from '../../lib/motion';
import { categoryOf, categoryTone, myShare, totalOf } from '../../lib/expenses';
import { fmt } from '../../lib/people';
import { Card, Icon } from '../ui';

export default function ExpensesView({ s, a }: { s: GroupState; a: GroupActions }) {
    const { me, search, setSearch, category, setCategory, records, nameOf, meMember, categoriesPresent, months, onOpenRecord, editPayback, removePayback, isPersonal, dayLabel } = { ...s, ...a };
    return (
        <div className="flex flex-wrap gap-5 items-start">
            <div className="flex-[999_1_420px] min-w-0 flex flex-col gap-[18px]">
                <div className="flex items-center gap-2.5 h-12 px-[18px] rounded-full bg-soft">
                    <Icon name="search" size={21} className="text-faint" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search expenses or items" aria-label="Search expenses" className="flex-1 min-w-0 border-0 bg-transparent text-[15px] font-bold" />
                </div>

                {categoriesPresent.length > 1 && (
                    <div className="flex flex-wrap gap-2 -mt-1.5" role="group" aria-label="Filter by category">
                        {[{ id: null as string | null, label: 'All', icon: '' }, ...categoriesPresent].map(c => {
                            const on = category === c.id;
                            return (
                                <motion.button key={c.label} {...tapFlat} onClick={() => setCategory(on && c.id ? null : c.id)} aria-pressed={on}
                                    className={`h-8 px-3 rounded-full text-[13px] font-extrabold transition-colors flex items-center gap-1.5 ${on ? 'bg-ink text-white' : 'bg-soft text-body hover:bg-[#EFEAE3]'}`}>
                                    {c.icon && <Icon name={c.icon} size={16} />}{c.label}
                                </motion.button>
                            );
                        })}
                    </div>
                )}

                {months.map(m => (
                    <div key={m.label} className="flex flex-col gap-2">
                        <span className="text-sm font-extrabold text-faint pl-1.5">{m.label}</span>
                        <Card className="p-1.5">
                            {m.rows.map((e, i) => {
                                if (e.type === 'transfer') {
                                    const p = e.p;
                                    return (
                                        <motion.div key={`pb-${p.id}`} {...listItem(i)} className="flex items-center gap-3.5 p-3 rounded-[18px] hover:bg-wash transition-colors">
                                            <span className="w-11 h-11 rounded-full grid place-items-center shrink-0 bg-green-tint text-green-icon"><Icon name="swap_horiz" size={21} /></span>
                                            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                                <span className="text-base font-extrabold truncate">{nameOf(p.from_user)} paid {nameOf(p.to_user)}</span>
                                                <span className="text-[13.5px] font-semibold text-faint">Transfer · {dayLabel(e.date)}</span>
                                            </span>
                                            <span className="shrink-0 flex flex-col items-end gap-0.5">
                                                <span className="text-base font-black text-green">{fmt(p.amount)}</span>
                                                <span className="flex gap-2.5">
                                                    <button type="button" onClick={() => editPayback(p)} className="text-xs font-extrabold text-ink underline underline-offset-2">Edit</button>
                                                    <button type="button" onClick={() => removePayback(p.id)} className="text-xs font-extrabold text-ink underline underline-offset-2">Delete</button>
                                                </span>
                                            </span>
                                        </motion.div>
                                    );
                                }
                                const r = e.rec;
                                const total = totalOf(r);
                                const share = myShare(r, meMember);
                                const lent = r.paid_by === me ? Math.max(0, Math.round((total - share) * 100) / 100) : 0;
                                const ct = categoryTone(r.category);
                                const meta = `${r.kind === 'receipt' ? `${r.items.length} ${r.items.length === 1 ? 'item' : 'items'} · ` : ''}paid by ${nameOf(r.paid_by)} · ${dayLabel(r.session_date)}`;
                                return (
                                    <motion.div key={r.id} {...listItem(i)}>
                                        <motion.button
                                            {...tapFlat}
                                            onClick={() => onOpenRecord(r.id, r.kind)}
                                            className="w-full flex items-center gap-3.5 p-3 rounded-[18px] text-left text-ink hover:bg-wash transition-colors"
                                        >
                                            <span aria-hidden="true" className="w-11 h-11 rounded-full grid place-items-center shrink-0" style={{ background: ct.bg, color: ct.fg }}><Icon name={categoryOf(r.category).icon} size={21} /></span>
                                            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                                <span className="text-base font-extrabold truncate">{r.name}</span>
                                                <span className="text-[13.5px] font-semibold text-faint">{meta}{!!r.photo_count && <><Icon name="attach_file" size={14} className="ml-1.5 align-[-2px]" /><span className="sr-only"> has photos</span></>}</span>
                                            </span>
                                            <span className="shrink-0 flex flex-col items-end gap-px">
                                                <span className="text-base font-black">{fmt(total)}</span>
                                                {lent > 0.004
                                                    ? <span className="text-[12.5px] font-bold text-green">you lent {fmt(lent)}</span>
                                                    : <span className="text-[12.5px] font-bold text-faint">your share {fmt(share)}</span>}
                                            </span>
                                        </motion.button>
                                    </motion.div>
                                );
                            })}
                        </Card>
                    </div>
                ))}

                {months.length === 0 && (
                    <p className="m-0 p-9 text-center text-[15px] font-bold text-faint rounded-[24px] bg-wash">
                        {records.length ? 'Nothing matches that search.' : isPersonal ? 'No expenses yet. Add one to keep track of what you paid for others.' : 'No expenses yet. Add one and everyone in the group can see it.'}
                    </p>
                )}
            </div>

        </div>
    );
}
