import { useEffect, useState } from 'react';
import { motion, tapFlat } from '../lib/motion';
import { MyQuickSplit, listMyQuickSplits } from '../lib/api';
import { isEnabled } from '../lib/flags';
import { startQuickSplit } from '../lib/quickSplit';
import { fmt } from '../lib/people';
import { Icon } from './ui';

/** The quick splits you made while signed in, until they expire. Starting one opens an unsaved draft. */
export default function QuickSplitList() {
    const [splits, setSplits] = useState<MyQuickSplit[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!isEnabled('quickSplit')) return;
        let cancelled = false;
        listMyQuickSplits().then(l => !cancelled && setSplits(l)).catch(() => !cancelled && setFailed(true)).finally(() => !cancelled && setLoaded(true));
        return () => { cancelled = true; };
    }, []);

    if (!isEnabled('quickSplit')) return null;
    return (
        <div className="flex flex-col gap-2.5" aria-label="Your quick splits">
            <div className="flex items-center justify-between px-1.5">
                <span className="text-[17px] font-black">Your quick splits</span>
                <motion.button {...tapFlat} onClick={startQuickSplit} className="h-[34px] pl-2 pr-3 flex items-center gap-1 rounded-full bg-soft text-[13.5px] font-extrabold text-ink"><Icon name="bolt" size={17} />New</motion.button>
            </div>
            {splits.map(q => (
                <a key={q.token} href={`/s/${q.token}`} className="flex flex-col gap-3 p-4 rounded-[22px] bg-mint hover:bg-[oklch(0.95_0.04_158)] transition-colors text-ink no-underline">
                    <span className="flex justify-between items-start gap-2.5"><span className="text-base font-black flex items-center gap-1.5">{q.locked && <Icon name="lock" fill size={16} />}{q.title}</span><span className="text-base font-black">{fmt(q.total)}</span></span>
                    <span className="text-[12.5px] font-bold text-[#5E6A60]">{q.people} {q.people === 1 ? 'person' : 'people'} · {q.items} {q.items === 1 ? 'item' : 'items'} · expires {new Date(q.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </a>
            ))}
            {failed && <span role="alert" className="px-1.5 text-[13.5px] font-bold text-coral-strong">Couldn't load your quick splits. Reload to try again.</span>}
            {loaded && !failed && splits.length === 0 && <span className="px-1.5 text-[13.5px] font-semibold text-muted">None yet. Start one for a single bill, no account needed for the people you share it with.</span>}
            <span className="text-[12.5px] font-semibold text-faint leading-[1.5] px-1.5">Quick splits are shareable pages for one bill. Anyone with the link can join. They stay here until they expire after 30 days without activity.</span>
        </div>
    );
}
