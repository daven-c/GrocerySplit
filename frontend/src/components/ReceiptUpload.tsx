import React, { useState } from 'react';
import axios from 'axios';

interface ReceiptUploadProps {
    onUploadComplete: () => void;
    onBack: () => void;
}

export default function ReceiptUpload({ onUploadComplete, onBack }: ReceiptUploadProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setError('');
        const formData = new FormData();
        formData.append('receipt', file);

        try {
            await axios.post('/api/scan-receipt', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            onUploadComplete();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to upload receipt');
        } finally {
            setLoading(false);
        }
    };

    const handleMockData = async () => {
        setLoading(true);
        setError('');
        try {
            await axios.post('/api/scan-receipt-json', {
                items: [
                    { name: "Organic Honey Crisp", price: 12.40 },
                    { name: "Artisanal Oat Milk", price: 7.50 },
                    { name: "Free Range Eggs", price: 5.99 },
                    { name: "Avocados (Bag)", price: 8.25 }
                ]
            });
            onUploadComplete();
        } catch (err: any) {
            setError('Failed to load mock data');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-slate-50 font-body text-slate-900 min-h-screen">
            <header className="sticky top-0 w-full z-50 bg-white border-b border-slate-200">
                <div className="flex items-center justify-between px-6 py-4 max-w-2xl mx-auto">
                    <div className="flex items-center gap-3">
                        <button onClick={onBack} className="text-slate-500 hover:text-slate-900 transition-colors active:scale-95">
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                        <h1 className="font-headline font-bold text-lg text-slate-900">Upload Receipt</h1>
                    </div>
                </div>
            </header>

            <main className="pt-8 px-6 max-w-2xl mx-auto space-y-8">
                <div className="text-center mt-6">
                    <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-6">
                        <span className="material-symbols-outlined text-4xl text-slate-400">document_scanner</span>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">Scan Your Grocery Bill</h2>
                    <p className="text-slate-500 mt-2 text-sm max-w-[280px] mx-auto">Upload a clear photo of your receipt and let the AI extract all the items instantly.</p>
                </div>

                {error && (
                    <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm text-center">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    <label className="flex items-center justify-center w-full h-16 bg-slate-900 text-white font-bold rounded-xl cursor-pointer hover:bg-slate-800 transition-all shadow-sm active:scale-[0.98]">
                        {loading ? 'Processing...' : (
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined">photo_camera</span>
                                <span>Upload Image</span>
                            </div>
                        )}
                        <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={loading} />
                    </label>

                    <div className="relative flex items-center justify-center py-4">
                        <div className="h-px w-full bg-slate-200 absolute"></div>
                        <span className="bg-slate-50 px-4 text-xs font-semibold text-slate-400 uppercase tracking-widest relative">Or</span>
                    </div>

                    <button 
                        onClick={handleMockData} disabled={loading}
                        className="w-full flex items-center justify-center gap-2 h-16 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm active:scale-[0.98]">
                        <span className="material-symbols-outlined">bug_report</span>
                        <span>Use Mock Data (Test Flow)</span>
                    </button>
                </div>
            </main>
        </div>
    );
}
