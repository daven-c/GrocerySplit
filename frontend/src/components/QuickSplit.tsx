import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, MotionConfig, Pop, tapFlat } from '../lib/motion';
import { supabase } from '../lib/supabase';
import {
    QuickSplit as QuickSplitData, addQuickItems, assignQuickItem, deleteQuickItem, deleteQuickSplit, getQuickSplit, joinQuickSplit,
    claimQuickSplit, lockQuickSplit, recall, remember, removeQuickPerson, renameQuickSplit, setQuickAssigned, setQuickSplit, updateQuickItem,
} from '../lib/quickSplit';
import { computeSplit } from '../lib/calc';
import { RECEIPT_PROMPT, parseReceiptJson } from '../lib/receiptImport';
import { HUES, fmt, toneFor } from '../lib/people';
import { Avatar, Button, Card, Icon, Logo, inputCls } from './ui';
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

export default function QuickSplit({ token }: { token: string }) {
    const [data, setData] = useState<QuickSplitData | null>(null);
    const [missing, setMissing] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [me, setMe] = useState<string | undefined>(() => recall(token).me);
    const [ownerKey, setOwnerKey] = useState<string | undefined>(() => recall(token).ownerKey);
    const [memberKey, setMemberKey] = useState<string | undefined>(() => recall(token).memberKey);
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
        try {
            const d = await getQuickSplit(token);
            if (!alive.current) return;
            if (!d) setMissing(true);
            else if (busy.current === 0) setData(d);
        } catch (err: any) {
            if (alive.current && busy.current === 0) setError(err.message || 'Could not load this split.');
        }
    }, [token]);

    useEffect(() => {
        alive.current = true;
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
    }, [token, load]);

    useEffect(() => {
        document.title = data ? `${data.title} · Splitpot` : 'Splitpot';
    }, [data?.title]);

    /** Apply a change on screen right away, send it, then take the server's version. */
    const act = async (optimistic: ((d: QuickSplitData) => QuickSplitData) | null, send: () => Promise<unknown>) => {
        setError('');
        busy.current++;
        if (optimistic) setData(d => (d ? optimistic(d) : d));
        try { await send(); }
        catch (err: any) { setError(err.message || 'That did not save.'); }
        finally { busy.current--; }
        if (busy.current === 0) await load();
    };

    const locked = !!data?.locked;
    const isOwner = !!ownerKey || (signedIn && !!data?.is_owner);
    const joined = !!data && !!me && data.people.includes(me);
    const ok = ownerKey ?? null; // what the owner's calls carry (null when signed in as the owning account)
    // The split itself (items, prices, tax, tip, who paid, who is on it) is the owner's. Everyone else can only tap
    // items onto or off THEMSELVES; the database enforces both, this just keeps the page honest.
    const canManage = isOwner && !locked;
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
        try {
            if (!existing) {
                const key = await joinQuickSplit(token, n);
                remember(token, { me: n, memberKey: key });
                setMemberKey(key);
            } else {
                remember(token, { me: n });
            }
            setMe(n);
            setNameInput('');
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
            setTimeout(() => setNotice(''), 2000);
        } catch { setError('Could not copy. Select it and copy by hand.'); }
    };

    const addItem = () => {
        const name = newItem.trim();
        if (!name || !data) return;
        const price = money(newPrice);
        setNewItem('');
        setNewPrice('');
        void act(null, () => addQuickItems(token, [{ name, price }], ok));
    };

    const importJson = () => {
        try {
            const r = parseReceiptJson(json);
            setJson('');
            setShowJson(false);
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
                    <a href="/" className="font-semibold text-ink underline underline-offset-2">Go to Splitpot</a>
                </Card>
            </Shell>
        );
    }
    if (!data || !result) return <Shell><p className="text-center text-faint py-16 animate-pulse">{error || 'Loading split…'}</p></Shell>;

    const link = `${window.location.origin}/s/${token}`;
    const ownerLink = `${link}#owner=${ownerKey}`;

    return (
        <Shell>
            <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                        {/* Only the owner can rename it, even when it is locked. */}
                        <Field label="Split title" value={data.title} disabled={!isOwner} placeholder="Name this split" onCommit={v => act(d => ({ ...d, title: v.trim() || d.title }), () => renameQuickSplit(token, ownerKey ?? null, v))}
                            className="m-0 px-0 py-0.5 border-0 border-b border-dashed border-dash enabled:focus:border-ink bg-transparent text-[30px] font-semibold tracking-title w-full max-w-[460px] disabled:border-transparent" />
                        {isOwner && <span className="text-xs text-faint">Tap the title to rename it</span>}
                        <span className="text-sm text-muted">Anyone with this link can edit it · expires {new Date(data.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} if unused</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[13px] text-faint">Total</span>
                        <span className="text-[34px] font-semibold tracking-[-0.03em]">{fmt(grand)}</span>
                    </div>
                </div>

                <Card className="p-4 flex flex-col gap-3">
                    <div className="flex flex-wrap gap-2 items-center">
                        <input readOnly aria-label="Share link" value={link} onFocus={e => e.currentTarget.select()} className={`${inputCls} flex-1 min-w-[220px] text-sm font-mono`} />
                        <Button height={42} className="px-4" onClick={() => copy(link, 'Link')}><Icon name="link" size={18} />Copy link</Button>
                    </div>
                    {isOwner && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
                            <motion.button {...tapFlat} onClick={() => act(d => ({ ...d, locked: !d.locked }), () => lockQuickSplit(token, ownerKey ?? null, !locked))} className="font-semibold text-ink underline underline-offset-2">
                                {locked ? 'Unlock so people can edit again' : 'Lock so nobody can change it'}
                            </motion.button>
                            {ownerKey && <motion.button {...tapFlat} onClick={() => copy(ownerLink, 'Owner link')} className="text-muted underline underline-offset-2">Copy owner link (for another device)</motion.button>}
                            <motion.button {...tapFlat} onClick={() => setConfirmDelete(true)} className="text-coral underline underline-offset-2">Delete</motion.button>
                        </div>
                    )}
                    {confirmDelete && (
                        <div role="alertdialog" aria-label="Delete this split" className="flex flex-wrap items-center gap-3 p-3 rounded-[10px] bg-coral-tint text-coral-on text-sm">
                            <span className="flex-1 min-w-[200px]">Delete this split for everyone? This can't be undone.</span>
                            <Button variant="secondary" height={34} className="px-3" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                            <Button height={34} className="px-3 !bg-coral-strong" onClick={async () => { try { await deleteQuickSplit(token, ownerKey ?? null); window.location.assign('/'); } catch (err: any) { setError(err.message); } }}>Delete</Button>
                        </div>
                    )}
                </Card>

                <Pop show={!!error} className="px-3 py-2.5 rounded-[10px] bg-coral-tint text-coral-on text-[13px]">{error}</Pop>
                <Pop show={!!notice} className="px-3 py-2.5 rounded-[10px] bg-green-tint text-green-on text-[13px]">{notice}</Pop>
                {locked && (
                    <div role="status" className="flex items-center gap-2 px-3.5 py-3 rounded-[10px] bg-surface text-sm text-body">
                        <Icon name="lock" size={18} />The owner locked this split, so it is read-only for now.
                    </div>
                )}

                {!joined && !locked && (
                    <Card className="p-5 flex flex-col gap-3.5">
                        <span className="text-[17px] font-semibold">Who are you?</span>
                        {isOwner && data.people.length > 0 && (
                            <div className="flex flex-col gap-2">
                                <span className="text-[13px] text-muted">You own this split, so you can act as anyone on it.</span>
                                <div className="flex flex-wrap gap-2">
                                    {data.people.map(p => (
                                        <motion.button key={p} {...tapFlat} onClick={() => join(p, true)} className="h-9 px-3.5 rounded-full border border-line bg-white text-sm font-semibold hover:bg-wash">I'm {p}</motion.button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="flex flex-col gap-2">
                            <span className="text-[13px] text-muted">{data.people.length > 0 ? 'Add your name to pick your items. Each name can only be used once, and only you can change your own picks on this device.' : 'Add your name to start. Everyone else adds theirs when they open the link.'}</span>
                            <div className="flex gap-2">
                                <input aria-label="Your name" value={nameInput} maxLength={30} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && join(nameInput, false)} placeholder="Your name" className={`${inputCls} flex-1 min-w-0`} />
                                <Button height={42} className="px-[18px]" disabled={!nameInput.trim()} onClick={() => join(nameInput, false)}>Join</Button>
                            </div>
                        </div>
                    </Card>
                )}

                {joined && (
                    <div className="flex items-center gap-2 text-sm text-muted">
                        You're <strong className="text-ink">{me}</strong>
                        <button type="button" onClick={() => { remember(token, { me: '' }); setMe(undefined); }} className="underline underline-offset-2">not you?</button>
                    </div>
                )}

                {data.people.length > 0 && (
                    <Card className="px-5 py-4">
                        <label className="flex items-center justify-between gap-3 text-sm text-body">
                            <span className="flex items-center gap-2.5">
                                {data.paid_by && tones[data.paid_by] && <Avatar name={data.paid_by} tone={tones[data.paid_by]} size={28} />}
                                Paid by
                            </span>
                            <select aria-label="Paid by" disabled={!canManage} value={data.paid_by ?? ''} onChange={e => act(d => ({ ...d, paid_by: e.target.value || null }), () => setQuickSplit(token, { paid_by: e.target.value }, ok))} className="h-[34px] px-2.5 border border-line rounded-lg bg-white text-sm font-semibold text-ink">
                                <option value="">Nobody picked</option>
                                {data.people.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </label>
                    </Card>
                )}

                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[17px] font-semibold">Items · {fmt(subtotal)}</span>
                        {canManage && <motion.button {...tapFlat} onClick={() => setShowJson(s => !s)} className="text-[13px] font-semibold text-body hover:text-ink underline underline-offset-[3px]">{showJson ? 'Hide import' : 'Import from JSON'}</motion.button>}
                    </div>

                    {showJson && canManage && (
                        <Card className="p-4 flex flex-col gap-2.5">
                            <span className="text-[13px] text-muted">Give any AI chat a photo of the receipt along with this prompt, then paste what it answers.</span>
                            <div><Button variant="secondary" height={34} className="px-3" onClick={() => copy(RECEIPT_PROMPT, 'Prompt')}>Copy prompt</Button></div>
                            <textarea aria-label="Receipt JSON" value={json} onChange={e => setJson(e.target.value)} rows={5} placeholder="Paste the JSON here" className="w-full p-3 border border-line rounded-[10px] bg-white font-mono text-xs" />
                            <div><Button height={38} className="px-4" disabled={!json.trim()} onClick={importJson}>Add these items</Button></div>
                        </Card>
                    )}

                    {!isOwner && !locked && joined && data.items.length > 0 && <span className="text-[13px] text-muted">Tap your own name under each item you had. Only the owner can change items or other people's picks.</span>}
                    {data.items.length === 0 && <Card className="p-5 text-sm text-faint">{isOwner ? 'No items yet. Add what was ordered, or import a receipt.' : 'No items yet. The owner of this split adds them.'}</Card>}
                    {data.items.map(it => (
                        <Card key={it.id} className="p-3.5 flex flex-col gap-2.5">
                            <div className="flex items-center gap-2">
                                <Field label={`Item name ${it.name}`} value={it.name} disabled={!canManage} onCommit={v => v.trim() && act(d => ({ ...d, items: d.items.map(x => x.id === it.id ? { ...x, name: v.trim() } : x) }), () => updateQuickItem(token, it.id, { name: v }, ok))}
                                    className="flex-1 min-w-0 h-9 px-2 border border-transparent hover:border-line focus:border-ink rounded-lg bg-transparent text-[15px] font-medium" />
                                <span className="font-mono text-faint">$</span>
                                <Field label={`Price of ${it.name}`} money value={it.price.toFixed(2)} disabled={!canManage} onCommit={v => act(d => ({ ...d, items: d.items.map(x => x.id === it.id ? { ...x, price: money(v) } : x) }), () => updateQuickItem(token, it.id, { price: money(v) }, ok))}
                                    className="w-[88px] h-9 px-2 border border-line rounded-lg text-right font-mono text-sm bg-white" />
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
                                            className={`h-8 px-3 rounded-full text-[13px] font-semibold border ${on ? 'border-solid' : 'bg-white text-body border-dash border-dashed'} disabled:opacity-60`}
                                            style={on ? { background: tones[p]?.bg, color: tones[p]?.fg, borderColor: tones[p]?.bg } : undefined}
                                        >{p}</motion.button>
                                    );
                                })}
                                {canManage && data.people.length > 1 && (
                                    <motion.button {...tapFlat} onClick={() => act(d => ({ ...d, items: d.items.map(x => x.id === it.id ? { ...x, assigned: it.assigned.length === d.people.length ? [] : [...d.people] } : x) }), () => setQuickAssigned(token, it.id, it.assigned.length === data.people.length ? [] : data.people, ok))}
                                        className="h-8 px-2 text-[13px] text-muted underline underline-offset-2">{it.assigned.length === data.people.length ? 'Nobody' : 'Everyone'}</motion.button>
                                )}
                                {it.assigned.length > 0 && <span className="ml-auto text-xs text-faint">{fmt(it.price / it.assigned.length)} each</span>}
                            </div>
                        </Card>
                    ))}

                    {canManage && (
                        <div className="flex gap-2">
                            <input aria-label="New item name" value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()} placeholder="Add an item" className="flex-1 min-w-0 h-[42px] px-3 border border-line rounded-[10px] bg-white text-[15px] text-ink" />
                            <input aria-label="New item price" inputMode="decimal" value={newPrice} onChange={e => setNewPrice(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()} placeholder="0.00" className="w-[104px] shrink-0 text-right font-mono h-[42px] px-3 border border-line rounded-[10px] bg-white text-[15px] text-ink" />
                            <Button height={42} className="px-[18px] shrink-0" disabled={!newItem.trim()} onClick={addItem}>Add</Button>
                        </div>
                    )}
                </div>

                <Card className="px-5 py-4 flex flex-col gap-3">
                    {([['tax', 'Tax'], ['tip', 'Tip']] as const).map(([k, label]) => (
                        <label key={k} className="flex items-center justify-between gap-3 text-sm text-body">{label}
                            <span className="flex items-center gap-1 font-mono">$
                                <Field label={label} money disabled={!canManage} value={data[k].toFixed(2)} onCommit={v => act(d => ({ ...d, [k]: money(v) }), () => setQuickSplit(token, { [k]: money(v) }, ok))}
                                    className="w-[96px] h-9 px-2 border border-line rounded-lg text-right text-sm bg-white" />
                            </span>
                        </label>
                    ))}
                </Card>

                <Card className="p-5 flex flex-col gap-3.5">
                    <span className="text-[15px] font-semibold">Who owes what</span>
                    {data.people.length === 0 ? <span className="text-sm text-faint">Nobody has joined yet.</span> : (
                        <div className="flex flex-col gap-3.5">
                            {data.people.map(p => {
                                const amt = totals.get(p) ?? 0;
                                const t = tones[p];
                                return (
                                    <div key={p} className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-2.5">
                                            <Avatar name={p} tone={t} size={28} />
                                            <span className="flex-1 min-w-0 flex flex-col">
                                                <span className={`truncate text-sm ${p === me ? 'font-semibold' : 'font-medium'}`}>{p}{p === me ? ' (you)' : ''}</span>
                                                <span className="text-xs text-faint">{data.paid_by === p ? 'paid the bill' : data.paid_by ? `owes ${data.paid_by}` : ''}</span>
                                            </span>
                                            <span className="font-mono text-sm font-medium">{fmt(amt)}</span>
                                            {canManage && (
                                                <motion.button {...tapFlat} aria-label={`Remove ${p}`} onClick={() => act(d => ({ ...d, people: d.people.filter(x => x !== p), items: d.items.map(it => ({ ...it, assigned: it.assigned.filter(x => x !== p) })) }), () => removeQuickPerson(token, p, ok))}
                                                    className="w-7 h-7 grid place-items-center rounded-full text-faint hover:bg-coral-tint hover:text-coral"><Icon name="close" size={16} /></motion.button>
                                            )}
                                        </div>
                                        <div className="h-[3px] ml-[38px] rounded-sm bg-surface">
                                            <motion.div className="h-full rounded-sm opacity-55" style={{ background: t.fg }} initial={false} animate={{ width: `${(amt / maxShare) * 100}%` }} transition={{ duration: 0.25 }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {result.unassignedSubtotal > 0 && <span className="text-[13px] text-muted">{fmt(result.unassignedSubtotal)} of items still need someone. Tax and tip are shared by what each person had.</span>}
                    <div className="border-t border-rule pt-3 flex justify-between font-semibold text-[15px]"><span>Total</span><span className="font-mono">{fmt(grand)}</span></div>
                </Card>

                <Card className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm font-semibold">Keep this in a group</span>
                        <span className="text-[13px] text-muted">{signedIn ? 'Turn this split into a receipt in one of your Splitpot groups.' : 'Sign in to Splitpot to turn this split into a receipt in one of your groups.'}</span>
                    </span>
                    {signedIn
                        ? <Button variant="secondary" height={38} className="px-3.5" onClick={() => setImportOpen(true)}>Import to a group</Button>
                        : <a href="/" className="h-[38px] px-3.5 inline-flex items-center rounded-[10px] border border-line text-sm font-semibold hover:bg-wash">Sign in</a>}
                </Card>
            </div>
            {importOpen && <QuickSplitImport data={data} onClose={() => setImportOpen(false)} />}
        </Shell>
    );
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <MotionConfig reducedMotion="user">
            <div className="min-h-screen bg-white text-ink font-sans">
                <header className="max-w-[760px] mx-auto px-5 py-5 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-3 min-w-0">
                        <a href="/" className="h-9 pl-2 pr-3.5 inline-flex items-center gap-1 rounded-full border border-line text-sm font-semibold text-ink hover:bg-wash shrink-0"><Icon name="arrow_back" size={18} />Home</a>
                        <a href="/" aria-label="Splitpot home" className="min-w-0"><Logo size={20} word={18} /></a>
                    </span>
                    <span className="text-[13px] text-faint text-right">Quick split · no account needed</span>
                </header>
                <main className="max-w-[760px] mx-auto px-5 pb-20">{children}</main>
            </div>
        </MotionConfig>
    );
}
