import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, MotionConfig, Pop, tapFlat } from '../lib/motion';
import { supabase } from '../lib/supabase';
import {
    QuickSplit as QuickSplitData, addQuickItems, assignQuickItem, deleteQuickItem, deleteQuickSplit, getQuickSplit, joinQuickSplit,
    claimQuickSplit, createFromDraft, lockQuickSplit, reclaimQuickSplit, recall, remember, removeQuickPerson, renameQuickSplit, setQuickAssigned, setQuickSplit, updateQuickItem,
} from '../lib/quickSplit';
import { computeSplit } from '../lib/calc';
import { RECEIPT_PROMPT, parseReceiptJson } from '../lib/receiptImport';
import { HUES, fmt, toneFor } from '../lib/people';
import { Avatar, Button, Card, Icon, Logo, cellCls, inputCls, selectPillCls } from './ui';
import { Toaster, toast } from './Toast';
import QuickSplitImport from './QuickSplitImport';

const POLL_MS = 4000;
const money = (s: string) => Math.max(0, Math.round((parseFloat(s) || 0) * 100) / 100);

/** A text/number box that saves when you leave it (not on every keystroke) and follows the shared value otherwise. */
function Field({ value, onCommit, disabled, label, className = '', money: isMoney = false, placeholder }: {
    value: string; onCommit: (v: string) => void; disabled?: boolean; label: string; className?: string; money?: boolean; placeholder?: string;
}) {
    const [draft, setDraft] = useState<string | null>(null);
    const done = () => {
        if (draft !== null && draft !== value) onCommit(draft);
        setDraft(null);
    };
    return (
        <input
            aria-label={label}
            value={draft ?? value}
            inputMode={isMoney ? 'decimal' : undefined}
            disabled={disabled}
            placeholder={placeholder}
            onChange={e => setDraft(e.target.value)}
            onBlur={done}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className={className}
        />
    );
}

/** What a split looks like before it exists: the same page, held in memory only. */
const blankDraft = (): QuickSplitData => ({
    title: 'Dinner', tax: 0, tip: 0, paid_by: null, locked: false, version: 0, is_owner: true,
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), people: [], items: [],
});

