import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';

interface SplitProps {
    token: string | null;
    editSessionId: number | null;
    onBack: () => void;
    onSave: () => void;
}

export default function Split({ token, editSessionId, onBack, onSave }: SplitProps) {
    const [items, setItems] = useState<any[]>([]);
    
    // session users
    const [users, setUsers] = useState<string[]>([]);
    
    // global network
    const [globalUsers, setGlobalUsers] = useState<string[]>([]);
    const [globalGroups, setGlobalGroups] = useState<Record<string, string[]>>({});

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
    const [initialSettings, setInitialSettings] = useState({ name: '', date: '', tax: '', tip: '' });
    
    // Tabs & Search/Sort
    const [activeTab, setActiveTab] = useState<'items' | 'members' | 'settings'>('items');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'name_a_z' | 'price_high' | 'price_low'>('name_a_z');
    const [assignMode, setAssignMode] = useState<'by_item' | 'by_person'>('by_item');
    const [activeAssignParticipant, setActiveAssignParticipant] = useState<string | null>(null);
    const [selectedGroupPreview, setSelectedGroupPreview] = useState<string>('');
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            // Load global network data
            const [uRes, gRes] = await Promise.all([
                axios.get('/api/users'),
                axios.get('/api/groups')
            ]);
            setGlobalUsers(uRes.data.users || []);
            setGlobalGroups(gRes.data.groups || {});

            // If editing historical, force backend working memory to load this session
            if (editSessionId !== null) {
                await axios.post(`/api/sessions/${editSessionId}/load`);
            }
            
            // Now fetch the active working memory
            const res = await axios.get('/api/items');
            setItems(res.data.items || []);
            setUsers(res.data.users || []);
            const t = (res.data.items || []).reduce((acc: number, i: any) => acc + i.price, 0);
            setTotal(t);
            
            // Get session name and date if editing historical
            if (editSessionId !== null) {
                const sessRes = await axios.get('/api/sessions');
                const session = (sessRes.data.sessions || []).find((s: any) => s.id === editSessionId);
                if (session) {
                    let dName = "";
                    let dDate = "";
                    const parts = session.name.split('||');
                    if (parts.length > 1) {
                        dName = parts[0].trim();
                        dDate = parts[1].trim();
                        setSessionName(dName);
                        setSessionDate(dDate);
                    } else {
                        dName = session.name;
                        dDate = new Date(session.updated_at).toISOString().split('T')[0];
                        setSessionName(dName);
                        setSessionDate(dDate);
                     }
                     const savedTax = session.tax ? session.tax.toString() : '';
                     const savedTip = session.tip ? session.tip.toString() : '';
                     setTax(savedTax);
                     setTip(savedTip);
                     setInitialSettings({ name: dName, date: dDate, tax: savedTax, tip: savedTip });
                }
            } else {
                const today = new Date().toISOString().split('T')[0];
                setSessionName("Grocery Trip");
                setSessionDate(today);
                setInitialSettings({ name: "Grocery Trip", date: today, tax: '', tip: '' });
            }
        } catch (err) {
            console.error("Failed to load session logic", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [editSessionId]);

    const toggleAssign = async (itemId: string, userName: string, currentStatus: boolean) => {
        if (!users.includes(userName)) return; // Only session users can be assigned
        try {
            // Optimistic UI update
            setItems(prev => prev.map(item => {
                if (item.id === itemId) {
                    const newAssigned = new Set(item.assigned_users);
                    if (currentStatus) newAssigned.delete(userName);
                    else newAssigned.add(userName);
                    return { ...item, assigned_users: Array.from(newAssigned) };
                }
                return item;
            }));

            await axios.post(`/api/items/${itemId}/assign`, { user_name: userName, assign: !currentStatus });
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
        // Optimistic UI updates
        const optimisticPrice = parseFloat(editItemPrice) || 0;
        const oldItems = [...items];
        setItems(prev => prev.map(item => item.id === itemId ? { ...item, name: editItemName, price: optimisticPrice } : item));
        
        // Re-calculate total optimistically
        const t = oldItems.map(item => item.id === itemId ? { ...item, price: optimisticPrice } : item).reduce((acc: number, i: any) => acc + i.price, 0);
        setTotal(t);
        setEditingItemId(null);

        try {
            await axios.put(`/api/items/${itemId}`, { name: editItemName, price: optimisticPrice });
            // Do not run loadData(), state is already perfectly synced
        } catch (err) {
            console.error(err);
            setItems(oldItems); // Rollback optimistic update
            loadData();
        }
    };

    const handleAddManualItem = async () => {
        // Optimistic generic projection
        const tempId = `temp-${Date.now()}`;
        const newObj = { id: tempId, name: 'New Manual Item', price: 0.0, assigned_users: [] };
        setItems(prev => [newObj, ...prev]);

        try {
            const res = await axios.post('/api/items', { name: 'New Manual Item', price: 0.0 });
            // Sync with backend UUID cleanly
            setItems(prev => prev.map(item => item.id === tempId ? { ...item, id: res.data.item_id } : item));
        } catch (err) {
            console.error(err);
            setItems(prev => prev.filter(item => item.id !== tempId)); // Purge temporary on failure
        }
    };

    const confirmDeleteItem = async () => {
        if (!itemToDelete) return;
        const itemId = itemToDelete;
        setItemToDelete(null);

        const oldItems = [...items];
        setItems(prev => prev.filter(item => item.id !== itemId));
        // Re-calc optimistic total
        setTotal(oldItems.filter(item => item.id !== itemId).reduce((acc: number, i: any) => acc + i.price, 0));

        try {
            await axios.delete(`/api/items/${itemId}`);
        } catch (err) { 
            console.error(err);
            setItems(oldItems);
            loadData();
        }
    };

    const assignAllToItem = async (itemId: string) => {
        const itemObj = items.find(i => i.id === itemId);
        if (!itemObj) return;
        const allUsers = [...users];
        setItems(prev => prev.map(item => item.id === itemId ? { ...item, assigned_users: allUsers } : item));
        try {
            await axios.put(`/api/items/${itemId}`, { name: itemObj.name, price: itemObj.price, assigned_users: allUsers });
        } catch (err) { console.error(err); }
    };

    // Add people to this receipt logic:
    // In our backend, the active session is managed automatically by checking the item assignments,
    // but we can also store the 'users' list as active session participants.
    // The backend `users` in memory is the global users list, but `active_session_users` isn't fully separated in API.
    // Wait, the backend /api/items returns the global users! 
    // To support per-receipt participants without breaking backend, we maintain `sessionUsers` purely locally,
    // and when saving session, we push the `users` explicitly. But wait, `users` is just for UI filtering.
    // If a user is not in `users`, we don't render them for toggle Assign.
    const handleToggleSessionParticipant = async (u: string) => {
        const newUsers = users.includes(u) ? users.filter(x => x !== u) : [...users, u];
        setUsers(newUsers);
        if (editSessionId !== null) {
            try {
                await axios.put(`/api/sessions/${editSessionId}/update`, { users: newUsers, tax: parseFloat(tax) || 0, tip: parseFloat(tip) || 0 });
            } catch(e) { console.error("Auto-sync participant failed"); }
        }
    };

    const handleAddGroupToSession = async (groupName: string) => {
        const newUsers = globalGroups[groupName] || [];
        setUsers(newUsers);
        if (editSessionId !== null) {
            try {
                await axios.put(`/api/sessions/${editSessionId}/update`, { users: newUsers, tax: parseFloat(tax) || 0, tip: parseFloat(tip) || 0 });
            } catch(e) { console.error("Auto-sync group failed"); }
        }
    };

    const handleSaveSession = async () => {
        try {
            const combinedName = `${sessionName.trim()} || ${sessionDate}`;
            const sessionTax = parseFloat(tax) || 0;
            const sessionTip = parseFloat(tip) || 0;
            
            if (editSessionId !== null) {
                await axios.put(`/api/sessions/${editSessionId}/update`, { tax: sessionTax, tip: sessionTip });
                await axios.put(`/api/sessions/${editSessionId}`, { name: combinedName, users, tax: sessionTax, tip: sessionTip });
            } else {
                await axios.post('/api/sessions', { name: combinedName, users, tax: sessionTax, tip: sessionTip }); 
            }
            setInitialSettings({ name: sessionName.trim(), date: sessionDate, tax, tip });
            setToast({ message: 'Receipt saved successfully!', type: 'success' });
            setTimeout(() => setToast(null), 3500);
        } catch (err) {
            console.error("Save failed", err);
            setToast({ message: 'Failed to save receipt.', type: 'error' });
            setTimeout(() => setToast(null), 3500);
        }
    };

    const getOweTotals = () => {
        const userSubtotals: Record<string, number> = {};
        users.forEach(u => userSubtotals[u] = 0);
        
        let validSubtotal = 0;
        
        items.forEach(item => {
            if (item.assigned_users && item.assigned_users.length > 0) {
                const splitPrice = item.price / item.assigned_users.length;
                validSubtotal += item.price;
                item.assigned_users.forEach((u: string) => {
                    if (userSubtotals[u] !== undefined) userSubtotals[u] += splitPrice;
                });
            }
        });

        const taxAmt = parseFloat(tax) || 0;
        const tipAmt = parseFloat(tip) || 0;
        
        const finalTotals = Object.entries(userSubtotals).map(([u, subtot]) => {
            const ratio = validSubtotal > 0 ? (subtot / validSubtotal) : 0;
            const proportionalTax = taxAmt * ratio;
            const proportionalTip = tipAmt * ratio;
            return [u, subtot + proportionalTax + proportionalTip];
        }) as [string, number][];

        return finalTotals.sort((a, b) => b[1] - a[1]);
    };

    const oweTotals = getOweTotals();
    const grandTotal = total + (parseFloat(tax) || 0) + (parseFloat(tip) || 0);
    const colorConfig = ["bg-green-100 text-green-700 ring-green-500", "bg-blue-100 text-blue-700 ring-blue-500", "bg-orange-100 text-orange-700 ring-orange-500", "bg-purple-100 text-purple-700 ring-purple-500", "bg-pink-100 text-pink-700 ring-pink-500"];

    const sortedItems = useMemo(() => {
        let filtered = items;
        if (searchQuery) {
            const lowerCaseQuery = searchQuery.toLowerCase();
            filtered = filtered.filter(item => item.name.toLowerCase().includes(lowerCaseQuery));
        }
        return filtered.sort((a, b) => {
            if (sortBy === 'price_high') return b.price - a.price;
            if (sortBy === 'price_low') return a.price - b.price;
            return a.name.localeCompare(b.name);
        });
    }, [items, searchQuery, sortBy]);

    const hasSettingsChanges = 
        sessionName.trim() !== initialSettings.name || 
        sessionDate !== initialSettings.date || 
        tax !== initialSettings.tax || 
        tip !== initialSettings.tip;

    if (loading) {
        return (
            <div className="bg-slate-50 min-h-screen flex items-center justify-center">
                <p className="text-slate-500 font-bold">Resuming session...</p>
            </div>
        );
    }

    return (
        <div className="bg-slate-50 font-body text-slate-900 min-h-screen pb-10">
            {toast && (
                <div className={`fixed top-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-xl font-bold text-sm z-[100] transition-all animate-bounce ${toast.type === 'success' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white'}`}>
                    {toast.message}
                </div>
            )}
            {itemToDelete && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="font-headline font-bold text-xl text-slate-900 mb-2">Delete Item?</h3>
                        <p className="text-slate-500 mb-6 font-medium leading-relaxed">Are you sure you want to permanently remove this item from the receipt?</p>
                        <div className="flex gap-3">
                            <button onClick={() => setItemToDelete(null)} className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors active:scale-95">Cancel</button>
                            <button onClick={confirmDeleteItem} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-sm active:scale-95">Delete</button>
                        </div>
                    </div>
                </div>
            )}
            <header className="sticky top-0 w-full z-50 bg-white border-b border-slate-200">
                <div className="flex items-center justify-between px-6 py-4 w-full">
                    <div className="flex items-center gap-3">
                        <button onClick={onBack} className="text-slate-500 hover:text-slate-900 transition-colors active:scale-95">
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
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
                                <span className="text-slate-900 font-headline font-extrabold text-7xl tracking-tighter">{grandTotal.toFixed(2)}</span>
                            </div>
                        </section>

                        {/* Tabs */}
                        <div className="flex bg-slate-200 rounded-xl p-1 mb-8 shadow-inner">
                            <button onClick={() => setActiveTab('items')} className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors ${activeTab === 'items' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Items</button>
                            <button onClick={() => setActiveTab('members')} className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors ${activeTab === 'members' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Members</button>
                            <button onClick={() => setActiveTab('settings')} className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Settings</button>
                        </div>

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
                                        <span className="font-headline font-extrabold text-2xl text-slate-900">${(items.filter(i => i.assigned_users.length > 0).reduce((acc: number, i: any) => acc + i.price, 0)).toFixed(2)}</span>
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
                                    
                                    <button onClick={handleAddManualItem} className="flex items-center gap-1 bg-slate-900 text-white rounded-2xl px-4 py-2 text-sm font-bold shadow-sm hover:bg-slate-800 transition-colors whitespace-nowrap active:scale-95">
                                        <span className="material-symbols-outlined text-[18px]">add</span>
                                        Add Item
                                    </button>
                                </div>

                                <div className="flex bg-slate-200 rounded-lg p-1 mb-6 shadow-inner w-full">
                                    <button onClick={() => setAssignMode('by_item')} className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${assignMode === 'by_item' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>By Item</button>
                                    <button onClick={() => setAssignMode('by_person')} className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${assignMode === 'by_person' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Fast Assign</button>
                                </div>
                                
                                {assignMode === 'by_person' && (
                                    <div className="mb-6 bg-slate-100 p-4 rounded-2xl border border-slate-200">
                                        <p className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-widest leading-relaxed">Select a person, then tap items to assign them:</p>
                                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                            {users.map(u => (
                                                <button 
                                                    key={u} 
                                                    onClick={() => setActiveAssignParticipant(u)}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all flex-shrink-0 ${activeAssignParticipant === u ? 'bg-slate-900 text-white border-slate-900 ring-4 ring-slate-200' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 shadow-sm'}`}
                                                >
                                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold uppercase ${activeAssignParticipant === u ? 'bg-white text-slate-900' : 'bg-slate-100 text-slate-500'}`}>
                                                        {u.charAt(0)}
                                                    </div>
                                                    <span className="text-sm font-bold capitalize">{u}</span>
                                                </button>
                                            ))}
                                            {users.length === 0 && <p className="text-xs text-slate-400 italic">No participants added to receipt yet.</p>}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    {sortedItems.length === 0 ? (
                                        <p className="text-center text-slate-500">No items match your search.</p>
                                    ) : sortedItems.map((item) => (
                                        <div 
                                            key={item.id} 
                                            className={`bg-white rounded-2xl p-5 border shadow-sm transition-all group relative overflow-hidden ${
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
                                                        <button onClick={() => handleEditSave(item.id)} className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm hover:bg-slate-800 transition-colors">
                                                            <span className="material-symbols-outlined text-[18px]">check</span>
                                                        </button>
                                                        <button onClick={() => setEditingItemId(null)} className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 shadow-sm hover:bg-slate-200 transition-colors">
                                                            <span className="material-symbols-outlined text-[18px]">close</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex justify-between items-start mb-5 relative group/item">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h3 className={`font-bold text-base text-slate-900 ${assignMode === 'by_person' && activeAssignParticipant && item.assigned_users.includes(activeAssignParticipant) ? 'text-blue-900' : ''}`}>{item.name}</h3>
                                                            {assignMode === 'by_item' && (
                                                                <div className="flex items-center gap-1">
                                                                    <button onClick={(e) => { e.stopPropagation(); handleEditStart(item); }} className="p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors" title="Edit Item">
                                                                        <span className="material-symbols-outlined text-[16px]">draw</span>
                                                                    </button>
                                                                    <button onClick={(e) => { e.stopPropagation(); setItemToDelete(item.id); }} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete Item">
                                                                        <span className="material-symbols-outlined text-[16px]">delete</span>
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <span className={`font-headline font-bold text-lg text-slate-900 ${assignMode === 'by_person' && activeAssignParticipant && item.assigned_users.includes(activeAssignParticipant) ? 'text-blue-900' : ''}`}>${item.price.toFixed(2)}</span>
                                                </div>
                                            )}
                                            {assignMode === 'by_item' && (
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <button onClick={(e) => { e.stopPropagation(); assignAllToItem(item.id); }} className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 shadow-sm active:scale-95 transition-all mr-1">All</button>
                                                    {users.map((user, idx) => {
                                                        const isAssigned = item.assigned_users.includes(user);
                                                        const activeClasses = colorConfig[idx % colorConfig.length];
                                                        return (
                                                            <button 
                                                                key={user}
                                                                onClick={(e) => { e.stopPropagation(); toggleAssign(item.id, user, isAssigned); }}
                                                                className={`relative transition-transform active:scale-90 ${isAssigned ? '' : 'opacity-40 grayscale hover:opacity-100 hover:grayscale-0'}`}>
                                                                <div className={`w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-xs font-bold uppercase ${isAssigned ? activeClasses + ' ring-2 ring-offset-2' : 'bg-slate-100 text-slate-600'}`}>
                                                                    {user.charAt(0)}
                                                                </div>
                                                                {isAssigned && (
                                                                    <div className="absolute -bottom-1 -right-1 bg-slate-900 text-white w-4 h-4 rounded-full flex items-center justify-center">
                                                                        <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'wght' 700" }}>check</span>
                                                                    </div>
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                    {users.length === 0 && (
                                                        <p className="text-sm font-semibold text-slate-400 italic">No members added to receipt yet.</p>
                                                    )}
                                                </div>
                                            )}
                                            {assignMode === 'by_person' && activeAssignParticipant && item.assigned_users.includes(activeAssignParticipant) && (
                                                <div className="absolute top-1/2 -translate-y-1/2 right-4 bg-blue-500 text-white w-8 h-8 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in duration-200">
                                                    <span className="material-symbols-outlined" style={{ fontVariationSettings: "'wght' 700" }}>check</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* TAB 2: MEMBERS */}
                        {activeTab === 'members' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <section>
                                    <h3 className="font-headline font-bold text-lg text-slate-900 mb-3">Import Group</h3>
                                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm mb-6">
                                        <select 
                                            value=""
                                            onChange={e => {
                                                if(e.target.value === 'new') window.location.hash = 'groups';
                                                else if(e.target.value !== '') handleAddGroupToSession(e.target.value);
                                            }}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 shadow-sm outline-none focus:border-slate-400 mb-2 appearance-none"
                                        >
                                            <option value="">-- Apply a predefined Group --</option>
                                            {Object.keys(globalGroups).map(g => (
                                                <option key={g} value={g}>{g} ({globalGroups[g].length} Members)</option>
                                            ))}
                                            <option value="new">+ Create New Group</option>
                                        </select>
                                    </div>
                                </section>

                                <hr className="border-slate-200" />

                                <section>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-headline font-bold text-lg text-slate-900">Individuals ({users.length})</h3>
                                    </div>
                                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm mb-6">
                                        <select 
                                            value=""
                                            onChange={e => {
                                                if (e.target.value !== '') {
                                                    handleToggleSessionParticipant(e.target.value);
                                                }
                                            }}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:border-slate-400 appearance-none"
                                        >
                                            <option value="">+ Add Individual Member...</option>
                                            {globalUsers.filter(u => !users.includes(u)).map(u => (
                                                <option key={u} value={u}>{u}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-3">
                                        {users.length === 0 ? (
                                            <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-2xl">
                                                <p className="text-sm font-semibold text-slate-400 italic">No members assigned to this receipt. Add someone above or import a group.</p>
                                            </div>
                                        ) : (
                                            users.map(u => (
                                                <div key={u} className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-200 shadow-sm transition-all animate-in zoom-in-95 duration-200">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 uppercase border border-slate-200">
                                                            {u.charAt(0)}
                                                        </div>
                                                        <span className="font-bold text-slate-800 text-base">{u}</span>
                                                    </div>
                                                    <button 
                                                        onClick={() => handleToggleSessionParticipant(u)}
                                                        className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors border border-transparent hover:border-red-100"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">close</span>
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </section>
                            </div>
                        )}

                        {/* TAB 3: SETTINGS */}
                        {activeTab === 'settings' && (
                            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <h3 className="font-headline font-bold text-lg text-slate-900 mb-6 border-b border-slate-100 pb-4">Receipt Settings</h3>
                                
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
                                        <button 
                                            disabled={!hasSettingsChanges}
                                            onClick={handleSaveSession} 
                                            className={`w-full font-bold py-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 ${hasSettingsChanges ? 'bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98]' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                                        >
                                            <span className="material-symbols-outlined text-[20px]">save</span>
                                            Save Receipt Settings
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        
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
                                            <span className="font-bold text-slate-900">${amount.toFixed(2)}</span>
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
                                <span className="font-headline font-extrabold text-xl text-slate-900">${grandTotal.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
