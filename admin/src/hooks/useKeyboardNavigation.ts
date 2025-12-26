import { useState, useCallback, useEffect } from 'react';
import { Event } from '@/types';

interface UseKeyboardNavigationProps {
    events: Event[];
    onApprove?: (id: string, e: React.KeyboardEvent) => void;
    onReject?: (id: string, e: React.KeyboardEvent) => void;
    onEdit: (event: Event) => void;
}

export function useKeyboardNavigation({ events, onApprove, onReject, onEdit }: UseKeyboardNavigationProps) {
    const [focusedId, setFocusedId] = useState<string | null>(null);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Ignore if input is focused
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;

        if (events.length === 0) return;

        const currentIndex = focusedId ? events.findIndex(ev => ev.id === focusedId) : -1;
        let nextIndex = currentIndex;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                nextIndex = currentIndex < events.length - 1 ? currentIndex + 1 : 0;
                break;
            case 'ArrowUp':
                e.preventDefault();
                nextIndex = currentIndex > 0 ? currentIndex - 1 : events.length - 1;
                break;
            case 'a':
            case 'A':
                if (focusedId && onApprove) {
                    e.preventDefault();
                    onApprove(focusedId, e as unknown as React.KeyboardEvent);
                }
                return;
            case 'r':
            case 'R':
                if (focusedId && onReject) {
                    e.preventDefault();
                    onReject(focusedId, e as unknown as React.KeyboardEvent);
                }
                return;
            case 'Enter':
                if (focusedId) {
                    e.preventDefault();
                    const ev = events.find(e => e.id === focusedId);
                    if (ev) onEdit(ev);
                }
                return;
            default:
                return;
        }

        if (nextIndex !== currentIndex && nextIndex >= 0) {
            const nextId = events[nextIndex].id;
            setFocusedId(nextId);
            // Scroll into view
            const el = document.getElementById(`event-item-${nextId}`);
            if (el) {
                el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }, [events, focusedId, onApprove, onReject, onEdit]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return { focusedId, setFocusedId };
}
