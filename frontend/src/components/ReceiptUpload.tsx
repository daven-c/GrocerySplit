import React, { useMemo, useRef, useState } from 'react';
import { motion, Pop, enter, tapFlat } from '../lib/motion';
import { useAppData } from '../lib/appData';
import { importReceiptIntoSession } from '../lib/api';
import { RECEIPT_PROMPT, EXAMPLE_RECEIPT_JSON, ParsedReceipt, parseReceiptJson } from '../lib/receiptImport';
import { fmt } from '../lib/people';
import { Button, Card, Icon } from './ui';
import { messageOf } from '../lib/errors';

interface ReceiptUploadProps {
    groupId: string;
    /** The receipt the items are added to. */
    sessionId: string;
    narrow: boolean;
    onImported: () => void;
    /** When set, the parsed receipt is handed back instead of being written (the editor keeps it as unsaved changes). */
    onParsed?: (receipt: ParsedReceipt) => void;
    onBack: () => void;
}

const dateLabel = (iso?: string) => (iso ? new Date(iso + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

export default function ReceiptUpload({ groupId, sessionId, narrow, onImported, onParsed, onBack }: ReceiptUploadProps) {
    const { groups, refresh } = useAppData();
    const group = groups.find(g => g.id === groupId);
    const [json, setJson] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const file = useRef<HTMLInputElement>(null);

    const parsed = useMemo(() => {
        if (!json.trim()) return null;
        try {
            return { ok: parseReceiptJson(json) };
        } catch (e) {
            const msg = messageOf(e, 'That did not read as a receipt.');
            return { err: /valid JSON/i.test(msg) ? "That doesn't look like receipt JSON yet. Make sure you copied the whole reply." : msg };
        }
    }, [json]);
    const receipt = parsed && 'ok' in parsed ? parsed.ok : null;
    const subtotal = receipt ? receipt.items.reduce((a, i) => a + i.price, 0) : 0;

    const copyPrompt = async () => {
        try {
            await navigator.clipboard.writeText(RECEIPT_PROMPT);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setError('Could not access the clipboard. Copy the prompt from the page source or try another browser.');
        }
    };

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) setJson(await f.text());
        e.target.value = '';
    };

    const handleImport = async () => {
        if (!receipt || !group) return;
        if (onParsed) return onParsed(receipt);
        setLoading(true);
        setError('');
        try {
            await importReceiptIntoSession(sessionId, { store: receipt.store, date: receipt.date, tax: receipt.tax, tip: receipt.tip, items: receipt.items });
            await refresh();
            onImported();
        } catch (err) {
            setError(messageOf(err, 'Failed to import the receipt'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-[1000px] mx-auto flex flex-col gap-6">
            <div className="flex flex-col gap-2.5">
                {!narrow && (
                    <motion.button {...tapFlat} onClick={onBack} className="self-start h-[34px] pl-2 pr-3.5 flex items-center gap-1 rounded-full bg-soft text-[13.5px] font-extrabold text-body">
                        <Icon name="arrow_back" size={17} />Back to receipt
                    </motion.button>
                )}
                <h1 className="m-0 text-[32px] font-black tracking-title">Scan a receipt</h1>
                <p className="m-0 text-base font-semibold leading-[1.45] text-muted max-w-[560px]">Your AI chat of choice reads the photo; Settled does the splitting. Nothing is uploaded here.</p>
            </div>

            <div className="flex flex-wrap gap-5 items-start">
                <div className="flex-[999_1_400px] min-w-0 flex flex-col gap-3.5">
                    <motion.div {...enter(0)}>
                        <Card className="flex gap-4 p-5">
                            <span className="w-[34px] h-[34px] rounded-full bg-[oklch(0.93_0.06_158)] text-[oklch(0.35_0.09_158)] grid place-items-center text-[15px] font-black shrink-0">1</span>
                            <div className="flex-1 flex flex-col gap-3">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[16.5px] font-black">Copy the prompt</span>
                                    <span className="text-[14.5px] font-semibold leading-[1.45] text-muted">Paste it into ChatGPT, Claude or Gemini along with a photo of your receipt.</span>
                                </div>
                                <Button variant="secondary" height={42} className="self-start pl-3.5 pr-[18px] text-[14.5px]" onClick={copyPrompt}>
                                    <Icon name={copied ? 'check' : 'content_copy'} size={18} />{copied ? 'Copied' : 'Copy prompt'}
                                </Button>
                            </div>
                        </Card>
                    </motion.div>
                    <motion.div {...enter(1)}>
                        <Card className="flex gap-4 p-5">
                            <span className="w-[34px] h-[34px] rounded-full bg-[oklch(0.93_0.06_158)] text-[oklch(0.35_0.09_158)] grid place-items-center text-[15px] font-black shrink-0">2</span>
                            <div className="flex-1 min-w-0 flex flex-col gap-3">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[16.5px] font-black">Paste what it sends back</span>
                                    <span className="text-[14.5px] font-semibold leading-[1.45] text-muted">Extra chatter around the JSON is fine. We'll find it.</span>
                                </div>
                                <textarea
                                    value={json}
                                    onChange={e => { setJson(e.target.value); setError(''); }}
                                    rows={9}
                                    spellCheck={false}
                                    aria-label="Receipt JSON"
                                    placeholder={'{ "store": "Corner Market", "items": [ … ] }'}
                                    className="w-full p-3.5 border-[1.5px] border-line rounded-[18px] bg-field font-mono text-[12.5px] leading-[1.55] resize-y"
                                />
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="secondary" height={40} className="text-sm pl-3 pr-4" onClick={() => file.current?.click()}>
                                        <Icon name="upload_file" size={18} />Choose a .json file
                                    </Button>
                                    <input ref={file} type="file" accept=".json,application/json,text/plain" className="hidden" onChange={handleFile} aria-label="Choose a .json file" />
                                    <Button variant="text" height={40} className="text-sm px-3 font-extrabold" onClick={() => setJson(EXAMPLE_RECEIPT_JSON)}>Try an example</Button>
                                </div>
                                <Pop show={!!(parsed && 'err' in parsed)} className="text-[13.5px] font-bold text-coral-strong">{parsed && 'err' in parsed ? parsed.err : ''}</Pop>
                                <Pop show={!!error} className="text-[13.5px] font-bold text-coral-strong">{error}</Pop>
                            </div>
                        </Card>
                    </motion.div>
                </div>

                <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-3.5 min-[760px]:sticky min-[760px]:top-6">
                    <motion.div {...enter(2)}>
                        <div className="bg-field border-[1.5px] border-dashed border-line rounded-[24px] p-[22px] flex flex-col gap-3.5 font-mono text-[13px] text-ink">
                            {receipt ? (
                                <div className="flex flex-col gap-3">
                                    <div className="flex flex-col items-center gap-0.5 pb-3 border-b border-dashed border-[#DCD3C7]">
                                        <span className="text-sm font-medium">{receipt.store || 'Receipt'}</span>
                                        <span className="text-faint">{dateLabel(receipt.date)}</span>
                                    </div>
                                    {receipt.items.map((it, i) => (
                                        <div key={i} className="flex justify-between gap-3"><span>{it.name}</span><span>{fmt(it.price)}</span></div>
                                    ))}
                                    <div className="border-t border-dashed border-[#DCD3C7] pt-3 flex flex-col gap-1.5">
                                        <div className="flex justify-between text-muted"><span>Tax</span><span>{fmt(receipt.tax)}</span></div>
                                        {receipt.tip > 0 && <div className="flex justify-between text-muted"><span>Tip</span><span>{fmt(receipt.tip)}</span></div>}
                                        <div className="flex justify-between font-medium text-sm"><span>Total</span><span>{fmt(subtotal + receipt.tax + receipt.tip)}</span></div>
                                        {receipt.skipped > 0 && <span className="text-coral-strong font-sans text-xs">{receipt.skipped} invalid line(s) will be skipped.</span>}
                                    </div>
                                </div>
                            ) : (
                                <div className="min-h-[220px] flex flex-col items-center justify-center gap-2.5 text-center text-faint font-sans text-[15px] font-bold leading-[1.45] px-3">
                                    <Icon name="receipt_long" size={32} className="text-[#CFC6BA]" />
                                    Your receipt shows up here as soon as you paste it.
                                </div>
                            )}
                        </div>
                    </motion.div>
                    <Button height={52} wide className="text-base" disabled={!receipt || loading || !group} onClick={handleImport}>
                        {loading ? 'Importing…' : 'Import and split'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
