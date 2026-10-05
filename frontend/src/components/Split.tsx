import React, { useState, useEffect, useMemo } from 'react';
import { getSession, getGroup, updateSession, addItem, updateItem, deleteItem, deleteSession, Item, Group } from '../lib/api';
import { computeSplit } from '../lib/calc';
import { motion, FROM, AnimatePresence, Modal, SegmentedTabs, AnimatedNumber, spring, tap, tapFlat } from '../lib/motion';

interface SplitProps {
    sessionId: string;
    onBack: () => void;
}

export default function Split({ sessionId, onBack }: SplitProps) {
    const [items, setItems] = useState<Item[]>([]);
    
    // session users
    const [users, setUsers] = useState<string[]>([]);
    
    // global network
    const [group, setGroup] = useState<Group | null>(null);

    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [editItemName, setEditItemName] = useState('');
    const [editItemPrice, setEditItemPrice] = useState('');
    
    // Session meta
    const [sessionName, setSessionName] = useState('');
    const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
    const [tax, setTax] = useState('');
    const [tip, setTip] = useState('');
    const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
    const [paidBy, setPaidBy] = useState('');
    const [initialSettings, setInitialSettings] = useState({ name: '', date: '', tax: '', tip: '', paidBy: '' });
    
    // Tabs & Search/Sort
    const [activeTab, setActiveTab] = useState<'items' | 'settings'>('items');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'name_a_z' | 'price_high' | 'price_low'>('name_a_z');
    const [assignMode, setAssignMode] = useState<'by_item' | 'by_person'>('by_item');
    const [activeAssignParticipant, setActiveAssignParticipant] = useState<string | null>(null);
    const [selectedGroupPreview, setSelectedGroupPreview] = useState<string>('');
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);
    const [confirmDeleteReceipt, setConfirmDeleteReceipt] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            const session = await getSession(sessionId);
            const g = await getGroup(session.group_id);
            setGroup(g);
            setItems(session.items);
            // Everyone in the group is on every receipt; keep the stored list in step with the group.
            const everyone = g.members.map(m => m.name);
            setUsers(everyone);
            if (everyone.length !== session.participants.length || everyone.some(n => !session.participants.includes(n))) {
                updateSession(sessionId, { participants: everyone }).catch(err => console.error('Participant sync failed', err));
            }
            setTotal(session.items.reduce((acc, i) => acc + i.price, 0));
            const savedTax = session.tax ? session.tax.toString() : '';
            const savedTip = session.tip ? session.tip.toString() : '';
            setSessionName(session.name);
            setSessionDate(session.session_date);
            const payer = session.paid_by ?? session.user_id ?? '';
            setPaidBy(payer);
            setTax(savedTax);
            setTip(savedTip);
            setInitialSettings({ name: session.name, date: session.session_date, tax: savedTax, tip: savedTip, paidBy: payer });
        } catch (err) {
            console.error("Failed to load session logic", err);
            flash('Failed to load receipt.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const flash = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    useEffect(() => {
        loadData();
    }, [sessionId]);

    const toggleAssign = async (itemId: string, userName: string, currentStatus: boolean) => {
        if (!users.includes(userName)) return; // Only session users can be assigned
        const item = items.find(i => i.id === itemId);
        if (!item) return;
        const next = currentStatus ? item.assigned_users.filter(u => u !== userName) : [...item.assigned_users, userName];
        setItems(prev => prev.map(i => (i.id === itemId ? { ...i, assigned_users: next } : i)));
        try {
            await updateItem(sessionId, itemId, { assigned_users: next });
        } catch (err) {
            console.error(err);
            loadData(); // Rollback
        }
    };

    const handleEditStart = (item: any) => {
        setEditingItemId(item.id);
        setEditItemName(item.name);
        setEditItemPrice(item.price.toString());
    };

    const handleEditSave = async (itemId: string) => {
        const price = Math.max(0, Math.round((parseFloat(editItemPrice) || 0) * 100) / 100);
        const name = editItemName.trim() || 'Item';
        const oldItems = [...items];
        const nextItems = items.map(item => (item.id === itemId ? { ...item, name, price } : item));
        setItems(nextItems);
        setTotal(nextItems.reduce((acc, i) => acc + i.price, 0));
        setEditingItemId(null);

        try {
            await updateItem(sessionId, itemId, { name, price });
        } catch (err) {
            console.error(err);
            setItems(oldItems); // Rollback optimistic update
            loadData();
        }
    };

    const handleAddManualItem = async () => {
        try {
            const created = await addItem(sessionId, 'New Manual Item', 0);
            setItems(prev => [created, ...prev]);
            setEditingItemId(created.id);
            setEditItemName(created.name);
            setEditItemPrice('0');
        } catch (err) {
            console.error(err);
            flash('Failed to add item.', 'error');
        }
    };

    const confirmDeleteItem = async () => {
        if (!itemToDelete) return;
        const itemId = itemToDelete;
        setItemToDelete(null);

        const oldItems = [...items];
        const nextItems = items.filter(item => item.id !== itemId);
        setItems(nextItems);
        setTotal(nextItems.reduce((acc, i) => acc + i.price, 0));

        try {
            await deleteItem(sessionId, itemId);
        } catch (err) {
            console.error(err);
            setItems(oldItems);
            loadData();
        }
    };

    const assignAllToItem = async (itemId: string) => {
        const allUsers = [...users];
        setItems(prev => prev.map(item => item.id === itemId ? { ...item, assigned_users: allUsers } : item));
        try {
            await updateItem(sessionId, itemId, { assigned_users: allUsers });
        } catch (err) { console.error(err); loadData(); }
    };

    const handleDeleteReceipt = async () => {
        setConfirmDeleteReceipt(false);
        try {
            await deleteSession(sessionId);
            onBack();
        } catch (err) {
            console.error("Delete failed", err);
            flash('Failed to delete receipt.', 'error');
        }
    };

    const handleSaveSession = async () => {
        try {
            const taxAmt = Math.max(0, parseFloat(tax) || 0);
            const tipAmt = Math.max(0, parseFloat(tip) || 0);
            await updateSession(sessionId, {
                name: sessionName.trim() || 'Grocery Trip',
                session_date: sessionDate,
                tax: taxAmt,
                tip: tipAmt,
                participants: users,
                ...(paidBy ? { paid_by: paidBy } : {}),
            });
            setInitialSettings({ name: sessionName.trim(), date: sessionDate, tax, tip, paidBy });
            flash('Receipt saved successfully!', 'success');
        } catch (err) {
            console.error("Save failed", err);
            flash('Failed to save receipt.', 'error');
        }
    };

    const oweTotals = computeSplit(items, users, parseFloat(tax) || 0, parseFloat(tip) || 0).totals;
    const grandTotal = total + (parseFloat(tax) || 0) + (parseFloat(tip) || 0);
    const colorConfig = ["bg-green-100 text-green-700 ring-green-500", "bg-blue-100 text-blue-700 ring-blue-500", "bg-orange-100 text-orange-700 ring-orange-500", "bg-purple-100 text-purple-700 ring-purple-500", "bg-pink-100 text-pink-700 ring-pink-500"];

    const sortedItems = useMemo(() => {
        let filtered = items;
        if (searchQuery) {
            const lowerCaseQuery = searchQuery.toLowerCase();
            filtered = filtered.filter(item => item.name.toLowerCase().includes(lowerCaseQuery));
        }
        return [...filtered].sort((a, b) => {
            if (sortBy === 'price_high') return b.price - a.price;
            if (sortBy === 'price_low') return a.price - b.price;
            return a.name.localeCompare(b.name);
        });
    }, [items, searchQuery, sortBy]);

    const hasSettingsChanges = 
        sessionName.trim() !== initialSettings.name || 
        sessionDate !== initialSettings.date || 
        tax !== initialSettings.tax || 
        tip !== initialSettings.tip ||
        paidBy !== initialSettings.paidBy;

    if (loading) {
        return (
            <div className="bg-slate-50 min-h-screen flex items-center justify-center">
                <p className="text-slate-500 font-bold">Resuming session...</p>
            </div>
        );
    }

    return (
        <div className="bg-slate-50 font-body text-slate-900 min-h-screen pb-10">
            <AnimatePresence>
                {toast && (
                    <motion.div
                        key="toast"
                        initial={{ opacity: FROM, y: -24, x: '-50%', scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
                        exit={{ opacity: 0, y: -16, x: '-50%', scale: 0.95 }}
                        transition={spring}
                        className={`fixed top-6 left-1/2 px-6 py-3 rounded-full shadow-xl font-bold text-sm z-[100] ${toast.type === 'success' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white'}`}
                    >
                        {toast.message}
                    </motion.div>
                )}
            </AnimatePresence>
            <Modal open={!!itemToDelete} onClose={() => setItemToDelete(null)}>
                <h3 className="font-headline font-bold text-xl text-slate-900 mb-2">Delete Item?</h3>
                        <p className="text-slate-500 mb-6 font-medium leading-relaxed">Are you sure you want to permanently remove this item from the receipt?</p>
                        <div className="flex gap-3">
                            <motion.button {...tapFlat} onClick={() => setItemToDelete(null)} className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancel</motion.button>
                            <motion.button {...tapFlat} onClick={confirmDeleteItem} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-sm">Delete</motion.button>
                        </div>
            </Modal>
            <Modal open={confirmDeleteReceipt} onClose={() => setConfirmDeleteReceipt(false)}>
                <h3 className="font-headline font-bold text-xl text-slate-900 mb-2">Delete receipt?</h3>
                        <p className="text-slate-500 mb-6 font-medium leading-relaxed">This permanently deletes <strong className="text-slate-900">{sessionName || 'this receipt'}</strong> and its {items.length} items for everyone in the group.</p>
                        <div className="flex gap-3">
                            <motion.button {...tapFlat} onClick={() => setConfirmDeleteReceipt(false)} className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancel</motion.button>
                            <motion.button {...tapFlat} onClick={handleDeleteReceipt} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-sm">Delete</motion.button>
                        </div>
            </Modal>
            <header className="sticky top-0 w-full z-50 bg-white border-b border-slate-200">
                <div className="flex items-center justify-between px-6 py-4 w-full">
                    <div className="flex items-center gap-3">
                        <motion.button {...tap} onClick={onBack} className="text-slate-500 hover:text-slate-900 transition-colors">
                            <span className="material-symbols-outlined">arrow_back</span>
                        </motion.button>
                        <h1 className="font-headline font-bold text-lg text-slate-900">Receipt Editor</h1>
                    </div>
                </div>
            </header>

            <main className="pt-8 px-6 max-w-6xl mx-auto pb-32">
                <div className="flex flex-col lg:flex-row gap-8">
                    
                    {/* Left content: Receipt Editor */}
                    <div className="flex-1 w-full max-w-2xl">
                        
                        <section className="mb-8 flex flex-col items-center">
                            <div className="flex items-center justify-center text-slate-500 font-bold text-[13px] mb-1 uppercase tracking-widest text-center">
                                {sessionName} &bull; {sessionDate}
                            </div>
                            <div className="flex items-start">
                                <span className="text-slate-400 font-headline font-bold text-3xl mt-2 mr-1">$</span>
                                <span className="text-slate-900 font-headline font-extrabold text-7xl tracking-tighter"><AnimatedNumber value={grandTotal} /></span>
                            </div>
                        </section>

                        {/* Tabs */}
                        <SegmentedTabs id="split-tab" className="mb-8" value={activeTab} onChange={setActiveTab} tabs={[{ value: 'items', label: 'Items' }, { value: 'settings', label: 'Settings' }]} />

                        <motion.div key={activeTab} initial={{ y: 10 }} animate={{ y: 0 }} transition={{ duration: 0.18 }}>
                        {/* TAB 1: ITEMS */}
                        {activeTab === 'items' && (
                            <div>
                                <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-4 shadow-sm mb-6">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Items</span>
                                        <span className="font-headline font-extrabold text-2xl text-slate-900">{items.length}</span>
                                    </div>
                                    <div className="h-8 w-px bg-slate-200"></div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Unallocated</span>
                                        <span className={`font-headline font-extrabold text-2xl ${items.filter(i => i.assigned_users.length === 0).length > 0 ? 'text-orange-500' : 'text-slate-900'}`}>{items.filter(i => i.assigned_users.length === 0).length}</span>
                                    </div>
                                    <div className="h-8 w-px bg-slate-200"></div>
                                    <div className="flex flex-col text-right">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Allocated Value</span>
                                        <span className="font-headline font-extrabold text-2xl text-slate-900"><AnimatedNumber value={items.filter(i => i.assigned_users.length > 0).reduce((acc: number, i: any) => acc + i.price, 0)} prefix="$" /></span>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-3 mb-6">
                                    <div className="flex-1 flex items-center bg-white border border-slate-200 rounded-2xl px-3 py-2 shadow-sm focus-within:border-slate-400 transition-colors">
                                        <span className="material-symbols-outlined text-slate-400 mr-2 text-[20px]">search</span>
                                        <input 
                                            type="text" 
                                            placeholder="Find an item..." 
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            className="w-full bg-transparent border-none outline-none text-sm font-semibold text-slate-700"
                                        />
                                    </div>
                                    <select 
                                        value={sortBy}
                                        onChange={e => setSortBy(e.target.value as any)}
                                        className="bg-white border border-slate-200 rounded-2xl px-4 py-2 text-sm font-bold text-slate-700 shadow-sm outline-none focus:border-slate-400 appearance-none min-w-[140px]"
                                    >
                                        <option value="name_a_z">Name (A-Z)</option>
                                        <option value="price_high">Highest Cost</option>
                                        <option value="price_low">Lowest Cost</option>
                                    </select>
                                    
                                    <motion.button {...tap} onClick={handleAddManualItem} className="flex items-center gap-1 bg-slate-900 text-white rounded-2xl px-4 py-2 text-sm font-bold shadow-sm hover:bg-slate-800 transition-colors whitespace-nowrap">
                                        <span className="material-symbols-outlined text-[18px]">add</span>
                                        Add Item
                                    </motion.button>
                                </div>

                                <SegmentedTabs id="assign-mode" size="sm" className="mb-6 w-full" value={assignMode} onChange={setAssignMode} tabs={[{ value: 'by_item', label: 'By Item' }, { value: 'by_person', label: 'Fast Assign' }]} />

                                {assignMode === 'by_person' && (
                                    <div className="mb-6 bg-slate-100 p-4 rounded-2xl border border-slate-200">
                                        <p className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-widest leading-relaxed">Select a person, then tap items to assign them:</p>
                                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                            {users.map(u => (
                                                <motion.button {...tap} 
                                                    key={u} 
                                                    onClick={() => setActiveAssignParticipant(u)}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors flex-shrink-0 ${activeAssignParticipant === u ? 'bg-slate-900 text-white border-slate-900 ring-4 ring-slate-200' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 shadow-sm'}`}
                                                >
                                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold uppercase ${activeAssignParticipant === u ? 'bg-white text-slate-900' : 'bg-slate-100 text-slate-500'}`}>
                                                        {u.charAt(0)}
                                                    </div>
                                                    <span className="text-sm font-bold capitalize">{u}</span>
                                                </motion.button>
                                            ))}
                                            {users.length === 0 && <p className="text-xs text-slate-400 italic">No participants added to receipt yet.</p>}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    {sortedItems.length === 0 ? (
                                        <p className="text-center text-slate-500">No items match your search.</p>
                                    ) : (
                                    <AnimatePresence mode="popLayout" initial={false}>
                                    {sortedItems.map((item) => (
                                        <motion.div 
                                            key={item.id} 
                                            layout
                                            initial={{ opacity: FROM, y: 14 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.15 } }}
                                            transition={spring}
                                            className={`bg-white rounded-2xl p-5 border shadow-sm transition-colors group relative overflow-hidden ${
                                                assignMode === 'by_person' && activeAssignParticipant
                                                    ? (item.assigned_users.includes(activeAssignParticipant) ? 'border-blue-400 ring-2 ring-blue-100 bg-blue-50/30 cursor-pointer' : 'border-slate-200 hover:border-blue-300 cursor-pointer')
                                                    : 'border-slate-200 hover:border-slate-300'
                                            }`}
                                            onClick={() => {
                                                if (assignMode === 'by_person' && activeAssignParticipant && !editingItemId) {
                                                    toggleAssign(item.id, activeAssignParticipant, item.assigned_users.includes(activeAssignParticipant));
                                                }
                                            }}
                                        >
                                            {editingItemId === item.id ? (
                                                <div className="flex justify-between items-center mb-5 gap-3">
                                                    <input 
                                                        type="text" 
                                                        value={editItemName} 
                                                        onChange={e => setEditItemName(e.target.value)} 
                                                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-slate-400" 
                                                    />
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex items-center text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 focus-within:border-slate-400">
                                                            <span className="text-sm font-bold mr-1">$</span>
                                                            <input 
                                                                type="number" 
                                                                value={editItemPrice} 
                                                                onChange={e => setEditItemPrice(e.target.value)} 
                                                                className="w-24 bg-transparent text-sm font-bold text-slate-900 outline-none" 
                                                                step="0.01" 
                                                            />
                                                        </div>
                                                        <motion.button {...tap} onClick={() => handleEditSave(item.id)} className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm hover:bg-slate-800 transition-colors">
                                                            <span className="material-symbols-outlined text-[18px]">check</span>
                                                        </motion.button>
                                                        <motion.button {...tap} onClick={() => setEditingItemId(null)} className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 shadow-sm hover:bg-slate-200 transition-colors">
                                                            <span className="material-symbols-outlined text-[18px]">close</span>
                                                        </motion.button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex justify-between items-start mb-5 relative group/item">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h3 className={`font-bold text-base text-slate-900 ${assignMode === 'by_person' && activeAssignParticipant && item.assigned_users.includes(activeAssignParticipant) ? 'text-blue-900' : ''}`}>{item.name}</h3>
                                                            {assignMode === 'by_item' && (
                                                                <div className="flex items-center gap-1">
                                                                    <motion.button {...tap} onClick={(e) => { e.stopPropagation(); handleEditStart(item); }} className="p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors" title="Edit Item">
                                                                        <span className="material-symbols-outlined text-[16px]">draw</span>
                                                                    </motion.button>
                                                                    <motion.button {...tap} onClick={(e) => { e.stopPropagation(); setItemToDelete(item.id); }} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete Item">
                                                                        <span className="material-symbols-outlined text-[16px]">delete</span>
                                                                    </motion.button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <span className={`font-headline font-bold text-lg text-slate-900 ${assignMode === 'by_person' && activeAssignParticipant && item.assigned_users.includes(activeAssignParticipant) ? 'text-blue-900' : ''}`}>${item.price.toFixed(2)}</span>
                                                </div>
                                            )}
                                            {assignMode === 'by_item' && (
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <motion.button {...tap} onClick={(e) => { e.stopPropagation(); assignAllToItem(item.id); }} className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 shadow-sm transition-colors mr-1">All</motion.button>
                                                    {users.map((user, idx) => {
                                                        const isAssigned = item.assigned_users.includes(user);
                                                        const activeClasses = colorConfig[idx % colorConfig.length];
                                                        return (
                                                            <motion.button {...tap} 
                                                                key={user}
                                                                onClick={(e) => { e.stopPropagation(); toggleAssign(item.id, user, isAssigned); }}
                                                                className={`relative ${isAssigned ? '' : 'opacity-40 grayscale hover:opacity-100 hover:grayscale-0'}`}>
                                                                <div className={`w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-xs font-bold uppercase ${isAssigned ? activeClasses + ' ring-2 ring-offset-2' : 'bg-slate-100 text-slate-600'}`}>
                                                                    {user.charAt(0)}
                                                                </div>
                                                                <AnimatePresence>
                                                                {isAssigned && (
                                                                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring} className="absolute -bottom-1 -right-1 bg-slate-900 text-white w-4 h-4 rounded-full flex items-center justify-center">
                                                                        <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'wght' 700" }}>check</span>
                                                                    </motion.div>
                                                                )}
                                                                </AnimatePresence>
                                                            </motion.button>
                                                        );
                                                    })}
                                                    {users.length === 0 && (
                                                        <p className="text-sm font-semibold text-slate-400 italic">This group has no members yet.</p>
                                                    )}
                                                </div>
                                            )}
                                            <AnimatePresence>
                                            {assignMode === 'by_person' && activeAssignParticipant && item.assigned_users.includes(activeAssignParticipant) && (
                                                <motion.div initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={spring} className="absolute top-1/2 -mt-4 right-4 bg-blue-500 text-white w-8 h-8 rounded-full flex items-center justify-center shadow-lg">
                                                    <span className="material-symbols-outlined" style={{ fontVariationSettings: "'wght' 700" }}>check</span>
                                                </motion.div>
                                            )}
                                            </AnimatePresence>
                                        </motion.div>
                                    ))}
                                    </AnimatePresence>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* TAB 2: SETTINGS */}
                        {activeTab === 'settings' && (
                            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <h3 className="font-headline font-bold text-lg text-slate-900 mb-2">Receipt Settings</h3>
                                <p className="text-sm text-slate-500 mb-6 border-b border-slate-100 pb-4">{group ? `Everyone in "${group.name}" (${group.members.length}) is on this receipt automatically. Manage who's in the group from the group's Members tab.` : ''}</p>
                                
                                <div className="space-y-5">
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Receipt Name</label>
                                        <input 
                                            type="text" 
                                            value={sessionName} 
                                            onChange={e => setSessionName(e.target.value)}
                                            className="w-full text-slate-900 font-bold text-base bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-slate-400 transition-colors" 
                                            placeholder="e.g. Costco Trip"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Transaction Date</label>
                                        <input 
                                            type="date"
                                            value={sessionDate}
                                            onChange={e => setSessionDate(e.target.value)}
                                            className="w-full text-slate-900 font-bold text-base tracking-wide bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-slate-400 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Paid By</label>
                                        <select
                                            value={paidBy}
                                            onChange={e => setPaidBy(e.target.value)}
                                            className="w-full text-slate-900 font-bold text-base bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-slate-400 transition-colors appearance-none"
                                        >
                                            {!group?.members.some(m => m.user_id === paidBy) && <option value="">Unknown</option>}
                                            {group?.members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                                        </select>
                                        <p className="text-xs text-slate-400 mt-1.5">Everyone else on this receipt owes the payer their share. Shows up in Friends balances.</p>
                                    </div>
                                    <div className="pt-4 mt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Receipt Tax</label>
                                            <div className="flex items-center text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus-within:border-slate-400 transition-colors">
                                                <span className="text-sm font-bold mr-1">$</span>
                                                <input 
                                                    type="number" 
                                                    value={tax} 
                                                    onChange={e => setTax(e.target.value)}
                                                    className="w-full bg-transparent text-slate-900 font-bold text-base outline-none" 
                                                    placeholder="0.00"
                                                    step="0.01"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Additional Tip</label>
                                            <div className="flex items-center text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus-within:border-slate-400 transition-colors">
                                                <span className="text-sm font-bold mr-1">$</span>
                                                <input 
                                                    type="number" 
                                                    value={tip} 
                                                    onChange={e => setTip(e.target.value)}
                                                    className="w-full bg-transparent text-slate-900 font-bold text-base outline-none" 
                                                    placeholder="0.00"
                                                    step="0.01"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="pt-6 mt-6 border-t border-slate-100">
                                        <motion.button {...tapFlat} 
                                            disabled={!hasSettingsChanges}
                                            onClick={handleSaveSession} 
                                            className={`w-full font-bold py-4 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 ${hasSettingsChanges ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                                        >
                                            <span className="material-symbols-outlined text-[20px]">save</span>
                                            Save Receipt Settings
                                        </motion.button>
                                        <motion.button {...tapFlat}
                                            onClick={() => setConfirmDeleteReceipt(true)}
                                            className="w-full mt-3 font-bold py-4 rounded-xl bg-white text-red-600 border border-red-200 hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-[20px]">delete</span>
                                            Delete Receipt
                                        </motion.button>
                                    </div>
                                </div>
                            </div>
                        )}
                        </motion.div>
                        
                    </div>
                    
                    {/* Right content: Analytics / Total Breakdown Table */}
                    <div className="w-full lg:w-80 lg:mt-0 mt-8 shrink-0">
                        <div className="sticky top-24 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                            <h3 className="font-headline font-extrabold text-lg text-slate-900 mb-4 whitespace-nowrap">Current Checkout</h3>
                            
                            <div className="space-y-3 mb-6">
                                {oweTotals.map(([user, amount]) => (
                                    <div key={user} className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-[10px] font-bold uppercase bg-slate-50 text-slate-600">
                                                    {user.charAt(0)}
                                                </div>
                                                <span className="font-semibold text-slate-700 text-sm capitalize">{user}</span>
                                            </div>
                                            <span className="font-bold text-slate-900"><AnimatedNumber value={amount} prefix="$" /></span>
                                        </div>
                                        {amount > 0 && (
                                            <a 
                                                href={`venmo://pay?txn=pay&recipients=${user}&amount=${amount.toFixed(2)}&note=Grocery Split`} 
                                                className="w-full py-1.5 flex items-center justify-center gap-1.5 bg-[#008CFF] hover:bg-[#0074db] text-white rounded-lg transition-colors text-xs font-bold shadow-sm"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">account_balance_wallet</span>
                                                Venmo Charge
                                            </a>
                                        )}
                                    </div>
                                ))}
                                {oweTotals.length === 0 && (
                                    <p className="text-slate-400 text-sm italic">No assignments yet.</p>
                                )}
                            </div>

                            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-slate-500 font-semibold text-sm">Target Total</span>
                                <span className="font-headline font-extrabold text-xl text-slate-900"><AnimatedNumber value={grandTotal} prefix="$" /></span>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
