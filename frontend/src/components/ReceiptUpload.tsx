import React, { useMemo, useRef, useState } from 'react';
import { motion, Pop, enter, tapFlat } from '../lib/motion';
import { useAppData } from '../lib/appData';
import { importReceiptIntoSession } from '../lib/api';
import { RECEIPT_PROMPT, EXAMPLE_RECEIPT_JSON, ParsedReceipt, parseReceiptJson } from '../lib/receiptImport';
import { fmt } from '../lib/people';
import { Button, Card, Icon } from './ui';

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
        } catch (e: any) {
            return { err: /valid JSON/i.test(e.message) ? "That doesn't look like receipt JSON yet. Make sure you copied the whole reply." : (e.message as string) };
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
        } catch (err: any) {
            setError(err.message || 'Failed to import the receipt');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-[980px] mx-auto flex flex-col gap-7">
            <div className="flex flex-col gap-2">
                {!narrow && (
                    <motion.button {...tapFlat} onClick={onBack} className="self-start flex items-center gap-1 text-[13px] text-muted hover:text-ink">
                        <Icon name="arrow_back" size={16} />Back to receipt
                    </motion.button>
                )}
                <h1 className="m-0 text-[28px] font-semibold tracking-title">Import from JSON</h1>
                <p className="m-0 text-[15px] leading-normal text-muted max-w-[540px]">Your AI chat of choice reads the photo; Splitpot does the splitting. The items are added to this receipt, and nothing is uploaded here.</p>
            </div>

            <div className="flex flex-wrap gap-6 items-start">
                <div className="flex-[999_1_400px] min-w-0 flex flex-col gap-3.5">
                    <motion.div {...enter(0)}>
                        <Card className="flex gap-4 p-5">
                            <span className="w-[26px] h-[26px] rounded-full bg-ink text-white grid place-items-center text-[13px] font-semibold shrink-0">1</span>
                            <div className="flex-1 flex flex-col gap-3">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[15px] font-semibold">Copy the prompt</span>
                                    <span className="text-sm leading-normal text-muted">Paste it into ChatGPT, Claude or Gemini along with a photo of your receipt.</span>
                                </div>
                                <Button variant="secondary" height={38} className="self-start" onClick={copyPrompt}>
                                    <Icon name={copied ? 'check' : 'content_copy'} size={18} />{copied ? 'Copied' : 'Copy prompt'}
                                </Button>
                            </div>
                        </Card>
                    </motion.div>
                    <motion.div {...enter(1)}>
                        <Card className="flex gap-4 p-5">
                            <span className="w-[26px] h-[26px] rounded-full bg-ink text-white grid place-items-center text-[13px] font-semibold shrink-0">2</span>
                            <div className="flex-1 min-w-0 flex flex-col gap-3">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[15px] font-semibold">Paste what it sends back</span>
                                    <span className="text-sm leading-normal text-muted">Extra chatter around the JSON is fine. We'll find it.</span>
                                </div>
                                <textarea
                                    value={json}
                                    onChange={e => { setJson(e.target.value); setError(''); }}
                                    rows={9}
                                    spellCheck={false}
                                    aria-label="Receipt JSON"
                                    placeholder={'{ "store": "Corner Market", "items": [ … ] }'}
                                    className="w-full p-3 border border-line rounded-[10px] bg-wash font-mono text-[12.5px] leading-[1.55] resize-y"
                                />
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="secondary" height={36} className="text-[13px] px-3" onClick={() => file.current?.click()}>
                                        <Icon name="upload_file" size={18} />Choose .json file
                                    </Button>
                                    <input ref={file} type="file" accept=".json,application/json,text/plain" className="hidden" onChange={handleFile} aria-label="Choose a .json file" />
                                    <Button variant="text" height={36} className="text-[13px] px-3" onClick={() => setJson(EXAMPLE_RECEIPT_JSON)}>Try an example</Button>
                                </div>
                                <Pop show={!!(parsed && 'err' in parsed)} className="text-[13px] text-coral-strong">{parsed && 'err' in parsed ? parsed.err : ''}</Pop>
                                <Pop show={!!error} className="text-[13px] text-coral-strong">{error}</Pop>
                            </div>
                        </Card>
                    </motion.div>
                </div>

                <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-3.5 min-[760px]:sticky min-[760px]:top-6">
                    <motion.div {...enter(2)}>
                        <Card className="p-[22px] flex flex-col gap-3.5 font-mono text-[13px]">
                            {receipt ? (
                                <div className="flex flex-col gap-3">
                                    <div className="flex flex-col items-center gap-0.5 pb-3 border-b border-dashed border-dash">
                                        <span className="text-sm font-medium">{receipt.store || 'Receipt'}</span>
                                        <span className="text-faint">{dateLabel(receipt.date)}</span>
                                    </div>
                                    {receipt.items.map((it, i) => (
                                        <div key={i} className="flex justify-between gap-3"><span>{it.name}</span><span>{fmt(it.price)}</span></div>
                                    ))}
                                    <div className="border-t border-dashed border-dash pt-3 flex flex-col gap-1.5">
                                        <div className="flex justify-between text-muted"><span>Tax</span><span>{fmt(receipt.tax)}</span></div>
                                        {receipt.tip > 0 && <div className="flex justify-between text-muted"><span>Tip</span><span>{fmt(receipt.tip)}</span></div>}
                                        <div className="flex justify-between font-medium text-sm"><span>Total</span><span>{fmt(subtotal + receipt.tax + receipt.tip)}</span></div>
                                        {receipt.skipped > 0 && <span className="text-coral-strong font-sans text-xs">{receipt.skipped} invalid line(s) will be skipped.</span>}
                                    </div>
                                </div>
                            ) : (
                                <div className="min-h-[220px] flex items-center justify-center text-center text-faint font-sans text-sm leading-normal px-3">
                                    Your receipt shows up here as soon as you paste it.
                                </div>
                            )}
                        </Card>
                    </motion.div>
                    <Button height={46} wide className="text-[15px]" disabled={!receipt || loading || !group} onClick={handleImport}>
                        {loading ? 'Importing…' : 'Add to receipt'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
