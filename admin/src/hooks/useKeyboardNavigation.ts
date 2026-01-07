import { useEffect, useCallback, useState } from 'react';

type KeyHandler = (e: KeyboardEvent) => void;

interface KeyboardNavigationOptions {
    events?: any[]; // For internal state management
    onArrowUp?: () => void;
    onArrowDown?: () => void;
    onEnter?: () => void;
    onEscape?: () => void;
    onSave?: () => void; // Cmd+S
    onSearch?: () => void; // Cmd+K
    onNew?: () => void; // Cmd+N or similar
    onApprove?: (id: string, e: any) => void;
    onReject?: (id: string, e: any) => void;
    onEdit?: (id: string) => void;
    onDelete?: (id: string, e: any) => void;
    onSpace?: () => void; // New handler for Space key
    disabled?: boolean;
}

export function useKeyboardNavigation({
    events = [],
    onArrowUp,
    onArrowDown,
    onEnter,
    onEscape,
    onSave,
    onSearch,
    onNew,
    onApprove,
    onReject,
    onEdit,
    onDelete,
    onSpace,
    disabled = false
}: KeyboardNavigationOptions) {
    const [activeIndex, setActiveIndex] = useState(-1);

    // Reset index when events change
    useEffect(() => {
        setActiveIndex(-1);
    }, [events]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (disabled) return;

        // Global Shortcuts
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            onSearch?.();
            return;
        }

        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            onSave?.();
            return;
        }

        // Context-sensitive keys
        const target = e.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

        if (e.key === 'Escape') {
            onEscape?.();
            return;
        }

        if (!isInput) {
            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    if (onArrowUp) {
                        onArrowUp();
                    } else if (events.length > 0) {
                        setActiveIndex(prev => prev > 0 ? prev - 1 : prev);
                    }
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    if (onArrowDown) {
                        onArrowDown();
                    } else if (events.length > 0) {
                        setActiveIndex(prev => prev < events.length - 1 ? prev + 1 : prev);
                    }
                    break;
                case 'Enter':
                    if (target.tagName !== 'BUTTON' && target.tagName !== 'A') {
                        e.preventDefault();
                        if (onEnter) {
                            onEnter();
                        } else if (activeIndex >= 0 && events[activeIndex]) {
                            // Default enter behavior for list items? Could be onEdit
                            if (onEdit) onEdit(events[activeIndex].id);
                        }
                    }
                    break;
                case ' ': // Space key for selection
                    if (target.tagName !== 'BUTTON' && target.tagName !== 'INPUT') {
                        e.preventDefault(); // Prevent scrolling
                        if (onSpace) onSpace();
                    }
                    break;
                case 'a':
                case 'A':
                    if (onApprove && activeIndex >= 0 && events[activeIndex]) {
                        e.preventDefault();
                        onApprove(events[activeIndex].id, e);
                    }
                    break;
                case 'r':
                case 'R':
                    if (onReject && activeIndex >= 0 && events[activeIndex]) {
                        e.preventDefault();
                        onReject(events[activeIndex].id, e);
                    }
                    break;
                case 'd':
                case 'D':
                    if (onDelete && activeIndex >= 0 && events[activeIndex]) {
                        e.preventDefault();
                        onDelete(events[activeIndex].id, e);
                    }
                    break;
            }
        }
    }, [events, activeIndex, onArrowUp, onArrowDown, onEnter, onEscape, onSave, onSearch, onApprove, onReject, onEdit, onDelete, onSpace, disabled]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return {
        focusedId: (activeIndex >= 0 && events[activeIndex]) ? events[activeIndex].id : null,
        activeIndex,
        setActiveIndex
    };
}
