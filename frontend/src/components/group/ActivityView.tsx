import type { GroupState } from './state';
import type { GroupActions } from './actions';
import React from 'react';
import { describeChange } from '../../lib/activity';
import { fmt } from '../../lib/people';
import { Card } from '../ui';

export default function ActivityView({ s, a }: { s: GroupState; a: GroupActions }) {
    const { log, who } = { ...s, ...a };
    return (
        <div className="flex flex-col gap-2.5">
            <span className="text-[13.5px] font-semibold text-muted">Every expense, receipt and transfer that was added, changed or deleted, by whom, and when.</span>
            {log === null ? <p className="text-faint font-bold animate-pulse">Loading…</p> : log.length === 0 ? (
                <Card className="p-5 text-sm font-bold text-muted">No activity yet.</Card>
            ) : (
                <Card className="p-1.5">
                    {log.map((a, i) => {
                        const nm = (id: string | null) => (id ? who(id) : 'Someone');
                        const when = new Date(a.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                        let line: React.ReactNode;
                        let details: string[] = [];
                        if (a.type === 'transfer') {
                            const l = a.entry;
                            const move = (f: string, t: string, amt: number) => `${nm(f)} → ${nm(t)} ${fmt(amt)}`;
                            line = <><span className="font-extrabold">{nm(l.actor)}</span> {l.action === 'created' ? 'recorded' : l.action} a transfer</>;
                            details = [l.action === 'edited' && l.prev_amount != null ? `${move(l.prev_from_user!, l.prev_to_user!, l.prev_amount)} became ${move(l.from_user, l.to_user, l.amount)}` : move(l.from_user, l.to_user, l.amount)];
                        } else {
                            const l = a.entry;
                            const what = l.kind === 'receipt' ? 'receipt' : 'expense';
                            line = <><span className="font-extrabold">{nm(l.actor)}</span> {l.action} {what === 'receipt' ? 'a receipt' : 'an expense'}: <span className="font-extrabold">{l.name}</span> · {fmt(l.total)}</>;
                            details = l.action === 'edited' ? l.changes.map(describeChange) : [];
                        }
                        return (
                            <div key={a.id} className={`px-3.5 py-3 flex flex-col gap-0.5 ${i ? 'border-t border-rule' : ''}`}>
                                <span className="text-[14.5px] font-semibold">{line}</span>
                                {details.map((d, j) => <span key={j} className="text-[13.5px] font-semibold text-muted">{d}</span>)}
                                <span className="text-xs font-bold text-faint">{when}</span>
                            </div>
                        );
                    })}
                </Card>
            )}
        </div>
    );
}
