import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, Modal, tapFlat } from '../lib/motion';
import { Photo, addPhoto, listPhotos, removePhoto } from '../lib/api';
import { MAX_PHOTOS, shrinkPhoto } from '../lib/photos';
import { Icon } from './ui';
import { messageOf } from '../lib/errors';

const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Up to 3 reference photos (say, of the receipt) for an expense. Everyone in the group can see, add and remove. */
export default function ReceiptPhotos({ sessionId, groupId }: { sessionId: string; groupId: string }) {
    const [photos, setPhotos] = useState<Photo[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [viewing, setViewing] = useState<Photo | null>(null);
    const input = useRef<HTMLInputElement>(null);

    const load = useCallback(() => listPhotos(sessionId).then(setPhotos).catch(err => { setPhotos([]); setError(messageOf(err, 'Could not load photos')); }), [sessionId]);
    useEffect(() => { load(); }, [load]);

    const room = MAX_PHOTOS - (photos?.length ?? 0);

    const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (!files.length) return;
        setError('');
        setBusy(true);
        try {
            if (files.length > room) setError(`Only ${room} more photo${room === 1 ? '' : 's'} fit${room === 1 ? 's' : ''}, so the first ${room} were added.`);
            for (const file of files.slice(0, room)) {
                const blob = await shrinkPhoto(file);
                if (!OK_TYPES.includes(blob.type)) throw new Error('Use a JPEG, PNG or WebP photo.');
                await addPhoto(sessionId, groupId, blob, blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg');
            }
        } catch (err) {
            setError(messageOf(err, 'Could not add that photo'));
        } finally {
            setBusy(false);
            await load();
        }
    };

    const remove = async (photo: Photo) => {
        setError('');
        try { await removePhoto(photo); setViewing(null); await load(); }
        catch (err) { setError(messageOf(err, 'Could not remove that photo')); }
    };

    return (
        <div className="flex flex-col gap-3" aria-label="Reference photos">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-black">Photos <span className="font-bold text-faint">{photos?.length ?? 0} of {MAX_PHOTOS}</span></span>
                <motion.button
                    {...tapFlat}
                    type="button"
                    disabled={busy || room <= 0 || photos === null}
                    onClick={() => input.current?.click()}
                    className="h-[34px] pl-2.5 pr-3.5 flex items-center gap-1.5 rounded-full bg-soft text-[13.5px] font-extrabold text-ink disabled:opacity-50"
                ><Icon name="add_a_photo" size={18} />{busy ? 'Adding...' : 'Add photo'}</motion.button>
                <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/*" multiple hidden aria-label="Choose photos" onChange={onPick} />
            </div>
            {photos && photos.length > 0 ? (
                <div className="flex gap-2.5 flex-wrap">
                    {photos.map((p, i) => (
                        <div key={p.id} className="relative w-[88px] h-[88px]">
                            <button type="button" onClick={() => setViewing(p)} aria-label={`Open photo ${i + 1}`} className="w-full h-full rounded-[16px] overflow-hidden border border-edge bg-soft p-0">
                                <img src={p.url} alt={`Reference photo ${i + 1}`} className="w-full h-full object-cover" />
                            </button>
                        </div>
                    ))}
                </div>
            ) : photos && (
                <span className="text-[13.5px] font-semibold text-muted leading-[1.45]">Add a picture of the receipt to keep for reference. It isn't read or split.</span>
            )}
            {error && <span className="text-[13.5px] font-bold text-coral-strong">{error}</span>}

            <Modal open={!!viewing} onClose={() => setViewing(null)}>
                {viewing && (
                    <div className="flex flex-col gap-4">
                        <img src={viewing.url} alt="Reference photo" className="w-full max-h-[65vh] object-contain rounded-[16px] bg-soft" />
                        <div className="flex gap-3">
                            <button type="button" onClick={() => setViewing(null)} className="flex-1 h-11 rounded-full bg-soft text-sm font-extrabold">Close</button>
                            <button type="button" onClick={() => remove(viewing)} className="flex-1 h-11 rounded-full bg-coral-tint text-coral-on text-sm font-extrabold">Remove photo</button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
