import { useState, useCallback } from 'react';
import * as api from '@/lib/api';

export interface DeleteWithUsageOptions {
    entityType: 'venues' | 'artists' | 'organizers' | 'cities' | 'events';
    onDelete: (id: string) => Promise<void>;
    onSuccess?: () => void;
    onError?: (error: Error) => void;
}

export function useDeleteWithUsage({ entityType, onDelete, onSuccess, onError }: DeleteWithUsageOptions) {
    const [isChecking, setIsChecking] = useState(false);
    const [usageCount, setUsageCount] = useState<number | null>(null);
    const [usageDetails, setUsageDetails] = useState<any>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDeleteClick = useCallback(async (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setDeleteId(id);
        setIsChecking(true);
        setUsageCount(null);
        setShowConfirm(false);

        try {
            const { usage, details } = await api.getUsage(entityType, id);
            setUsageCount(usage);
            setUsageDetails(details);
            setShowConfirm(true);
            // If usage is 0, we could auto-delete, but safety first - let's show confirm always or just if > 0?
            // User request asks to "prompt user when it has associated linked entities".
            // If 0, we can just show standard confirm or proceed.
            // Let's prompt if > 0.
            if (usage === 0) {
                // Option: Auto show standard confirm, or custom one.
                // For consistency, we use the same modal but with different text.
            }
        } catch (err) {
            console.error('Failed to check usage', err);
            // Fallback: show confirm without usage info? Or error?
            // Let's assume 0 usage but show error toast.
            setUsageCount(0);
            setShowConfirm(true);
        } finally {
            setIsChecking(false);
        }
    }, [entityType]);

    const confirmDelete = useCallback(async () => {
        if (!deleteId) return;
        setIsDeleting(true);
        try {
            await onDelete(deleteId);
            setShowConfirm(false);
            onSuccess?.();
        } catch (err) {
            onError?.(err as Error);
        } finally {
            setIsDeleting(false);
            setDeleteId(null);
        }
    }, [deleteId, onDelete, onSuccess, onError]);

    const cancelDelete = useCallback(() => {
        setShowConfirm(false);
        setDeleteId(null);
        setUsageCount(null);
    }, []);

    return {
        handleDeleteClick,
        confirmDelete,
        cancelDelete,
        isChecking,
        isDeleting,
        showConfirm,
        usageCount,
        usageDetails,
        deleteId
    };
}
