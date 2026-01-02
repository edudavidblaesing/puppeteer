import React from 'react';
import { Button } from '@/components/ui/Button';
import { X, Save, Trash2 } from 'lucide-react';

interface FormLayoutProps {
    title: string;
    isModal?: boolean;
    isPanel?: boolean;
    children: React.ReactNode;

    // Actions
    onCancel: () => void;
    onSave?: () => void;
    onDelete?: () => void; // If provided, shows delete button

    // State
    isLoading?: boolean;
    isSaving?: boolean;
    saveLabel?: string;

    // Extra Header Content (e.g. Reset Buttons)
    headerExtras?: React.ReactNode;
}

export function FormLayout({
    title,
    isModal = false,
    isPanel = false,
    children,
    onCancel,
    onSave,
    onDelete,
    isLoading = false,
    isSaving = false,
    saveLabel = 'Save',
    headerExtras
}: FormLayoutProps) {

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800">

            {/* Header */}
            {!isModal && !isPanel && (
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {title}
                        </h2>
                        {headerExtras}
                    </div>

                    <div className="flex items-center gap-2">
                        {onDelete && (
                            <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                onClick={onDelete}
                                disabled={isLoading || isSaving}
                            // leftIcon={<Trash2 className="w-4 h-4" />}
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={onCancel}
                            disabled={isLoading || isSaving}
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Internal Header for Panel Mode (if we want extras there) */}
            {isPanel && headerExtras && (
                <div className="px-6 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2 bg-white dark:bg-gray-950 flex-shrink-0">
                    {headerExtras}
                </div>
            )}

            {/* Content Area - Scrollable */}
            <div className="flex-1 overflow-y-auto">
                <div className="p-6 pb-0 space-y-6 max-w-4xl mx-auto">
                    {children}
                    {/* Spacer for bottom scrolling */}
                    <div className="h-6" />
                </div>
            </div>

            {/* Footer - Fixed */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex justify-end gap-3 flex-shrink-0 z-20">
                <Button
                    variant="secondary"
                    onClick={onCancel}
                    disabled={isLoading || isSaving}
                >
                    Cancel
                </Button>
                {onSave && (
                    <Button
                        onClick={onSave}
                        disabled={isLoading || isSaving}
                        isLoading={isSaving}
                        leftIcon={<Save className="w-4 h-4" />}
                    >
                        {saveLabel}
                    </Button>
                )}
            </div>
        </div>
    );
}
