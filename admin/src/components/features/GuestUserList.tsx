import React from 'react';
import { Users, Mail, Globe, Shield } from 'lucide-react';
import { GuestUser } from '@/types';
import { SelectableListItem } from '@/components/ui/SelectableListItem';

export interface GuestUserListProps {
    users: GuestUser[];
    isLoading: boolean;
    selectedIds: Set<string>;
    onSelect: (id: string) => void;
    onSelectAll: () => void;
    onEdit: (user: GuestUser) => void;
    onVerify?: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
    onBlock?: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
    onDelete?: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
    focusedId?: string | null;
}

export function GuestUserList({
    users,
    isLoading,
    selectedIds,
    onSelect,
    onSelectAll,
    onEdit,
    onVerify,
    onBlock,
    onDelete,
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
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
                {users.map((user) => {
                    const StatusBadge = () => {
                        const isBlocked = user.is_blocked;
                        const isVerified = user.is_verified;

                        let badgeText = 'UNVERIFIED';
                        let badgeColor = 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';

                        if (isBlocked) {
                            badgeText = 'BLOCKED';
                            badgeColor = 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800';
                        } else if (isVerified) {
                            badgeText = 'VERIFIED';
                            badgeColor = 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800';
                        }

                        const showHoverActions = (onVerify && !isVerified && !isBlocked) || (onBlock && !isBlocked) || onDelete;

                        return (
                            <div className="flex items-center gap-2 justify-end min-h-[22px]">
                                {/* Badge: Hidden on hover if actions available */}
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wide ${badgeColor} ${showHoverActions ? 'group-hover:hidden' : ''}`}>
                                    {badgeText}
                                </span>

                                {/* Actions: Shown on hover */}
                                {showHoverActions && (
                                    <div className="hidden group-hover:flex items-center gap-1">
                                        {!isVerified && !isBlocked && onVerify && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onVerify(user.id, e); }}
                                                className="h-5 px-2 flex items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 text-[10px] uppercase font-bold tracking-wide transition-colors"
                                                title="Verify (V)"
                                            >
                                                Verify
                                            </button>
                                        )}
                                        {!isBlocked && onBlock && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onBlock(user.id, e); }}
                                                className="h-5 px-2 flex items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40 text-[10px] uppercase font-bold tracking-wide transition-colors"
                                                title="Block (B)"
                                            >
                                                Block
                                            </button>
                                        )}
                                        {onDelete && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onDelete(user.id, e); }}
                                                className="h-5 px-2 flex items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 text-[10px] uppercase font-bold tracking-wide transition-colors"
                                                title="Delete (D)"
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    };

                    return (
                        <SelectableListItem
                            key={user.id}
                            id={user.id}
                            title={user.username || user.email}
                            subtitle={
                                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                    <span className="truncate">{user.email}</span>
                                </div>
                            }
                            isActiveView={focusedId === user.id}
                            imageUrl={user.avatar_url}
                            imageFallback={<Users className="w-6 h-6 text-gray-400 opacity-50" />}
                            isChecked={selectedIds.has(user.id)}
                            onToggleSelection={() => onSelect(user.id)}
                            onClick={() => onEdit(user)}
                            statusBadge={<StatusBadge />}
                            metaRight={
                                <div className="text-xs text-gray-400">
                                    {new Date(user.created_at).toLocaleDateString()}
                                </div>
                            }
                        />
                    );
                })}
            </div>
        </div>
    );
}
