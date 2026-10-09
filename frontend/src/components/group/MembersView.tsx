import type { GroupState } from './state';
import type { GroupActions } from './actions';
import { motion, AnimatePresence, listItem, tapFlat } from '../../lib/motion';
import { linkPersonalPerson, listPendingInvites, revokeInvite } from '../../lib/api';
import { Avatar, Button, Card, Icon } from '../ui';
import { messageOf } from '../../lib/errors';

export default function MembersView({ s, a }: { s: GroupState; a: GroupActions }) {
    const { refresh, group, pending, setPending, email, setEmail, personName, setPersonName, personUser, setPersonUser, guestOp, setGuestOp, setError, setConfirm, isOwner, tones, groupId, handleInvite, reloadPeople, addPerson, runGuestOp, dropGuest, isPersonal, panelCls } = { ...s, ...a };
    return (
        <div className="flex flex-wrap gap-5 items-start">
            <Card className="flex-[999_1_420px] min-w-0 p-1.5">
                {group.members.map((m, i) => (
                    <motion.div key={m.user_id} {...listItem(i)} className="flex flex-wrap items-center gap-3.5 p-3">
                        <Avatar name={m.name} tone={tones[m.user_id]} size={44} />
                        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                            <span className="text-base font-extrabold truncate">{m.name}</span>
                            <span className="text-[13.5px] font-semibold text-faint truncate">{m.pending ? (isPersonal ? (m.linked_username ? `Linked to @${m.linked_username}` : 'Just a name') : 'Not joined yet') : m.username ? `@${m.username}` : m.email}</span>
                        </span>
                        {m.role === 'owner' && <span className="text-[12.5px] font-extrabold text-muted px-2.5 py-1 rounded-full bg-soft">Owner</span>}
                        {m.pending && <span className="text-[12.5px] font-extrabold text-muted px-2.5 py-1 rounded-full bg-soft">{isPersonal ? (m.linked_user ? 'Linked' : 'Name only') : 'Not joined'}</span>}
                        {isOwner && m.pending && (
                            <span className="flex items-center gap-2.5 text-xs font-extrabold text-body">
                                <button type="button" onClick={() => setGuestOp({ id: m.user_id, kind: 'rename', value: m.name })} className="underline underline-offset-2">Rename</button>
                                {isPersonal
                                    ? (m.linked_user
                                        ? <button type="button" onClick={async () => { setError(''); try { await linkPersonalPerson(m.user_id, ''); await reloadPeople(); } catch (er) { setError(messageOf(er, 'Could not unlink')); } }} className="underline underline-offset-2">Unlink</button>
                                        : <button type="button" onClick={() => setGuestOp({ id: m.user_id, kind: 'link', value: '' })} className="underline underline-offset-2">Link to account</button>)
                                    : !pending.some(p => p.name === m.name) && <button type="button" onClick={() => setGuestOp({ id: m.user_id, kind: 'link', value: '' })} className="underline underline-offset-2">Link to account</button>}
                                <motion.button {...tapFlat} aria-label={`Remove ${m.name}`} onClick={() => dropGuest(m.user_id)} className="w-8 h-8 grid place-items-center rounded-full text-faint hover:bg-coral-tint hover:text-coral"><Icon name="close" size={18} /></motion.button>
                            </span>
                        )}
                        {isOwner && m.role !== 'owner' && !m.pending && (
                            <motion.button {...tapFlat} aria-label={`Remove ${m.name}`} onClick={() => setConfirm({ kind: 'remove', userId: m.user_id, name: m.name })} className="w-8 h-8 grid place-items-center rounded-full text-faint hover:bg-coral-tint hover:text-coral">
                                <Icon name="close" size={18} />
                            </motion.button>
                        )}
                        {guestOp?.id === m.user_id && (
                            <div className="basis-full flex flex-wrap items-center gap-2 pt-1">
                                <input autoFocus aria-label={guestOp.kind === 'link' ? `Username for ${m.name}` : `New name for ${m.name}`} value={guestOp.value} onChange={e => setGuestOp({ ...guestOp, value: e.target.value })} onKeyDown={e => e.key === 'Enter' && runGuestOp()} placeholder={guestOp.kind === 'link' ? '@username' : 'New name'} maxLength={60} className="h-10 px-4 border-[1.5px] border-line rounded-full bg-field text-sm font-bold flex-1 min-w-[160px]" />
                                <Button height={38} className="px-4" disabled={!guestOp.value.trim()} onClick={runGuestOp}>{guestOp.kind === 'link' ? (isPersonal ? 'Link' : 'Send invite') : 'Rename'}</Button>
                                <Button variant="secondary" height={38} className="px-4" onClick={() => setGuestOp(null)}>Cancel</Button>
                            </div>
                        )}
                    </motion.div>
                ))}
            </Card>

            <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-3.5">
                {isOwner && !isPersonal && (
                    <div className={panelCls}>
                        <span className="text-base font-black">Invite someone</span>
                        <span className="flex items-center gap-1 h-[46px] px-4 border-[1.5px] border-transparent rounded-full bg-white focus-within:border-[oklch(0.55_0.1_158)]">
                            <span className="font-bold text-faint">@</span>
                            <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleInvite()} placeholder="username" aria-label="Invite by username" autoCapitalize="none" className="flex-1 min-w-0 border-0 bg-transparent text-[15px] font-bold" />
                        </span>
                        <Button variant="band" height={44} wide onClick={handleInvite} disabled={!email.trim()}>Send invite</Button>
                        <span className="text-[13px] font-semibold leading-[1.45] text-[#5E6A60]">While an invite is pending you can already add them to expenses. They'll see the invite when they sign in, and everything moves to their account when they accept. They can find their username under Account.</span>
                        <AnimatePresence initial={false}>
                            {pending.map(p => (
                                <motion.div key={p.id} layout initial={{ opacity: 0.8, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="flex items-center gap-2.5 px-3.5 py-2.5 bg-white rounded-full">
                                    <Icon name="schedule" size={18} className="text-faint" />
                                    <span className="flex-1 min-w-0 text-sm font-bold truncate">{p.name}</span>
                                    <motion.button {...tapFlat} onClick={async () => { setError(''); try { await revokeInvite(p.id); await refresh(); setPending(await listPendingInvites(groupId)); } catch (err) { setError(messageOf(err, 'Could not cancel that invite')); } }} className="text-[13px] font-extrabold text-coral">Revoke</motion.button>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
                {isOwner && (
                    <div className={panelCls}>
                        <span className="text-base font-black">{isPersonal ? 'Add someone by name' : 'Add a temporary person'}</span>
                        <input value={personName} onChange={e => setPersonName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPerson()} placeholder="Name" aria-label="Person's name" maxLength={60} className="h-[46px] px-4 border-[1.5px] border-transparent rounded-full bg-white text-[15px] font-bold" />
                        {isPersonal && <input value={personUser} onChange={e => setPersonUser(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPerson()} placeholder="@username (optional)" aria-label="Their username" autoCapitalize="none" className="h-[46px] px-4 border-[1.5px] border-transparent rounded-full bg-white text-[15px] font-bold" />}
                        <Button variant="band" height={44} wide onClick={addPerson} disabled={!personName.trim() && !(isPersonal && personUser.trim())}>Add</Button>
                        <span className="text-[13px] font-semibold leading-[1.45] text-[#5E6A60]">{isPersonal ? 'A name is enough, no account needed. Add their username too to link them to their account. Nobody is notified or shown anything; it just lets People show what is between you in Personal, kept apart from your real balances.' : "For a friend who hasn't signed up yet. Just a name: no account, nobody is notified. Use them in expenses like anyone else."}</span>
                    </div>
                )}
                {isPersonal ? null : isOwner ? (
                    <motion.button {...tapFlat} onClick={() => setConfirm({ kind: 'delete' })} className="self-start px-1.5 py-1 text-[14.5px] font-extrabold text-coral">Delete group</motion.button>
                ) : (
                    <motion.button {...tapFlat} onClick={() => setConfirm({ kind: 'leave' })} className="self-start px-1.5 py-1 text-[14.5px] font-extrabold text-coral">Leave group</motion.button>
                )}
            </div>
        </div>
    );
}
