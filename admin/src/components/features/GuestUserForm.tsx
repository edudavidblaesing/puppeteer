import React, { useState, useEffect, useMemo } from 'react';
import { GuestUser } from '@/types';

// Local interface for form state including password
interface GuestUserFormData extends Partial<GuestUser> {
    password?: string;
}
import { Input } from '@/components/ui/Input';
import { FormLayout } from '@/components/ui/FormLayout';
import { FormSection } from '@/components/ui/FormSection';
import { User, Mail, ShieldCheck, Calendar, Activity, BarChart2 } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useDeleteWithUsage } from '@/hooks/useDeleteWithUsage';
import { fetchGuestUser } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface GuestUserFormProps {
    initialData?: Partial<GuestUser>;
    onSubmit: (data: Partial<GuestUser>) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
    onCancel: (force?: boolean) => void;
    isLoading?: boolean;
    isModal?: boolean;
    isPanel?: boolean;
    id?: string;
    onDirtyChange?: (isDirty: boolean) => void;
}

export function GuestUserForm({
    initialData,
    onSubmit,
    onDelete,
    onCancel,
    isLoading,
    isModal = false,
    isPanel = false,
    id,
    onDirtyChange
}: GuestUserFormProps) {
    const { success, error: showError } = useToast();

    const [formData, setFormData] = useState<GuestUserFormData>({
        username: '',
        email: '',
        full_name: '',
        is_verified: false,
        avatar_url: '',
        password: '',
    });

    const [fetchedData, setFetchedData] = useState<Partial<GuestUser> | null>(null);

    // Fetch logic if ID provided but no initialData (deep linking support)
    useEffect(() => {
        if (id && !initialData && !fetchedData) {
            fetchGuestUser(id).then(u => {
                if (u) {
                    setFormData(prev => ({ ...prev, ...u }));
                    setFetchedData(u);
                }
            });
        }
    }, [id, initialData, fetchedData]);

    const effectiveInitial = useMemo(() => {
        const source = initialData || fetchedData || {};
        return {
            username: source.username || '',
            email: source.email || '',
            full_name: source.full_name || '',
            is_verified: source.is_verified || false,
            avatar_url: source.avatar_url || '',
        };
    }, [initialData, fetchedData]);

    // Sync state with props
    useEffect(() => {
        if (Object.keys(effectiveInitial).length > 0) {
            setFormData(prev => ({ ...prev, ...effectiveInitial }));
        }
    }, [effectiveInitial]);

    // Dirty Check
    const isDirty = useMemo(() => {
        if (!effectiveInitial) return false;
        return (Object.keys(effectiveInitial) as (keyof typeof effectiveInitial)[]).some(key => {
            // @ts-ignore - password is not in effectiveInitial usually, but formData has it
            const initialVal = effectiveInitial[key];
            // @ts-ignore
            const currentVal = formData[key];
            return currentVal !== initialVal;
        }) || (!!formData.password); // Consider dirty if password is set (implied new user or password change if we supported it)
    }, [formData, effectiveInitial]);

    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    const handleSave = async () => {
        try {
            await onSubmit(formData);
            if (initialData?.id || fetchedData) {
                setFetchedData(prev => ({ ...prev, ...formData }));
            }
            onCancel(true);
        } catch (e: any) {
            console.error(e);
            showError(e.message || 'Failed to save user');
        }
    };

    const { promptBeforeAction, modalElement } = useUnsavedChanges({
        isLinkDirty: isDirty,
        onSave: handleSave,
        onDiscard: onCancel
    });

    const { handleDeleteClick, confirmDelete, cancelDelete, showConfirm: showConfirmDelete, isDeleting } = useDeleteWithUsage({
        entityType: 'guest-users',
        onDelete: async (id) => {
            if (onDelete) await onDelete(id);
        },
        onSuccess: () => {
            onCancel();
            success('User deleted successfully');
        },
        onError: (err) => showError(err.message)
    });

    const handleCancelRequest = () => {
        promptBeforeAction(() => onCancel());
    };

    const formattedDate = (dateStr?: string) => {
        if (!dateStr) return 'Never';
        return new Date(dateStr).toLocaleString();
    };

    return (
        <>
            {modalElement}
            <FormLayout
                title={initialData?.username ? `Edit ${initialData.username}` : 'New User'}
                isModal={isModal}
                isPanel={isPanel}
                onCancel={handleCancelRequest}
                onSave={handleSave}
                onDelete={initialData?.id && onDelete ? () => handleDeleteClick(initialData.id!) : undefined}
                isLoading={isLoading}
                saveLabel={initialData?.id ? 'Save Changes' : 'Create User'}
            >
                {/* Profile Info */}
                <div className="flex items-center gap-4 p-4 mb-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
                    <div
                        className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 bg-cover bg-center flex items-center justify-center text-gray-400 border border-gray-300 dark:border-gray-600"
                        style={formData.avatar_url ? { backgroundImage: `url(${formData.avatar_url})` } : undefined}
                    >
                        {!formData.avatar_url && <User className="w-8 h-8 opacity-50" />}
                    </div>
                    <div>
                        <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">{formData.full_name || formData.username || 'New User'}</h3>
                        <p className="text-sm text-gray-500">{formData.email}</p>
                        <div className="flex gap-2 mt-1">
                            {formData.is_verified && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                    <ShieldCheck className="w-3 h-3 mr-1" /> Verified
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <FormSection title="Account Details" icon={<User className="w-4 h-4" />}>
                    <div className="space-y-4 pt-4">
                        <Input label="Username" value={formData.username || ''} onChange={(e) => setFormData({ ...formData, username: e.target.value })} required />
                        <Input label="Full Name" value={formData.full_name || ''} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} />
                        <Input label="Email" type="email" value={formData.email || ''} onChange={(e) => setFormData({ ...formData, email: e.target.value })} leftIcon={<Mail className="w-4 h-4" />} required />

                        {/* Password for New Users */}
                        {!initialData?.id && !fetchedData?.id && (
                            <Input
                                label="Password"
                                type="password"
                                value={formData.password || ''}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                required
                                placeholder="Initial password..."
                            />
                        )}

                        <Input label="Avatar URL" value={formData.avatar_url || ''} onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })} placeholder="https://..." />

                        <div className="flex items-center gap-2 mt-2">
                            <input
                                type="checkbox"
                                id="is_verified"
                                checked={!!formData.is_verified}
                                onChange={(e) => setFormData({ ...formData, is_verified: e.target.checked })}
                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-4 h-4"
                            />
                            <label htmlFor="is_verified" className="text-sm text-gray-700 dark:text-gray-300 font-medium select-none cursor-pointer">Mark as Verified User</label>
                        </div>
                    </div>
                </FormSection>

                {(initialData?.created_at || initialData?.last_active_at) && (
                    <FormSection title="Activity & Stats" icon={<Activity className="w-4 h-4" />}>
                        <div className="grid grid-cols-2 gap-4 pt-4">
                            <div className="bg-white dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-700">
                                <div className="text-xs text-gray-500 uppercase flex items-center gap-1 mb-1"><Calendar className="w-3 h-3" /> Joined</div>
                                <div className="text-sm font-medium">{formattedDate(initialData?.created_at)}</div>
                            </div>
                            <div className="bg-white dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-700">
                                <div className="text-xs text-gray-500 uppercase flex items-center gap-1 mb-1"><Activity className="w-3 h-3" /> Last Active</div>
                                <div className="text-sm font-medium">{formattedDate(initialData?.last_active_at)}</div>
                            </div>
                        </div>

                        {initialData?.stats && (
                            <div className="mt-4">
                                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1"><BarChart2 className="w-3 h-3" /> User Stats</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex flex-col">
                                        <span className="text-2xl font-bold">{initialData.stats.friends || 0}</span>
                                        <span className="text-xs text-gray-500">Friends</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-2xl font-bold">{initialData.stats.events || 0}</span>
                                        <span className="text-xs text-gray-500">Events Attended</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </FormSection>
                )}

            </FormLayout>

            {showConfirmDelete && (
                <Modal isOpen={showConfirmDelete} onClose={cancelDelete} title="Confirm Deletion">
                    <div className="p-6">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Delete User?</h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-4">Are you sure you want to delete <span className="font-semibold">{formData.username}</span>? This action cannot be undone.</p>
                        <div className="flex justify-end gap-3">
                            <Button variant="secondary" onClick={cancelDelete}>Cancel</Button>
                            <Button variant="danger" onClick={confirmDelete} isLoading={isDeleting}>Delete User</Button>
                        </div>
                    </div>
                </Modal>
            )
            }
        </>
    );
}
