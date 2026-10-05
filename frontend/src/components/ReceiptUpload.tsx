import React, { useMemo, useState } from 'react';
import { createSession, getGroup } from '../lib/api';
import { RECEIPT_PROMPT, EXAMPLE_RECEIPT_JSON, parseReceiptJson } from '../lib/receiptImport';
import { motion, FROM, AnimatePresence, Pop, enter, tap, tapFlat } from '../lib/motion';

interface ReceiptUploadProps {
    groupId: string;
    onImported: (sessionId: string) => void;
    onBack: () => void;
}

export default function ReceiptUpload({ groupId, onImported, onBack }: ReceiptUploadProps) {
    const [json, setJson] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    const parsed = useMemo(() => {
        if (!json.trim()) return null;
        try {
            return { ok: parseReceiptJson(json) };
        } catch (e: any) {
            return { err: e.message as string };
        }
    }, [json]);

    const copyPrompt = async () => {
        try {
            await navigator.clipboard.writeText(RECEIPT_PROMPT);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            setError('Could not access the clipboard. Select the prompt text below and copy it manually.');
        }
    };

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) setJson(await file.text());
        e.target.value = '';
    };

    const handleImport = async () => {
        if (!parsed || !('ok' in parsed) || !parsed.ok) return;
        const r = parsed.ok;
        setLoading(true);
        setError('');
        try {
            const group = await getGroup(groupId);
            const id = await createSession({
                groupId,
                participants: group.members.map(m => m.name),
                name: r.store || 'Grocery Trip',
                date: r.date,
                tax: r.tax,
                tip: r.tip,
                items: r.items,
            });
            onImported(id);
        } catch (err: any) {
            setError(err.message || 'Failed to import receipt');
        } finally {
            setLoading(false);
        }
    };

    const receipt = parsed && 'ok' in parsed ? parsed.ok : null;
    const subtotal = receipt ? receipt.items.reduce((a, i) => a + i.price, 0) : 0;

    return (
        <div className="bg-slate-50 font-body text-slate-900 min-h-screen">
            <header className="sticky top-0 w-full z-50 bg-white border-b border-slate-200">
                <div className="flex items-center justify-between px-6 py-4 max-w-2xl mx-auto">
                    <div className="flex items-center gap-3">
                        <motion.button {...tap} onClick={onBack} className="text-slate-500 hover:text-slate-900 transition-colors">
                            <span className="material-symbols-outlined">arrow_back</span>
                        </motion.button>
                        <h1 className="font-headline font-bold text-lg text-slate-900">Import Receipt</h1>
                    </div>
                </div>
            </header>

            <main className="pt-8 px-6 pb-16 max-w-2xl mx-auto space-y-8">
                <motion.section {...enter(0)} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                    <h2 className="font-bold text-slate-900"><span className="text-slate-400">1.</span> Copy the prompt</h2>
                    <p className="text-sm text-slate-500">Paste it into your favorite AI chat together with a photo of your receipt. It will reply with JSON.</p>
                    <motion.button {...tapFlat} onClick={copyPrompt} className="w-full flex items-center justify-center gap-2 h-12 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors">
                        <span className="material-symbols-outlined">{copied ? 'check' : 'content_copy'}</span>
                        {copied ? 'Copied!' : 'Copy prompt'}
                    </motion.button>
                    <details className="text-sm">
                        <summary className="cursor-pointer text-slate-500 font-semibold">View prompt</summary>
                        <pre className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl whitespace-pre-wrap text-xs text-slate-700 select-all">{RECEIPT_PROMPT}</pre>
                    </details>
                </motion.section>

                <motion.section {...enter(1)} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                    <h2 className="font-bold text-slate-900"><span className="text-slate-400">2.</span> Paste the JSON it returns</h2>
                    <textarea
                        value={json}
                        onChange={e => { setJson(e.target.value); setError(''); }}
                        placeholder={EXAMPLE_RECEIPT_JSON}
                        rows={10}
                        spellCheck={false}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono text-xs text-slate-900 focus:ring-2 focus:ring-slate-900 outline-none"
                    />
                    <div className="flex gap-3">
                        <label className="flex-1 flex items-center justify-center gap-2 h-11 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-xl cursor-pointer hover:bg-slate-50 active:scale-[0.98]">
                            <span className="material-symbols-outlined text-[18px]">upload_file</span>
                            Choose .json file
                            <input type="file" accept=".json,application/json,text/plain" className="hidden" onChange={handleFile} />
                        </label>
                        <motion.button {...tapFlat} onClick={() => setJson(EXAMPLE_RECEIPT_JSON)} className="flex-1 h-11 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-xl hover:bg-slate-50">
                            Try example
                        </motion.button>
                    </div>

                    <Pop show={!!(parsed && 'err' in parsed)} className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">{parsed && 'err' in parsed ? parsed.err : ''}</Pop>
                    <Pop show={!!error} className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">{error}</Pop>

                    <AnimatePresence>
                    {receipt && (
                        <motion.div initial={{ opacity: FROM, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }} style={{ overflow: 'hidden' }} className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-800 space-y-1">
                            <p className="font-bold">{receipt.store || 'Grocery Trip'}{receipt.date ? ` · ${receipt.date}` : ''}</p>
                            <p>{receipt.items.length} items · subtotal ${subtotal.toFixed(2)} · tax ${receipt.tax.toFixed(2)}{receipt.tip ? ` · tip $${receipt.tip.toFixed(2)}` : ''}</p>
                            {receipt.skipped > 0 && <p className="text-amber-700">{receipt.skipped} invalid line(s) will be skipped.</p>}
                        </motion.div>
                    )}
                    </AnimatePresence>

                    <motion.button {...tapFlat}
                        onClick={handleImport}
                        disabled={!receipt || loading}
                        className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl shadow-sm disabled:opacity-40 transition-colors">
                        {loading ? 'Importing...' : 'Import & split'}
                    </motion.button>
                </motion.section>
            </main>
        </div>
    );
}
