import React from 'react';
import { ResetSectionButton } from '@/components/ui/ResetSectionButton';

interface FormSectionProps {
    title: React.ReactNode;
    icon?: React.ReactNode;
    children?: React.ReactNode;

    // For Reset functionality
    onReset?: (source: string) => void;
    sources?: string[];
}

export function FormSection({
    title,
    icon,
    children,
    onReset,
    sources = []
}: FormSectionProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between sticky top-0 z-10 bg-white dark:bg-gray-900 py-2 -mx-6 px-6 border-b border-gray-100 dark:border-gray-800">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    {icon}
                    {title}
                </h3>
                {onReset && sources.length > 0 && (
                    <ResetSectionButton
                        sources={sources}
                        onReset={onReset}
                    />
                )}
            </div>
            <div>
                {children}
            </div>
        </div>
    );
}
