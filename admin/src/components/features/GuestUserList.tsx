import React from 'react';
import { Users, Mail, Globe, Shield } from 'lucide-react';
import { GuestUser } from '@/types';
import { SelectableListItem } from '@/components/ui/SelectableListItem';

interface GuestUserListProps {
    users: GuestUser[];
    isLoading: boolean;
    selectedIds: Set<string>;
    onSelect: (id: string) => void;
    onSelectAll: () => void;
    onEdit: (user: GuestUser) => void;
    focusedId?: string | null;
}

export function GuestUserList({
    users,
    isLoading,
    selectedIds,
    onSelect,
    onSelectAll,
    onEdit,
    focusedId
}: GuestUserListProps) {
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    if (users.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
                <Users className="w-12 h-12 mb-4 opacity-20" />
                <p>No users found</p>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-800">
            {/* Header removed as requested */}

            <div className="divide-y divide-gray-200 dark:divide-gray-800">
                {users.map((user) => (
                    <SelectableListItem
                        key={user.id}
                        id={user.id}
                        title={user.username || user.email}
                        subtitle={
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <span className="truncate">{user.email}</span>
                                {user.is_verified && (
                                    <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px] font-medium">
                                        Verified
                                    </span>
                                )}
                            </div>
                        }
                        isActiveView={focusedId === user.id}
                        imageUrl={user.avatar_url}
                        imageFallback={<Users className="w-6 h-6 text-gray-400 opacity-50" />}
                        isChecked={selectedIds.has(user.id)}
                        onToggleSelection={() => onSelect(user.id)}
                        onClick={() => onEdit(user)}
                        metaRight={
                            <div className="text-xs text-gray-400">
                                {new Date(user.created_at).toLocaleDateString()}
                            </div>
                        }
                    />
                ))}
            </div>
        </div>
    );
}
