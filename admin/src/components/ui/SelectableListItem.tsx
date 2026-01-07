import React from 'react';
import clsx from 'clsx';
import { Calendar, Music, Building2, MapPin, Users, Briefcase, Shield, Search } from 'lucide-react';

export interface SelectableListItemProps {
    id: string; // Used for key and selection tracking
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    imageUrl?: string | null;
    imageFallback?: React.ReactNode;

    // Selection State
    selectedIds?: Set<string>;
    onSelect?: (id: string, selected: boolean) => void;
    // OR simpler toggle
    isCheckable?: boolean;
    isChecked?: boolean;
    onToggleSelection?: (id: string) => void;

    // View State
    isActiveView?: boolean; // Is this item currently open in the detail panel?
    onClick?: () => void;

    // Slots
    statusBadge?: React.ReactNode;
    metaRight?: React.ReactNode; // e.g. Dates, Source Icons
    actions?: React.ReactNode; // Always visible actions (e.g. Approve/Reject for Events)
    actionsHover?: React.ReactNode; // e.g. Approve/Reject buttons on hover

    className?: string;
}

export function SelectableListItem({
    id,
    title,
    subtitle,
    imageUrl,
    imageFallback,
    isCheckable = true,
    isChecked = false,
    onToggleSelection,
    isActiveView = false,
    onClick,
    statusBadge,
    metaRight,
    actions,
    actionsHover,
    className
}: SelectableListItemProps) {

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onToggleSelection) {
            onToggleSelection(id);
        }
    };

    return (
        <div
            onClick={onClick}
            className={clsx(
                "group flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-100 dark:border-gray-800 transition-colors relative",
                // Active/Selected View State (Not Checkbox)
                isActiveView
                    ? "bg-primary-50 dark:bg-primary-900/10 border-l-4 border-l-primary-500"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-4 border-l-transparent",
                isActiveView && "z-10",
                className
            )}
        >
            {/* Avatar / Checkbox Area */}
            <div
                className="relative w-12 h-12 flex-shrink-0 group/image cursor-pointer"
                onClick={handleToggle}
            >
                {isCheckable && (
                    <div className={clsx(
                        "absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-200",
                        // Visible if checked OR hovering group
                        isChecked ? "opacity-100 bg-black/20" : "opacity-0 group-hover:opacity-100 group-hover:bg-black/20"
                    )}>
                        <input
                            type="checkbox"
                            checked={isChecked}
                            readOnly
                            className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 bg-white shadow-sm cursor-pointer"
                        />
                    </div>
                )}

                <div className={clsx(
                    "w-full h-full rounded-md overflow-hidden bg-gray-200 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 bg-cover bg-center flex items-center justify-center text-gray-400 transition-opacity",
                    !imageUrl && "bg-gray-100 dark:bg-gray-800",
                    isChecked && "opacity-60"
                )}
                    style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
                >
                    {!imageUrl && (imageFallback || <Search className="w-5 h-5 opacity-50" />)}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                <div className="flex justify-between items-start">
                    {/* Left: Title & Subtitle */}
                    <div className="min-w-0 pr-2">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm leading-tight">
                            {title}
                        </h4>
                        {subtitle && (
                            <div className="flex items-center text-xs text-gray-400 truncate mt-0.5">
                                {subtitle}
                            </div>
                        )}
                    </div>

                    {/* Right: Metadata Stack */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                        {statusBadge && (
                            <div className="mb-0.5">
                                {statusBadge}
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            {actions && <div className="flex items-center gap-1">{actions}</div>}
                            {metaRight}
                        </div>
                    </div>
                </div>
            </div>

            {/* Hover Actions Overlay */}
            {actionsHover && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 animate-in fade-in zoom-in-95 duration-150 bg-white dark:bg-gray-950 p-1 rounded-lg border border-gray-100 dark:border-gray-800 shadow-sm z-30">
                    {actionsHover}
                </div>
            )}
        </div>
    );
}
