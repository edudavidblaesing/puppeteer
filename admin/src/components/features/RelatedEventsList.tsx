
import React from 'react';
import { Event } from '@/types';
import { Calendar, MapPin, ExternalLink, Edit2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

interface RelatedEventsListProps {
    events?: Event[];
    title?: string;
    emptyMessage?: string;
    onEdit?: (event: Event) => void;
}

export function RelatedEventsList({
    events = [],
    title = "Upcoming Events",
    emptyMessage = "No upcoming events found.",
    onEdit
}: RelatedEventsListProps) {

    if (!events || events.length === 0) {
        return (
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-6 text-center border border-gray-100 dark:border-gray-800">
                <p className="text-gray-500 dark:text-gray-400 text-sm">{emptyMessage}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> {title} ({events.length})
            </h3>

            <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                    {events.map((event) => (
                        <div
                            key={event.id}
                            className="p-3 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors flex items-center justify-between group"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                                        {new Date(event.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </span>
                                    {onEdit ? (
                                        <button
                                            onClick={(e) => { e.preventDefault(); onEdit(event); }}
                                            className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate hover:text-indigo-600 dark:hover:text-indigo-400 block text-left"
                                        >
                                            {event.title}
                                        </button>
                                    ) : (
                                        <Link
                                            href={`/events/${event.id}`}
                                            className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate hover:text-indigo-600 dark:hover:text-indigo-400 block"
                                        >
                                            {event.title}
                                        </Link>
                                    )}
                                </div>

                                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                                    {(event.venue_name || event.venue_city) && (
                                        <div className="flex items-center gap-1">
                                            <MapPin className="w-3 h-3" />
                                            <span className="truncate max-w-[150px]">
                                                {event.venue_name}{event.venue_name && event.venue_city ? ', ' : ''}{event.venue_city}
                                            </span>
                                        </div>
                                    )}
                                    {event.start_time && (
                                        <span>
                                            {event.start_time.split(':').slice(0, 2).join(':')}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {onEdit ? (
                                <button
                                    onClick={(e) => { e.preventDefault(); onEdit(event); }}
                                    className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-indigo-600 transition-all"
                                    title="Edit Event"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                            ) : (
                                <Link
                                    href={`/events/${event.id}`}
                                    className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-indigo-600 transition-all"
                                    title="View Event"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                </Link>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
