import React from 'react';
import clsx from 'clsx';
import { EventStatus } from '@/types';
import { isPast, parseISO, endOfDay } from 'date-fns';

interface EventStatusBadgeProps {
    status: EventStatus;
    date?: string; // Optional date for Live/Ended logic
    className?: string;
}

const statusConfig: Record<EventStatus, { label: string; color: string; bg: string }> = {
    MANUAL_DRAFT: { label: 'Draft', color: 'text-gray-700 dark:text-gray-300', bg: 'bg-gray-100 dark:bg-gray-800' },
    SCRAPED_DRAFT: { label: 'Scraped', color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-100 dark:bg-blue-900/30' },
    APPROVED_PENDING_DETAILS: { label: 'Needs Details', color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/30' },
    READY_TO_PUBLISH: { label: 'Ready', color: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-100 dark:bg-indigo-900/30' },
    PUBLISHED: { label: 'Published', color: 'text-green-700 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900/30' },
    REJECTED: { label: 'Rejected', color: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-900/30' },
    ARCHIVED: { label: 'Archived', color: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800' },
    CANCELED: { label: 'Canceled', color: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-900/30' },
};

export function EventStatusBadge({ status, date, className }: EventStatusBadgeProps) {
    const config = statusConfig[status] || statusConfig.MANUAL_DRAFT;
    let label = config.label;
    let bg = config.bg;
    let color = config.color;

    // Custom Live/Ended logic for Published events
    if (status === 'PUBLISHED' && date) {
        const eventDate = new Date(date);
        // Assuming event ends at end of day if no time, or strict check
        // For simplicity: if date < today, it's ended.
        // If date >= today, it's Live/Upcoming.
        // isPast checks against now(). 
        // We want: if (eventDate < today's start) -> Ended
        // Actually, if an event is today, it's LIVE. If yesterday, ENDED.

        // Let's compare just dates strings for simplicity or use parsed dates
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const eDate = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());

        if (eDate < today) {
            label = 'Ended';
            bg = 'bg-gray-200 dark:bg-gray-800';
            color = 'text-gray-600 dark:text-gray-400';
        } else if (eDate.getTime() === today.getTime()) {
            label = 'Live';
            bg = 'bg-green-100 dark:bg-green-900/40';
            color = 'text-green-700 dark:text-green-400';
        } else {
            // Future date, strictly 'Published'
            label = 'Published';
            bg = config.bg;
            color = config.color;
        }
    }

    return (
        <span className={clsx(
            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
            bg,
            color,
            className
        )}>
            {label}
        </span>
    );
}
