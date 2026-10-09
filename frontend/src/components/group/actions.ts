import type { GroupState } from './state';
import { linkPersonalPerson, createSession, deleteGroup, removeMember, inviteToGroup, listPendingInvites, recordSettlement, addGuest, renameGuest, removeGuest, updateSettlement, deleteSettlement, Settlement } from '../../lib/api';
import { fmt, groupTile } from '../../lib/people';
import { toast } from '../Toast';
import { messageOf } from '../../lib/errors';
import { Group } from '../../lib/api';

export function createGroupActions(s: GroupState, group: Group) {
    const { me, refresh, setAddOpen, setPending, email, setEmail, personName, setPersonName, personUser, setPersonUser, guestOp, setGuestOp, setError, setNotice, confirm, setConfirm, settling, setSettling, setPbOpen, pbEditId, setPbEditId, pbFrom, setPbFrom, pbTo, setPbTo, pbAmount, setPbAmount, creating, shownConfirm, records, labels, net, ledger, groupId, onBack, onOpenRecord } = s;

    const memberIds = group.members.map(m => m.user_id); // receipts name people by id

    const addReceipt = async () => {
        setAddOpen(false);
        if (creating.current) return;
        creating.current = true;
        try {
            const id = await createSession({ groupId, name: 'Receipt', participants: memberIds, category: 'groceries', draft: true });
            await refresh();
            onOpenRecord(id, 'receipt', true);
        } catch (err) { creating.current = false; setError(messageOf(err, 'Could not create the receipt')); }
    };

    const addExpense = async () => {
        setAddOpen(false);
        if (creating.current) return;
        creating.current = true;
        try {
            const id = await createSession({
                groupId, kind: 'expense', draft: true, name: 'New expense', category: 'other', amount: 0,
                splitMethod: 'exact', splitData: {}, // nobody is selected until you choose
            });
            await refresh();
            onOpenRecord(id, 'expense', true);
        } catch (err) { creating.current = false; setError(messageOf(err, 'Could not create the expense')); }
    };

    // The form opens on the first suggested transfer; changing who paid / who received refills the amount when
    // that exact transfer is one of the suggestions.
    const openPayback = () => {
        setAddOpen(false);
        if (group.members.length < 2) { setError('Invite someone to this group first.'); return; }
        const t = ledger?.transfers[0];
        const other = group.members.find(m => m.user_id !== me)!;
        setPbFrom(t?.from ?? me);
        setPbTo(t?.to ?? other.user_id);
        setPbAmount(t ? String(t.amount) : '');
        setPbEditId(null);
        setPbOpen(true);
    };
    const editPayback = (p: Settlement) => {
        setPbFrom(p.from_user);
        setPbTo(p.to_user);
        setPbAmount(String(p.amount));
        setPbEditId(p.id);
        setPbOpen(true);
    };
    const changePayback = (from: string, to: string) => {
        setPbFrom(from);
        setPbTo(to);
        const t = ledger?.transfers.find(x => x.from === from && x.to === to);
        if (t) setPbAmount(String(t.amount));
    };
    const pbAmountNum = Math.round((parseFloat(pbAmount) || 0) * 100) / 100;
    const pbValid = !!pbFrom && !!pbTo && pbFrom !== pbTo && pbAmountNum > 0;
    const savePayback = async () => {
        if (!pbValid) return;
        setSettling(true);
        setError('');
        try {
            if (pbEditId) await updateSettlement(pbEditId, pbFrom, pbTo, pbAmountNum);
            else await recordSettlement(groupId, pbFrom, pbTo, pbAmountNum);
            setPbOpen(false);
            await refresh();
        } catch (err) {
            setError(messageOf(err, pbEditId ? 'Could not save that transfer' : 'Could not record that transfer'));
        } finally {
            setSettling(false);
        }
    };
    const removePayback = async (id: string) => {
        setError('');
        try { await deleteSettlement(id); await refresh(); }
        catch (err) { setError(messageOf(err, 'Could not delete that transfer')); }
    };

    const handleInvite = async () => {
        const u = email.trim().toLowerCase().replace(/^@/, '');
        setError(''); setNotice('');
        if (!/^[a-z0-9_]{3,20}$/.test(u)) return setError('Enter a username: 3 to 20 letters, numbers or underscores.');
        if (group.members.some(m => !m.pending && m.username === u)) return setError('That person is already in this group.');
        try {
            await inviteToGroup(groupId, u);
            setEmail('');
            setNotice(`Invited @${u}. You can use them in expenses now; it all moves to their account when they accept.`);
            toast('Invite sent');
            await refresh();
            setPending(await listPendingInvites(groupId));
        } catch (err) { setError(messageOf(err, 'That did not work')); }
    };

    const reloadPeople = async () => { await refresh(); setPending(await listPendingInvites(groupId)); };
    const addPerson = async () => {
        const n = personName.trim();
        const u = isPersonal ? personUser.trim() : '';
        if (!n && !u) return;
        setError(''); setNotice('');
        try { await addGuest(groupId, n, u || undefined); setPersonName(''); setPersonUser(''); await reloadPeople(); }
        catch (err) { setError(messageOf(err, 'Could not add that person')); }
    };
    const runGuestOp = async () => {
        if (!guestOp || !guestOp.value.trim()) return;
        setError(''); setNotice('');
        try {
            if (guestOp.kind === 'link') {
                if (isPersonal) { await linkPersonalPerson(guestOp.id, guestOp.value); toast('Linked'); }
                else { await inviteToGroup(groupId, guestOp.value, guestOp.id); toast('Invite sent'); }
            } else await renameGuest(guestOp.id, guestOp.value);
            setGuestOp(null);
            await reloadPeople();
        } catch (err) { setError(messageOf(err, 'That did not work')); }
    };
    const dropGuest = async (id: string) => {
        setError('');
        try { await removeGuest(id); await reloadPeople(); }
        catch (err) { setError(messageOf(err, 'Could not remove that person')); }
    };

    const handleConfirm = async () => {
        if (!confirm) return;
        const c = confirm;
        setConfirm(null);
        try {
            if (c.kind === 'delete') { await deleteGroup(groupId); await refresh(); return onBack(); }
            if (c.kind === 'leave') { await removeMember(groupId, me); await refresh(); return onBack(); }
            await removeMember(groupId, c.userId!);
            await refresh();
        } catch (err) { setError(messageOf(err, 'Action failed')); }
    };

    const settle = async (from: string, to: string, amount: number) => {
        if (settling) return;
        setSettling(true);
        setError('');
        try {
            await recordSettlement(groupId, from, to, amount);
            await refresh();
            toast('Transfer recorded');
        } catch (err) {
            setError(messageOf(err, 'Could not record that payment'));
        } finally {
            setSettling(false);
        }
    };
    const who = (id: string) => labels[id] ?? 'Someone';

    const confirmText = {
        delete: { title: 'Delete group?', body: `This permanently deletes "${group.name}" and all ${records.length} of its expenses for every member.`, action: 'Delete' },
        leave: { title: 'Leave group?', body: `You'll lose access to "${group.name}" and its expenses unless someone invites you again.`, action: 'Leave' },
        remove: { title: 'Remove member?', body: `Remove ${shownConfirm?.name} from "${group.name}"? They lose access to its expenses.`, action: 'Remove' },
    };

    const isPersonal = !!group.personal;
    const balanceLine = Math.abs(net) < 0.005 ? "Everyone's square" : net > 0 ? `You're owed ${fmt(net)} here` : `You owe ${fmt(net)} here`;
    const balanceColor = Math.abs(net) < 0.005 ? 'text-body' : net > 0 ? 'text-green' : 'text-coral';
    const tile = groupTile(group.id);
    const publishedCount = records.filter(r => !r.draft).length;
    const dayLabel = (iso: string) => new Date(iso + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const labelCls2 = 'flex flex-col gap-1.5 text-[14px] font-extrabold text-body';
    const panelCls = 'rounded-[24px] bg-mint p-[18px] flex flex-col gap-3';


    return { memberIds, addReceipt, addExpense, openPayback, editPayback, changePayback, pbAmountNum, pbValid, savePayback, removePayback, handleInvite, reloadPeople, addPerson, runGuestOp, dropGuest, handleConfirm, settle, who, confirmText, isPersonal, balanceLine, balanceColor, tile, publishedCount, dayLabel, labelCls2, panelCls, group };
}

export type GroupActions = ReturnType<typeof createGroupActions>;
