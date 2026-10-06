import React, { useEffect, useState } from 'react';
import { Modal } from '../lib/motion';
import { Group, createSession, listGroups, updateSession } from '../lib/api';
import { QuickSplit } from '../lib/quickSplit';
import { Button } from './ui';

const selectCls = 'h-[38px] px-2.5 border border-line rounded-[10px] bg-white text-sm text-ink max-w-[200px]';

/** Turn a quick split into a receipt in one of the signed-in user's groups, matching each name to a group member. */
export default function QuickSplitImport({ data, onClose }: { data: QuickSplit; onClose: () => void }) {
    const [groups, setGroups] = useState<Group[] | null>(null);
    const [groupId, setGroupId] = useState('');
    const [map, setMap] = useState<Record<string, string>>({}); // split name -> member user_id ('' = leave unassigned)
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState('');

    useEffect(() => {
        let cancelled = false;
        listGroups().then(g => { if (!cancelled) { setGroups(g); setGroupId(g[0]?.id ?? ''); } }).catch(err => !cancelled && setError(err.message));
        return () => { cancelled = true; };
    }, []);

    const group = groups?.find(g => g.id === groupId);

    // Match by name where we can; the rest start unassigned until chosen.
    useEffect(() => {
        if (!group) return;
        const taken = new Set<string>();
        const next: Record<string, string> = {};
        for (const p of data.people) {
            const m = group.members.find(x => x.name.toLowerCase() === p.toLowerCase() && !taken.has(x.user_id));
            next[p] = m?.user_id ?? '';
            if (m) taken.add(m.user_id);
        }
        setMap(next);
    }, [group, data.people]);

    const chosen = Object.values(map).filter(Boolean);
    const dupes = new Set(chosen).size !== chosen.length;

    const run = async () => {
        if (!group || dupes) return;
        setSaving(true);
        setError('');
        try {
            const nameOf = (id: string) => group.members.find(m => m.user_id === id)?.name ?? '';
            const toMember = (p: string) => (map[p] ? nameOf(map[p]) : '');
            const id = await createSession({
                groupId: group.id, name: data.title, category: 'groceries', tax: data.tax, tip: data.tip,
                participants: group.members.map(m => m.name),
                items: data.items.map(i => ({ name: i.name, price: i.price, assigned_users: i.assigned.map(toMember).filter(Boolean) })),
            });
            const payer = data.paid_by ? map[data.paid_by] : '';
            if (payer) await updateSession(id, { paid_by: payer });
            setDone(group.name);
        } catch (err: any) {
            setError(err.message || 'Could not import this split.');
            setSaving(false);
        }
    };

    return (
        <Modal open onClose={onClose}>
            {done ? (
                <>
                    <h3 className="m-0 mb-2 text-xl font-semibold text-ink">Imported to {done}</h3>
                    <p className="m-0 mb-5 text-muted leading-relaxed">It's now a receipt in that group, with the same items and who had what.</p>
                    <div className="flex gap-3">
                        <Button variant="secondary" wide height={42} onClick={onClose}>Close</Button>
                        <Button wide height={42} onClick={() => window.location.assign('/')}>Open Splitpot</Button>
                    </div>
                </>
            ) : (
                <>
                    <h3 className="m-0 mb-1 text-xl font-semibold text-ink">Import to a group</h3>
                    <p className="m-0 mb-4 text-sm text-muted">Pick the group, then say who each name is. Anyone left as "Nobody" has their items unassigned.</p>
                    {groups === null ? <p className="text-faint animate-pulse">Loading your groups…</p> : groups.length === 0 ? (
                        <p className="text-sm text-muted">You don't have a group yet. Create one in Splitpot first, then import.</p>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-body">Group
                                <select aria-label="Group" value={groupId} onChange={e => setGroupId(e.target.value)} className="h-[42px] px-3 border border-line rounded-[10px] bg-white text-[15px] text-ink">
                                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                            </label>
                            {group && data.people.map(p => (
                                <label key={p} className="flex items-center justify-between gap-3 text-sm text-body">{p}
                                    <select aria-label={`${p} is`} value={map[p] ?? ''} onChange={e => setMap(m => ({ ...m, [p]: e.target.value }))} className={selectCls}>
                                        <option value="">Nobody</option>
                                        {group.members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}{m.pending ? ' (invited)' : ''}</option>)}
                                    </select>
                                </label>
                            ))}
                            {dupes && <span role="alert" className="text-[13px] text-coral-strong">Two names are set to the same person.</span>}
                        </div>
                    )}
                    {error && <p role="alert" className="m-0 mt-3 text-[13px] text-coral-strong">{error}</p>}
                    <div className="flex gap-3 mt-5">
                        <Button variant="secondary" wide height={42} onClick={onClose}>Cancel</Button>
                        <Button wide height={42} disabled={saving || !group || dupes} onClick={run}>Import</Button>
                    </div>
                </>
            )}
        </Modal>
    );
}
