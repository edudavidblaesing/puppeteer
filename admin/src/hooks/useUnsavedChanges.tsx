import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface UseUnsavedChangesProps {
    isLinkDirty: boolean; // boolean indicating if form is dirty
    onSave?: () => Promise<void>; // Optional save handler for "Save & Continue"
    onDiscard?: () => void; // Optional discard handler
}

/**
 * Hook to manage "Unsaved Changes" modal flow.
 * returns [promptBeforeAction, modalElement]
 */
export function useUnsavedChanges({ isLinkDirty, onSave, onDiscard }: UseUnsavedChangesProps) {
    const [showModal, setShowModal] = useState(false);
    const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const promptBeforeAction = (action: () => void) => {
        if (isLinkDirty) {
            setPendingAction(() => action);
            setShowModal(true);
        } else {
            action();
        }
    };

    const handleDiscard = () => {
        setShowModal(false);
        if (onDiscard) onDiscard();
        if (pendingAction) pendingAction();
        setPendingAction(null);
    };

    const handleSave = async () => {
        if (onSave) {
            setIsSaving(true);
            try {
                await onSave();
                setShowModal(false);
                if (pendingAction) pendingAction();
            } catch (e) {
                console.error("Failed to save from unsaved modal", e);
                // Do not execute pending action if save failed
            } finally {
                setIsSaving(false);
                setPendingAction(null);
            }
        } else {
            // If no save handler, treat as discard or error?
            // Assuming we shouldn't be here if no onSave, but just close modal.
            setShowModal(false);
            if (pendingAction) pendingAction();
            setPendingAction(null);
        }
    };

    const modalElement = (
        <Modal
      isOpen= { showModal }
    onClose = {() => setShowModal(false)
}
title = "Unsaved Changes"
size = "md"
    >
    <div className="space-y-4" >
        <p className="text-gray-600 dark:text-gray-300" >
            You have unsaved changes.Do you want to save them before leaving ?
                </p>
                < div className = "flex justify-end gap-3" >
                    <Button variant="ghost" onClick = {() => { setShowModal(false); setPendingAction(null); }}>
                        Cancel
                        </Button>
                        < Button variant = "danger" onClick = { handleDiscard } >
                            Discard
                            </Button>
{
    onSave && (
        <Button variant="primary" onClick = { handleSave } disabled = { isSaving } >
            { isSaving? 'Saving...': 'Save & Close' }
            </Button>
          )
}
</div>
    </div>
    </Modal>
  );

return {
    promptBeforeAction,
    modalElement
};
}
