import type { GroupState } from './state';
import type { GroupActions } from './actions';
import { Modal } from '../../lib/motion';
import ConfirmDialog from '../ConfirmDialog';
import { Button } from '../ui';

export default function GroupModals({ s, a }: { s: GroupState; a: GroupActions }) {
    const { group, confirm, setConfirm, settling, pbOpen, setPbOpen, pbEditId, pbFrom, pbTo, pbAmount, setPbAmount, shownConfirm, changePayback, pbValid, savePayback, handleConfirm, who, confirmText, labelCls2 } = { ...s, ...a };
    return (
    <>
        <ConfirmDialog open={!!confirm} title={shownConfirm ? confirmText[shownConfirm.kind].title : ''} body={shownConfirm ? confirmText[shownConfirm.kind].body : ''} confirmLabel={shownConfirm ? confirmText[shownConfirm.kind].action : ''} onConfirm={handleConfirm} onClose={() => setConfirm(null)} />

        <Modal open={pbOpen} onClose={() => setPbOpen(false)}>
            <h2 className="m-0 mb-1 text-xl font-black text-ink">{pbEditId ? 'Edit transfer' : 'Record a transfer'}</h2>
            <p className="m-0 mb-4 text-sm font-semibold text-muted">Evens out what two members of {group.name} owe each other. It doesn't move money.{pbEditId && ' Changes are logged under Activity.'}</p>
            <div className="flex flex-col gap-3">
                <label className={labelCls2}>Who paid
                    <select value={pbFrom} onChange={e => changePayback(e.target.value, pbTo)} className="h-[46px] px-4 border-[1.5px] border-line rounded-full bg-field text-[15px] font-bold text-ink">
                        {group.members.map(m => <option key={m.user_id} value={m.user_id}>{who(m.user_id)}</option>)}
                    </select>
                </label>
                <label className={labelCls2}>Who received
                    <select value={pbTo} onChange={e => changePayback(pbFrom, e.target.value)} className="h-[46px] px-4 border-[1.5px] border-line rounded-full bg-field text-[15px] font-bold text-ink">
                        {group.members.map(m => <option key={m.user_id} value={m.user_id}>{who(m.user_id)}</option>)}
                    </select>
                </label>
                <label className={labelCls2}>Amount
                    <span className="flex items-center gap-1 h-[46px] px-4 border-[1.5px] border-line rounded-full bg-field focus-within:border-[oklch(0.55_0.1_158)]">
                        <span className="font-black text-ghost">$</span>
                        <input aria-label="Transfer amount" inputMode="decimal" value={pbAmount} onChange={e => setPbAmount(e.target.value)} placeholder="0.00" className="flex-1 min-w-0 border-0 bg-transparent text-[15px] font-extrabold" />
                    </span>
                </label>
                {pbFrom && pbFrom === pbTo && <span role="alert" className="text-[13.5px] font-bold text-coral-strong">Pick two different people.</span>}
            </div>
            <div className="flex gap-3 mt-5">
                <Button variant="secondary" wide height={44} onClick={() => setPbOpen(false)}>Cancel</Button>
                <Button wide height={44} disabled={settling || !pbValid} onClick={savePayback}>{pbEditId ? 'Save changes' : 'Save transfer'}</Button>
            </div>
        </Modal>
    </>
    );
}