/** `token` null = a draft: you set it up here and nothing is saved, or even created, until you press Create. */
export default function QuickSplit({ token: tokenProp }: { token: string | null }) {
    const draft = tokenProp === null;
    const token = tokenProp ?? '';
    const [creating, setCreating] = useState(false);
    const [data, setData] = useState<QuickSplitData | null>(() => (draft ? blankDraft() : null));
    const [missing, setMissing] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [me, setMe] = useState<string | undefined>(() => (draft ? undefined : recall(token).me));
    const [ownerKey, setOwnerKey] = useState<string | undefined>(() => (draft ? undefined : recall(token).ownerKey));
    const [memberKey, setMemberKey] = useState<string | undefined>(() => (draft ? undefined : recall(token).memberKey));
    const [nameInput, setNameInput] = useState('');
    const [newItem, setNewItem] = useState('');
    const [newPrice, setNewPrice] = useState('');
    const [showJson, setShowJson] = useState(false);
    const [json, setJson] = useState('');
    const [signedIn, setSignedIn] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const busy = useRef(0); // writes in flight: a poll must not overwrite what the person just did
    const alive = useRef(true);

    const load = useCallback(async () => {
        if (draft) return;
        try {
            const d = await getQuickSplit(token);
            if (!alive.current) return;
            if (!d) setMissing(true);
            else if (busy.current === 0) setData(d);
        } catch (err: any) {
            if (alive.current && busy.current === 0) setError(err.message || 'Could not load this split.');
        }
    }, [token, draft]);

    useEffect(() => {
        alive.current = true;
        if (draft) return () => { alive.current = false; };
        // The owner link carries the key in the #fragment, which is never sent to a server.
        const m = window.location.hash.match(/owner=([A-Za-z0-9]+)/);
        if (m) {
            remember(token, { ownerKey: m[1] });
            setOwnerKey(m[1]);
            window.history.replaceState(null, '', window.location.pathname);
        }
        void load();
        const tick = () => { if (document.visibilityState === 'visible') void load(); };
        const timer = setInterval(tick, POLL_MS);
        document.addEventListener('visibilitychange', tick);
        supabase.auth.getSession().then(({ data: s }) => {
            if (!alive.current) return;
            setSignedIn(!!s.session);
            // Signed in with the owner key: attach this split to the account so it is listed under Personal.
            const key = recall(token).ownerKey;
            if (s.session && key) claimQuickSplit(token, key).then(() => load()).catch(() => {});
        }).catch(() => {});
        return () => { alive.current = false; clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
    }, [token, load, draft]);

    useEffect(() => {
        document.title = data ? `${data.title} · Settled` : 'Settled';
    }, [data?.title]);

    // A draft that has something in it is thrown away if the page is left, so ask first (the browser shows its own prompt).
    const created = useRef(false);
    const draftHasContent = draft && !!data && (data.people.length > 0 || data.items.length > 0 || data.tax > 0 || data.tip > 0 || !!data.paid_by || data.title !== 'Dinner');
    useEffect(() => {
        if (!draftHasContent) return;
        const warn = (e: BeforeUnloadEvent) => { if (!created.current) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [draftHasContent]);

    /** Apply a change on screen right away, send it, then take the server's version. */
    const act = async (optimistic: ((d: QuickSplitData) => QuickSplitData) | null, send: () => Promise<unknown>) => {
        setError('');
        if (draft) { if (optimistic) setData(d => (d ? optimistic(d) : d)); return; }
        busy.current++;
        if (optimistic) setData(d => (d ? optimistic(d) : d));
        try { await send(); }
        catch (err: any) { setError(err.message || 'That did not save.'); }
        finally { busy.current--; }
        if (busy.current === 0) await load();
    };

    const locked = !!data?.locked;
    const isOwner = draft || !!ownerKey || (signedIn && !!data?.is_owner);
    const joined = !!data && !!me && data.people.includes(me);
    const ok = ownerKey ?? null; // what the owner's calls carry (null when signed in as the owning account)
    // The split itself (items, prices, tax, tip, who paid, who is on it) is the owner's. Everyone else can only tap
    // items onto or off THEMSELVES; the database enforces both, this just keeps the page honest.
    const canManage = isOwner && !locked;
    // Anyone who has joined (and holds their key) can also add items; editing or deleting them is the owner's.
    const canAdd = !locked && (isOwner || (joined && !!memberKey));
    const canTap = (person: string) => !locked && (isOwner || (joined && person === me && !!memberKey));

    const result = useMemo(() => (data ? computeSplit(data.items.map(i => ({ price: i.price, assigned_users: i.assigned })), data.people, data.tax, data.tip) : null), [data]);
    const totals = useMemo(() => new Map(result?.totals ?? []), [result]);
    // Each person keeps one color everywhere on the page, same palette as the rest of the app (by join order).
    const tones = useMemo(() => Object.fromEntries((data?.people ?? []).map((p, i) => [p, toneFor(HUES[i % HUES.length])])), [data?.people]);
    const subtotal = data ? data.items.reduce((a, i) => a + i.price, 0) : 0;
    const maxShare = Math.max(...(result?.totals ?? []).map(([, v]) => v), 0.01);
    const grand = data ? Math.round((subtotal + data.tax + data.tip) * 100) / 100 : 0;

    const join = async (name: string, existing: boolean) => {
        const n = name.trim();
        if (!n) return;
        setError('');
        if (draft) {
            if (!existing && data?.people.some(p => p.toLowerCase() === n.toLowerCase())) { setError('That name is taken.'); return; }
            if (!existing) setData(d => (d ? { ...d, people: [...d.people, n] } : d));
            setMe(n);
            setNameInput('');
            return;
        }
        try {
            if (!existing) {
                const key = await joinQuickSplit(token, n);
                remember(token, { me: n, memberKey: key });
                setMemberKey(key);
            } else if (isOwner) {
                remember(token, { me: n }); // the owner can act as anyone, no key needed
            } else {
                // Lost the session (or a new device)? Picking your own name again gives this device a fresh key.
                const key = await reclaimQuickSplit(token, n);
                remember(token, { me: n, memberKey: key });
                setMemberKey(key);
            }
            setMe(n);
            setNameInput('');
            toast(`Joined as ${n}`);
            await load();
        } catch (err: any) {
            setError(err.message || 'Could not join.');
            await load();
        }
    };

    const copy = async (text: string, what: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setNotice(`${what} copied.`);
            toast(`${what} copied`);
            setTimeout(() => setNotice(''), 2000);
        } catch { setError('Could not copy. Select it and copy by hand.'); }
    };

    const addItem = () => {
        const name = newItem.trim();
        if (!name || !data) return;
        const price = money(newPrice);
        setNewItem('');
        setNewPrice('');
        if (draft) { setData(d => (d ? { ...d, items: [...d.items, { id: `draft-${Date.now()}-${d.items.length}`, name, price, assigned: [] }] } : d)); return; }
        void act(null, () => addQuickItems(token, [{ name, price }], ok, memberKey));
    };

    const importJson = () => {
        try {
            const r = parseReceiptJson(json);
            setJson('');
            setShowJson(false);
            if (draft) {
                setData(d => (d ? {
                    ...d,
                    items: [...d.items, ...r.items.map((it, n) => ({ id: `draft-${Date.now()}-${d.items.length + n}`, name: it.name, price: it.price, assigned: [] as string[] }))],
                    tax: r.tax > 0 ? r.tax : d.tax, tip: r.tip > 0 ? r.tip : d.tip,
                } : d));
                return;
            }
            void act(null, async () => {
                await addQuickItems(token, r.items, ok);
                if (r.tax > 0 || r.tip > 0) await setQuickSplit(token, { ...(r.tax > 0 ? { tax: r.tax } : {}), ...(r.tip > 0 ? { tip: r.tip } : {}) }, ok);
            });
        } catch (err: any) { setError(err.message); }
    };

    if (missing) {
        return (
            <Shell>
                <Card className="p-8 flex flex-col gap-3 items-center text-center">
                    <h1 className="m-0 text-2xl font-semibold">This split isn't here</h1>
                    <p className="m-0 text-muted max-w-[420px]">The link may be wrong, the owner may have deleted it, or nobody touched it for 30 days and it expired.</p>
                    <a href="/" className="font-semibold text-ink underline underline-offset-2">Go to Settled</a>
                </Card>
            </Shell>
        );
    }
    if (!data || !result) return <Shell><p className="text-center text-faint py-16 animate-pulse">{error || 'Loading split…'}</p></Shell>;

    const create = async () => {
        setCreating(true);
        setError('');
        try {
            const t = await createFromDraft(data, me);
            created.current = true; // it is saved now, so leaving is fine
            window.location.assign(`/s/${t}`);
        } catch (err: any) {
            setError(err.message || 'Could not create the split.');
            setCreating(false);
        }
    };

    const link = `${window.location.origin}/s/${token}`;
    const ownerLink = `${link}#owner=${ownerKey}`;
    const dueNote = (n: number, only: string | null, price: number) => (n === 0 ? 'Nobody yet' : n === 1 ? `Just ${only}` : `${fmt(price / n)} each`);

    return (
        <Shell>
            <div className="flex flex-col gap-[18px]">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="flex-[1_1_280px] flex flex-col gap-1.5 min-w-0">
                        {/* Only the owner can rename it, even when it is locked. */}
                        <Field label="Split title" value={data.title} disabled={!isOwner} placeholder="Name this split" onCommit={v => act(d => ({ ...d, title: v.trim() || d.title }), () => renameQuickSplit(token, ownerKey ?? null, v))}
                            className="m-0 p-0 border-0 border-b-2 border-dashed border-line enabled:focus:border-[oklch(0.55_0.1_158)] bg-transparent text-[32px] font-black tracking-title w-full max-w-[440px] disabled:border-transparent" />
                        {isOwner && <span className="text-xs font-bold text-faint">Tap the title to rename it</span>}
                        {draft ? <span className="text-sm font-semibold text-muted">Not saved yet. Set it up, then create it to get a link.</span> : <span className="text-sm font-semibold text-muted">Anyone with this link can edit it · expires {new Date(data.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} if unused</span>}
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[13.5px] font-bold text-faint">Total</span>
                        <span className="text-4xl font-black tracking-[-0.03em] leading-[1.1]">{fmt(grand)}</span>
                    </div>
                </div>

                {draft && (
                    <div className="bg-mint rounded-[22px] p-4 flex flex-wrap items-center gap-3">
                        <span className="flex-[1_1_240px] flex flex-col gap-0.5 min-w-0">
                            <span className="text-[15.5px] font-black">Nothing is saved yet</span>
                            <span className="text-sm font-semibold text-body">Add the items and who had what here. The link only exists once you create it, and leaving this page throws the draft away.</span>
                        </span>
                        <Button variant="band" height={46} className="px-5 text-[15px]" disabled={creating} onClick={create}><Icon name="link" size={19} />{creating ? 'Creating...' : 'Create quick split'}</Button>
                    </div>
                )}
                {!draft && <div className="bg-mint rounded-[22px] p-4 flex flex-col gap-3">
                    <div className="flex flex-wrap gap-2">
                        <input readOnly aria-label="Share link" value={link} onFocus={e => e.currentTarget.select()} className="flex-[1_1_220px] min-w-0 h-[46px] px-4 rounded-full bg-white font-mono text-[13.5px] text-body border-0 overflow-hidden text-ellipsis" />
                        <Button variant="band" height={46} className="px-5 text-[15px]" onClick={() => copy(link, 'Link')}><Icon name="link" size={19} />Copy link</Button>
                    </div>
                    {isOwner && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13.5px] font-bold">
                            <motion.button {...tapFlat} onClick={() => act(d => ({ ...d, locked: !d.locked }), () => lockQuickSplit(token, ownerKey ?? null, !locked))} className="flex items-center gap-1 font-extrabold text-band-deep">
                                <Icon name={locked ? 'lock_open' : 'lock'} size={16} />{locked ? 'Unlock so people can edit again' : 'Lock so nobody can change it'}
                            </motion.button>
                            {ownerKey && <motion.button {...tapFlat} onClick={() => copy(ownerLink, 'Owner link')} className="text-body">Copy owner link (for another device)</motion.button>}
                            <motion.button {...tapFlat} onClick={() => setConfirmDelete(true)} className="text-coral">Delete</motion.button>
                        </div>
                    )}
                    {ownerKey && !signedIn && (
                        <p className="m-0 flex flex-wrap items-center gap-x-1.5 text-[13.5px] font-bold text-body">
                            <Icon name="cloud_off" size={16} />Sign in to keep this and manage it from any device.
                            <a href="/" className="font-extrabold text-ink underline underline-offset-2">Sign in</a>
                        </p>
                    )}
                    {confirmDelete && (
                        <div role="alertdialog" aria-label="Delete this split" className="flex flex-wrap items-center gap-3 p-3 pl-4 rounded-[22px] bg-coral-tint text-coral-on text-sm font-bold">
                            <span className="flex-1 min-w-[200px]">Delete this split for everyone? This can't be undone.</span>
                            <Button variant="white" height={36} className="px-3.5" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                            <Button height={36} className="px-3.5 !bg-coral-strong" onClick={async () => { try { await deleteQuickSplit(token, ownerKey ?? null); window.location.assign('/'); } catch (err: any) { setError(err.message); } }}>Delete</Button>
                        </div>
                    )}
                </div>}

                <Pop show={!!error} className="px-4 py-2.5 rounded-[22px] bg-coral-tint text-coral-on text-[13.5px] font-extrabold">{error}</Pop>
                <Pop show={!!notice} className="px-4 py-2.5 rounded-[22px] bg-green-tint text-green-on text-[13.5px] font-extrabold">{notice}</Pop>
                {locked && (
                    <div role="status" className="flex items-center gap-2.5 px-4 py-3.5 rounded-[18px] bg-soft text-[14.5px] font-bold text-body">
                        <Icon name="lock" size={20} />The owner locked this split, so it is read-only for now.
                    </div>
                )}

                {!joined && !locked && (
                    <Card className="p-5 flex flex-col gap-3.5">
                        <span className="text-lg font-black">Who are you?</span>
                        {data.people.length > 0 && (
                            <div className="flex flex-col gap-2">
                                <span className="text-[13.5px] font-semibold text-muted">{isOwner ? 'You own this split, so you can act as anyone on it.' : 'Already on the split? Tap your name to get back in.'}</span>
                                <div className="flex flex-wrap gap-2">
                                    {data.people.map(p => (
                                        <motion.button key={p} {...tapFlat} onClick={() => join(p, true)} className="h-9 px-3.5 rounded-full bg-soft text-sm font-extrabold hover:bg-[#EFEAE3]">I'm {p}</motion.button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="flex flex-col gap-2">
                            <span className="text-[13.5px] font-semibold text-muted">{data.people.length > 0 ? 'Not there? Add your name. Each name can only be used once.' : 'Add your name to start. Everyone else adds theirs when they open the link.'}</span>
                            <div className="flex gap-2">
                                <input aria-label="Your name" value={nameInput} maxLength={30} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && join(nameInput, false)} placeholder="Your name" className={`${inputCls} flex-1 min-w-0`} />
                                <Button height={46} className="px-[22px]" disabled={!nameInput.trim()} onClick={() => join(nameInput, false)}>Join</Button>
                            </div>
                        </div>
                    </Card>
                )}

                {(joined || data.people.length > 0) && (
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                        {joined ? (
                            <span className="text-[14.5px] font-semibold text-muted">
                                You're <strong className="font-extrabold text-ink">{me}</strong>{' · '}
                                <button type="button" onClick={() => { if (!draft) remember(token, { me: '' }); setMe(undefined); }} className="underline underline-offset-2">not you?</button>
                            </span>
                        ) : <span />}
                        {data.people.length > 0 && (
                            <label className="flex items-center gap-2.5 text-[14.5px] font-bold text-body">
                                {data.paid_by && tones[data.paid_by] && <Avatar name={data.paid_by} tone={tones[data.paid_by]} size={28} />}
                                Paid by
                                <select aria-label="Paid by" disabled={!canManage} value={data.paid_by ?? ''} onChange={e => act(d => ({ ...d, paid_by: e.target.value || null }), () => setQuickSplit(token, { paid_by: e.target.value }, ok))} className={selectPillCls}>
                                    <option value="">Nobody picked</option>
                                    {data.people.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </label>
                        )}
                    </div>
                )}

                <Card className="overflow-hidden">
                    <div className="flex items-center justify-between gap-3 pt-[18px] px-5 pb-1.5">
                        <span className="text-lg font-black">Items · {fmt(subtotal)}</span>
                        {canManage && <motion.button {...tapFlat} onClick={() => setShowJson(s => !s)} className="text-[13.5px] font-extrabold text-body underline underline-offset-[3px]">{showJson ? 'Hide import' : 'Import from JSON'}</motion.button>}
                    </div>

                    {showJson && canManage && (
                        <div className="mx-4 mb-3 p-4 rounded-[22px] bg-wash flex flex-col gap-2.5">
                            <span className="text-[13.5px] font-semibold text-muted">Give any AI chat a photo of the receipt along with this prompt, then paste what it answers.</span>
                            <div><Button variant="secondary" height={36} className="px-3.5 text-[13.5px]" onClick={() => copy(RECEIPT_PROMPT, 'Prompt')}>Copy prompt</Button></div>
                            <textarea aria-label="Receipt JSON" value={json} onChange={e => setJson(e.target.value)} rows={5} placeholder="Paste the JSON here" className="w-full p-3.5 border-[1.5px] border-line rounded-[18px] bg-field font-mono text-xs" />
                            <div><Button height={40} className="px-[18px] text-sm" disabled={!json.trim()} onClick={importJson}>Add these items</Button></div>
                        </div>
                    )}

                    {!isOwner && !locked && joined && data.items.length > 0 && <p className="m-0 px-5 pb-2 text-[13.5px] font-semibold text-muted">Tap your own name under each item you had, or add one that's missing. Only the owner can edit or delete items and change other people's picks.</p>}
                    {data.items.length === 0 && <p className="m-0 px-5 py-6 text-sm font-bold text-faint">{isOwner ? 'No items yet. Add what was ordered, or import a receipt.' : joined ? 'No items yet. Add what you had below.' : 'No items yet. Join with your name to add some.'}</p>}
                    {data.items.map(it => {
                        const n = it.assigned.length;
                        return (
                            <div key={it.id} className="px-5 py-3.5 flex flex-col gap-2.5 border-t border-rule">
                                <div className="flex items-center gap-2">
                                    <Field label={`Item name ${it.name}`} value={it.name} disabled={!canManage} onCommit={v => v.trim() && act(d => ({ ...d, items: d.items.map(x => x.id === it.id ? { ...x, name: v.trim() } : x) }), () => updateQuickItem(token, it.id, { name: v }, ok))}
                                        className="flex-1 min-w-0 h-9 px-2 border border-transparent hover:border-line focus:border-ink rounded-lg bg-transparent text-base font-extrabold" />
                                    <span className="text-faint font-bold">$</span>
                                    <Field label={`Price of ${it.name}`} money value={it.price.toFixed(2)} disabled={!canManage} onCommit={v => act(d => ({ ...d, items: d.items.map(x => x.id === it.id ? { ...x, price: money(v) } : x) }), () => updateQuickItem(token, it.id, { price: money(v) }, ok))}
                                        className={`w-[88px] ${cellCls}`} />
                                    {canManage && (
                                        <motion.button {...tapFlat} aria-label={`Delete ${it.name}`} onClick={() => act(d => ({ ...d, items: d.items.filter(x => x.id !== it.id) }), () => deleteQuickItem(token, it.id, ok))}
                                            className="w-8 h-8 grid place-items-center rounded-full text-faint hover:bg-coral-tint hover:text-coral"><Icon name="close" size={18} /></motion.button>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {data.people.map(p => {
                                        const on = it.assigned.includes(p);
                                        return (
                                            <motion.button
                                                key={p} {...tapFlat} disabled={!canTap(p)} aria-pressed={on} aria-label={`${p} had ${it.name}`}
                                                onClick={() => act(d => ({ ...d, items: d.items.map(x => x.id === it.id ? { ...x, assigned: on ? x.assigned.filter(a => a !== p) : [...x.assigned, p] } : x) }), () => assignQuickItem(token, it.id, p, !on, { memberKey, ownerKey: ok }))}
                                                className={`h-8 px-[13px] rounded-full text-[13.5px] font-extrabold border-[1.5px] ${on ? 'border-solid' : 'bg-white text-ghost border-dash border-dashed'} disabled:opacity-60`}
                                                style={on ? { background: tones[p]?.bg, color: tones[p]?.fg, borderColor: tones[p]?.bg } : undefined}
                                            >{p}</motion.button>
                                        );
                                    })}
                                    {canManage && data.people.length > 1 && (
                                        <motion.button {...tapFlat} onClick={() => act(d => ({ ...d, items: d.items.map(x => x.id === it.id ? { ...x, assigned: it.assigned.length === d.people.length ? [] : [...d.people] } : x) }), () => setQuickAssigned(token, it.id, it.assigned.length === data.people.length ? [] : data.people, ok))}
                                            className="h-8 px-3 rounded-full bg-soft text-[13px] font-extrabold text-body">{it.assigned.length === data.people.length ? 'Nobody' : 'Everyone'}</motion.button>
                                    )}
                                    <span className={`ml-auto text-[13px] font-bold ${n === 0 ? 'text-coral' : 'text-faint'}`}>{it.assigned.length > 0 ? `${fmt(it.price / n)} each` : dueNote(0, null, it.price)}</span>
                                </div>
                            </div>
                        );
                    })}

                    {canAdd && (
                        <div className="flex gap-2 py-3.5 px-4 border-t border-rule bg-field">
                            <input aria-label="New item name" value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()} placeholder="Add an item" className="flex-1 min-w-0 h-11 px-4 border-[1.5px] border-line rounded-full bg-white text-[15px] font-semibold text-ink" />
                            <input aria-label="New item price" inputMode="decimal" value={newPrice} onChange={e => setNewPrice(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()} placeholder="0.00" className="w-24 shrink-0 text-right h-11 px-3.5 border-[1.5px] border-line rounded-full bg-white text-[15px] font-bold text-ink" />
                            <Button height={44} className="px-[18px] shrink-0 text-[14.5px]" disabled={!newItem.trim()} onClick={addItem}>Add</Button>
                        </div>
                    )}
                </Card>

                <Card className="p-5 flex flex-col gap-4">
                    <span className="text-lg font-black">Who owes what</span>
                    {data.people.length === 0 ? <span className="text-sm font-bold text-faint">Nobody has joined yet.</span> : (
                        <div className="flex flex-col gap-4">
                            {data.people.map(p => {
                                const amt = totals.get(p) ?? 0;
                                const t = tones[p];
                                return (
                                    <div key={p} className="flex items-center gap-3">
                                        <Avatar name={p} tone={t} size={36} />
                                        <span className="flex-1 flex flex-col gap-[5px] min-w-0">
                                            <span className="flex justify-between gap-2"><span className={`text-[15px] truncate ${p === me ? 'font-black' : 'font-extrabold'}`}>{p}{p === me ? ' (you)' : ''}</span><span className="text-[15.5px] font-black">{fmt(amt)}</span></span>
                                            <span className="h-1.5 rounded-[3px] bg-soft"><motion.span className="block h-full rounded-[3px] opacity-50" style={{ background: t.fg }} initial={false} animate={{ width: `${(amt / maxShare) * 100}%` }} transition={{ duration: 0.25 }} /></span>
                                            <span className="text-[12.5px] font-bold text-faint">{data.paid_by === p ? 'paid the bill' : data.paid_by ? `owes ${data.paid_by}` : ' '}</span>
                                        </span>
                                        {canManage && (
                                            <motion.button {...tapFlat} aria-label={`Remove ${p}`} onClick={() => act(d => ({ ...d, people: d.people.filter(x => x !== p), items: d.items.map(it => ({ ...it, assigned: it.assigned.filter(x => x !== p) })) }), () => removeQuickPerson(token, p, ok))}
                                                className="w-7 h-7 grid place-items-center rounded-full text-faint hover:bg-coral-tint hover:text-coral shrink-0"><Icon name="close" size={16} /></motion.button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {result.unassignedSubtotal > 0 && <span className="text-[13.5px] font-bold text-coral">{fmt(result.unassignedSubtotal)} of items still need someone. Tax and tip are shared by what each person had.</span>}
                    <div className="border-t border-rule pt-3.5 flex flex-col gap-2.5 text-[15px] font-bold text-body">
                        {([['tax', 'Tax'], ['tip', 'Tip']] as const).map(([k, label]) => (
                            <label key={k} className="flex items-center justify-between gap-3">{label}
                                <span className="flex items-center gap-1">$
                                    <Field label={label} money disabled={!canManage} value={data[k].toFixed(2)} onCommit={v => act(d => ({ ...d, [k]: money(v) }), () => setQuickSplit(token, { [k]: money(v) }, ok))}
                                        className={`w-20 ${cellCls}`} />
                                </span>
                            </label>
                        ))}
                        <div className="flex justify-between text-[17px] font-black text-ink"><span>Total</span><span>{fmt(grand)}</span></div>
                    </div>
                </Card>

                {/* Only the person who made the split can save it to a group. */}
                {isOwner && !draft && (
                    <div className="flex flex-wrap items-center gap-3.5 py-[18px] px-5 rounded-[22px] bg-warm">
                        <span className="flex-[1_1_240px] flex flex-col gap-0.5 min-w-0">
                            <span className="text-[15.5px] font-black">Keep this in a group</span>
                            <span className="text-sm font-semibold text-[#6E655C]">{signedIn ? 'Turn this split into a receipt in one of your Settled groups.' : 'Sign in to Settled to turn this split into a receipt in one of your groups.'}</span>
                        </span>
                        {signedIn
                            ? <Button height={42} className="px-[18px] text-[14.5px]" onClick={() => setImportOpen(true)}>Import to a group</Button>
                            : <a href="/" className="h-[42px] px-[18px] inline-flex items-center rounded-full bg-ink text-white text-[14.5px] font-extrabold no-underline">Sign in</a>}
                    </div>
                )}
            </div>
            {importOpen && !draft && <QuickSplitImport data={data} onClose={() => setImportOpen(false)} />}
        </Shell>
    );
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <MotionConfig reducedMotion="user">
            <div className="min-h-screen bg-white text-ink font-sans">
                <header className="max-w-[780px] mx-auto p-5 flex items-center gap-3">
                    <a href="/" className="h-[38px] pl-2 pr-3.5 inline-flex items-center gap-1 rounded-full bg-soft text-sm font-extrabold text-ink no-underline shrink-0"><Icon name="arrow_back" size={19} />Home</a>
                    <a href="/" aria-label="Settled home" className="min-w-0 no-underline text-ink"><Logo size={20} word={18} /></a>
                    <span className="ml-auto text-[13px] font-bold text-faint text-right">Quick split · no account needed</span>
                </header>
                <main className="max-w-[780px] mx-auto px-5 pt-2 pb-20">{children}</main>
                <Toaster />
            </div>
        </MotionConfig>
    );
}
