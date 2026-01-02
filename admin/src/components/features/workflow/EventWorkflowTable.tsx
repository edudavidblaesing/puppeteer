import React from 'react';
import { format } from 'date-fns';
import { Event, EventStatus } from '@/types';
import { EventStatusBadge } from './EventStatusBadge';
import { EventActionCell } from './EventActionCell';
import { SourceIcon } from '@/components/ui/SourceIcon';
import clsx from 'clsx';
import { CheckCircle2, Circle } from 'lucide-react';

interface EventWorkflowTableProps {
    events: Event[];
    selectedIds: Set<string>;
    onSelect: (id: string) => void;
    onSelectAll: () => void;
    onEdit: (event: Event) => void;
    onStatusChange: (id: string, status: EventStatus) => Promise<void>;
}

import { Keyboard } from 'lucide-react';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';

export function EventWorkflowTable({
    events,
    selectedIds,
    onSelect,
    onSelectAll,
    onEdit,
    onStatusChange
}: EventWorkflowTableProps) {

    const handleApprove = (id: string) => onStatusChange(id, 'APPROVED_PENDING_DETAILS');
    const handleReject = (id: string) => onStatusChange(id, 'REJECTED');
    const handlePublish = (id: string) => onStatusChange(id, 'PUBLISHED');

    const { focusedId } = useKeyboardNavigation({
        events,
        onApprove: (id) => handleApprove(id),
        onReject: (id) => handleReject(id),
        onEdit: (id) => {
            const event = events.find(e => e.id === id);
            if (event) onEdit(event);
        }
    });

    if (events.length === 0) {
        return <div className="p-8 text-center text-gray-500">No events found matching current filters.</div>;
    }

    return (
        <div className="min-w-full inline-block align-middle">
            {/* Shortcut Legend */}
            <div className="mb-2 flex justify-end">
                <div className="flex items-center gap-2 text-[10px] md:text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">
                    <Keyboard className="w-3 h-3" />
                    <span className="font-mono">↑↓</span> <span className="hidden sm:inline">Nav</span>
                    <span className="text-gray-300 dark:text-gray-600 mx-1">•</span>
                    <span className="font-mono">A</span> <span className="hidden sm:inline">Approve</span>
                    <span className="text-gray-300 dark:text-gray-600 mx-1">•</span>
                    <span className="font-mono">R</span> <span className="hidden sm:inline">Reject</span>
                    <span className="text-gray-300 dark:text-gray-600 mx-1">•</span>
                    <span className="font-mono">Enter</span> <span className="hidden sm:inline">Edit</span>
                </div>
            </div>

            <div className="border rounded-lg overflow-hidden dark:border-gray-800">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                            <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase w-10">
                                <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                    checked={events.length > 0 && selectedIds.size === events.length}
                                    onChange={onSelectAll}
                                />
                            </th>
                            <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
                            <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                            <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th scope="col" className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-950">
                        {events.map((event) => (
                            <tr
                                key={event.id}
                                id={`event-item-${event.id}`}
                                className={clsx(
                                    "hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors",
                                    selectedIds.has(event.id) && "bg-primary-50 dark:bg-primary-900/10",
                                    focusedId === event.id && "ring-2 ring-primary-500 z-10 bg-primary-50 dark:bg-primary-900/20"
                                )}
                            >
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                        checked={selectedIds.has(event.id)}
                                        onChange={() => onSelect(event.id)}
                                    />
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center">
                                        <div className="h-10 w-10 flex-shrink-0 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden mr-3 border border-gray-200 dark:border-gray-700">
                                            {event.flyer_front ? (
                                                <img src={event.flyer_front} alt="" className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="h-full w-full flex items-center justify-center text-gray-400 text-xs">IMG</div>
                                            )}
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-primary-600 cursor-pointer" onClick={() => onEdit(event)}>
                                                {event.title}
                                            </div>
                                            <div className="text-xs text-gray-500">{event.venue_name || 'No Venue'} • {event.venue_city || 'No City'}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                    {event.date ? format(new Date(event.date), 'MMM d, yyyy') : '-'}
                                    <div className="text-xs text-gray-400">{event.start_time?.slice(0, 5)}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex -space-x-1 overflow-hidden">
                                        {(event.source_references || []).map((ref: any, idx) => (
                                            <SourceIcon key={idx} sourceCode={ref.source_code} className="inline-block h-5 w-5 rounded-full ring-2 ring-white dark:ring-gray-900" />
                                        ))}
                                        {(!event.source_references || event.source_references.length === 0) && (
                                            <span className="text-xs text-gray-400">Manual</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <EventStatusBadge status={event.status || 'MANUAL_DRAFT'} date={event.date} />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <EventActionCell
                                        event={event}
                                        onApprove={handleApprove}
                                        onReject={handleReject}
                                        onPublish={handlePublish}
                                        onEdit={onEdit}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
