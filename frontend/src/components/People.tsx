import React, { useState, useEffect } from 'react';
import { listPeople, addPerson, removePerson } from '../lib/api';

export default function People() {
    const [users, setUsers] = useState<string[]>([]);
    const [newUserState, setNewUserState] = useState('');
    const [userToDelete, setUserToDelete] = useState<string | null>(null);

    const loadData = async () => {
        try {
            setUsers(await listPeople());
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => { loadData(); }, []);

    const handleAddUser = async () => {
        if (!newUserState.trim()) return;
        try {
            await addPerson(newUserState.trim());
            setNewUserState('');
            loadData();
        } catch (err) { }
    };

    const confirmDeleteUser = async () => {
        if (!userToDelete) return;
        const name = userToDelete;
        setUserToDelete(null);
        try {
            await removePerson(name);
            loadData();
        } catch (err) { }
    };

    return (
        <div className="flex flex-col min-h-screen bg-slate-50">
            {userToDelete && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="font-headline font-bold text-xl text-slate-900 mb-2">Remove person?</h3>
                        <p className="text-slate-500 mb-6 font-medium leading-relaxed">Remove <strong className="text-slate-900">{userToDelete}</strong> from your saved people? Receipts they're already on are not changed.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setUserToDelete(null)} className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors active:scale-95">Cancel</button>
                            <button onClick={confirmDeleteUser} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-sm active:scale-95">Remove</button>
                        </div>
                    </div>
                </div>
            )}
            <header className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-slate-200 z-50">
                <div className="flex justify-start items-center px-6 h-16 w-full">
                    <h1 className="font-headline font-extrabold text-xl text-slate-900 tracking-tight">People</h1>
                </div>
            </header>

            <main className="pt-24 px-6 pb-32 max-w-2xl mx-auto space-y-6">
                <p className="text-sm text-slate-500">Saved people you can add to any receipt, such as guests who don't have an account. Group members are added from inside each group.</p>

                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="flex items-center bg-slate-50 border border-slate-200 rounded-2xl p-2 mb-6 focus-within:border-slate-400 transition-colors">
                        <span className="material-symbols-outlined text-slate-400 pl-2">person_add</span>
                        <input
                            type="text"
                            value={newUserState}
                            onChange={e => setNewUserState(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAddUser()}
                            placeholder="Add new person..."
                            className="w-full bg-transparent border-none outline-none text-base px-3 py-2 font-semibold text-slate-700"
                        />
                    </div>

                    <div className="space-y-3">
                        {users.map((user) => (
                            <div key={user} className="flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center font-bold text-slate-700 uppercase">
                                        {user.charAt(0)}
                                    </div>
                                    <span className="font-bold text-slate-800 capitalize text-base">{user}</span>
                                </div>
                                <button
                                    onClick={() => setUserToDelete(user)}
                                    aria-label={`Remove ${user}`}
                                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors flex items-center justify-center active:scale-90"
                                >
                                    <span className="material-symbols-outlined text-[20px]">delete</span>
                                </button>
                            </div>
                        ))}
                        {users.length === 0 && (
                            <p className="text-center text-slate-400 font-semibold py-4">No saved people yet.</p>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
