import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface GroupsProps {
    token: string | null;
}

export default function Groups({ token }: GroupsProps) {
    const [users, setUsers] = useState<string[]>([]);
    const [groups, setGroups] = useState<Record<string, string[]>>({});
    const [newUserState, setNewUserState] = useState('');
    const [newGroupNameState, setNewGroupNameState] = useState('');
    const [userToDelete, setUserToDelete] = useState<string | null>(null);
    
    // For assigning a user to a group via modal
    const [assigningGroup, setAssigningGroup] = useState<string | null>(null);
    const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);

    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    const loadData = async () => {
        try {
            const [uRes, gRes] = await Promise.all([
                axios.get('/api/users'),
                axios.get('/api/groups')
            ]);
            setUsers(uRes.data.users || []);
            setGroups(gRes.data.groups || {});
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => { loadData(); }, []);

    const handleAddUser = async () => {
        if (!newUserState.trim()) return;
        try {
            await axios.post('/api/users', { name: newUserState.trim() });
            setNewUserState('');
            loadData();
        } catch (err) { }
    };

    const confirmDeleteUser = async () => {
        if (!userToDelete) return;
        const name = userToDelete;
        setUserToDelete(null);
        try {
            await axios.delete('/api/users', { data: { name } });
            loadData();
        } catch (err) { }
    };

    const handleCreateGroup = async () => {
        if (!newGroupNameState.trim()) return;
        try {
            await axios.post('/api/groups', { name: newGroupNameState.trim(), members: [] });
            setNewGroupNameState('');
            loadData();
        } catch (err) { }
    };

    const handleDeleteGroup = async (name: string) => {
        try {
            await axios.delete(`/api/groups/${name}`);
            loadData();
        } catch (err) { }
    };

    const handleAddUserToGroup = async (groupName: string, user: string) => {
        try {
            const currentMembers = groups[groupName] || [];
            if (!currentMembers.includes(user)) {
                await axios.post('/api/groups', { name: groupName, members: [...currentMembers, user] });
                setAssigningGroup(null);
                loadData();
            }
        } catch (err) {}
    };

    const handleRemoveUserFromGroup = async (groupName: string, user: string) => {
        try {
            const currentMembers = groups[groupName] || [];
            const newMembers = currentMembers.filter(m => m !== user);
            await axios.post('/api/groups', { name: groupName, members: newMembers });
            loadData();
        } catch (err) {}
    };

    return (
        <div className="flex flex-col min-h-screen bg-slate-50">
            {userToDelete && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="font-headline font-bold text-xl text-slate-900 mb-2">Delete Member?</h3>
                        <p className="text-slate-500 mb-6 font-medium leading-relaxed">Are you sure you want to permanently remove <strong className="text-slate-900">{userToDelete}</strong> from your network? This action cannot be undone.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setUserToDelete(null)} className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors active:scale-95">Cancel</button>
                            <button onClick={confirmDeleteUser} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-sm active:scale-95">Delete</button>
                        </div>
                    </div>
                </div>
            )}
            <header className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-slate-200 z-50">
                <div className="flex justify-start items-center px-6 h-16 w-full">
                    <h1 className="font-headline font-extrabold text-xl text-slate-900 tracking-tight">Network & Groups</h1>
                </div>
            </header>

            <main className="pt-24 px-6 pb-32 max-w-2xl mx-auto space-y-8">
                {/* Groups Section */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-headline font-bold text-xl text-slate-900 mt-2">Named Groups</h2>
                        <div className="flex items-center bg-white border border-slate-200 rounded-full px-2 py-1 shadow-sm focus-within:ring-2 ring-slate-200">
                            <span className="material-symbols-outlined text-slate-400 pl-2 text-[20px]">group_add</span>
                            <input 
                                type="text" 
                                value={newGroupNameState}
                                onChange={e => setNewGroupNameState(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleCreateGroup()}
                                placeholder="New group..." 
                                className="bg-transparent border-none outline-none text-sm px-3 py-1.5 w-32 font-semibold text-slate-700"
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        {Object.entries(groups).map(([groupName, members], i) => (
                            <div key={groupName} className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all animate-in slide-in-from-bottom-2 duration-500 fill-mode-both" style={{ animationDelay: `${i * 50}ms` }}>
                                <div className="flex justify-between items-center mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center border border-indigo-100/50">
                                            <span className="material-symbols-outlined text-[18px]">group</span>
                                        </div>
                                        <h3 className="font-headline font-bold text-lg text-slate-900">{groupName}</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => {
                                            setAssigningGroup(assigningGroup === groupName ? null : groupName);
                                            setSelectedProfiles([]);
                                        }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors bg-white border border-slate-200 hover:border-indigo-200 active:scale-95 shadow-sm">
                                            <span className="material-symbols-outlined text-[18px]">{assigningGroup === groupName ? 'close' : 'person_add'}</span>
                                        </button>
                                        <button onClick={() => handleDeleteGroup(groupName)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors active:scale-95 ml-1">
                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Active Member Assignment dropdown panel */}
                                {assigningGroup === groupName && (
                                    <div className="mb-4 bg-slate-50 p-3 rounded-xl border border-blue-100 flex gap-2 flex-wrap">
                                        <p className="w-full text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Add to {groupName}</p>
                                        {users.filter(u => !members.includes(u)).map(u => {
                                            const isSelected = selectedProfiles.includes(u);
                                            return (
                                                <button 
                                                    key={u} 
                                                    onClick={() => setSelectedProfiles(prev => isSelected ? prev.filter(x => x !== u) : [...prev, u])} 
                                                    className={`flex items-center gap-1.5 border px-3 py-1.5 rounded-full transition-colors ${isSelected ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400'}`}
                                                >
                                                    <span className="font-semibold text-sm">{u}</span>
                                                    <span className="material-symbols-outlined text-[14px]">{isSelected ? 'check' : 'add'}</span>
                                                </button>
                                            );
                                        })}
                                        {users.filter(u => !members.includes(u)).length === 0 && (
                                            <p className="text-xs text-slate-400 italic">No available users to add.</p>
                                        )}
                                        {selectedProfiles.length > 0 && (
                                            <button 
                                                onClick={async () => {
                                                    const currentMembers = groups[groupName] || [];
                                                    try {
                                                        await axios.post('/api/groups', { name: groupName, members: [...currentMembers, ...selectedProfiles] });
                                                        setAssigningGroup(null);
                                                        setSelectedProfiles([]);
                                                        loadData();
                                                    } catch(err) {}
                                                }}
                                                className="w-full mt-2 bg-blue-600 text-white hover:bg-blue-700 transition-colors font-bold py-2 rounded-xl text-sm"
                                            >
                                                Add {selectedProfiles.length} Selected People
                                            </button>
                                        )}
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-2">
                                    {members.length === 0 ? (
                                        <p className="text-sm text-slate-400 italic">Empty group.</p>
                                    ) : (
                                        members.map(member => (
                                            <div key={member} className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full">
                                                <div className="w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[10px] font-bold uppercase text-slate-600">
                                                    {member.charAt(0)}
                                                </div>
                                                <span className="font-semibold text-slate-700 text-sm">{member}</span>
                                                <button onClick={() => handleRemoveUserFromGroup(groupName, member)} className="ml-1 text-slate-400 hover:text-red-500">
                                                    <span className="material-symbols-outlined text-[14px]">close</span>
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        ))}
                        {Object.keys(groups).length === 0 && (
                            <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-2xl">
                                <p className="text-slate-400 font-semibold">No groups created yet.</p>
                            </div>
                        )}
                    </div>
                </section>

                <hr className="border-slate-200" />

                {/* All Users Profile List Section */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-headline font-bold text-xl text-slate-900">All People</h2>
                    </div>
                    
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
                                <div key={user} className="flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 transition-colors group/user border border-transparent hover:border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center font-bold text-slate-700 uppercase">
                                            {user.charAt(0)}
                                        </div>
                                        <span className="font-bold text-slate-800 capitalize text-base">{user}</span>
                                    </div>
                                    <button 
                                        onClick={() => setUserToDelete(user)}
                                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors flex items-center justify-center active:scale-90"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">delete</span>
                                    </button>
                                </div>
                            ))}
                            {users.length === 0 && (
                                <p className="text-center text-slate-400 font-semibold py-4">No active profiles found.</p>
                            )}
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
