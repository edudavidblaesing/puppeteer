import React, { useState, useEffect } from 'react';
import { UserPlus, Trash2, ShieldAlert, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { fetchUsers, createUser, deleteUser } from '@/lib/userApi';
import { User } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

interface UserManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function UserManagementModal({ isOpen, onClose }: UserManagementModalProps) {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [newUser, setNewUser] = useState({ username: '', password: '', role: 'admin' as 'admin' | 'superadmin' });
    const [isAdding, setIsAdding] = useState(false);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const data = await fetchUsers();
            setUsers(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) loadUsers();
    }, [isOpen]);

    const handleCreate = async () => {
        if (!newUser.username || !newUser.password) return;
        try {
            await createUser(newUser);
            setNewUser({ username: '', password: '', role: 'admin' });
            setIsAdding(false);
            loadUsers();
        } catch (e: any) {
            alert('Failed to create user: ' + e.message);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this user?')) return;
        try {
            await deleteUser(id);
            loadUsers();
        } catch (e: any) {
            alert('Failed to delete: ' + e.message);
        }
    };

    const canManage = currentUser?.role === 'superadmin';

    // Header content for the modal title
    const modalTitle = (
        <span className="flex items-center gap-2">
            <UserIcon className="w-5 h-5" /> User Management
        </span>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="User Management"
            size="lg"
        >
            <div className="space-y-4 mb-6 max-h-[60vh] overflow-y-auto">
                {users.map((u) => (
                    <div key={u.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${u.role === 'superadmin' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                                {u.username.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-900 dark:text-white">{u.username}</p>
                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                    {u.role === 'superadmin' && <ShieldAlert className="w-3 h-3 text-purple-500" />}
                                    {u.role}
                                </p>
                            </div>
                        </div>
                        {canManage && u.username !== 'admin' && u.id !== currentUser?.id && (
                            <button onClick={() => handleDelete(u.id!)} className="text-red-400 hover:text-red-600 p-2">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {canManage && (
                isAdding ? (
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl space-y-3">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white">Add New User</h4>
                        <input
                            className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
                            placeholder="Username"
                            value={newUser.username}
                            onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                        />
                        <input
                            className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
                            type="password"
                            placeholder="Password"
                            value={newUser.password}
                            onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                        />
                        <select
                            className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
                            value={newUser.role}
                            onChange={(e: any) => setNewUser({ ...newUser, role: e.target.value })}
                        >
                            <option value="admin">Admin</option>
                            <option value="superadmin">Superadmin</option>
                        </select>
                        <div className="flex gap-2 justify-end mt-2">
                            <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
                            <Button size="sm" onClick={handleCreate}>Create User</Button>
                        </div>
                    </div>
                ) : (
                    <Button onClick={() => setIsAdding(true)} className="w-full" variant="outline">
                        <UserPlus className="w-4 h-4 mr-2" /> Add User
                    </Button>
                )
            )}
        </Modal>
    );
}
