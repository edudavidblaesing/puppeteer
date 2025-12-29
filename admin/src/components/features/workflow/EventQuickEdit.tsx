import React from 'react';
import { format } from 'date-fns';
import { Event } from '@/types';
import { X, CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

interface EventQuickEditProps {
    event: Event | null;
    isOpen: boolean;
    onClose: () => void;
}

export function EventQuickEdit({ event, isOpen, onClose }: EventQuickEditProps) {
    const router = useRouter();
    if (!isOpen || !event) return null;

    const checklist = [
        { label: 'Title', valid: !!event.title },
        { label: 'Date', valid: !!event.date },
        { label: 'Time', valid: !!event.start_time },
        { label: 'Venue', valid: !!event.venue_name },
        { label: 'City', valid: !!event.venue_city },
        { label: 'Image', valid: !!event.flyer_front },
    ];

    const completion = Math.round((checklist.filter(i => i.valid).length / checklist.length) * 100);

    return (
        <div className="fixed inset-y-0 right-0 w-full lg:w-96 bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-800 transform transition-transform duration-300 z-50 overflow-y-auto flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Quick Review</h2>
                <button onClick={onClose} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors">
                    <X className="w-5 h-5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Header Info */}
                <div>
                    <div className="aspect-video rounded-lg bg-gray-100 dark:bg-gray-800 mb-4 overflow-hidden border border-gray-200 dark:border-gray-700 relative group">
                        {event.flyer_front ? (
                            <img src={event.flyer_front} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">No Image</div>
                        )}
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1 leading-tight">{event.title}</h3>
                    <p className="text-sm text-gray-500">
                        {event.date ? format(new Date(event.date), 'MMM d, yyyy') : 'No Date'} • {event.start_time ? (event.start_time.includes('T') ? format(new Date(event.start_time), 'h:mm a') : event.start_time.slice(0, 5)) : 'No time'}
                    </p>
                </div>

                {/* Checklist */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-100 dark:border-gray-800">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Readiness Checklist</h3>
                        <span className={`text-xs font-bold ${completion === 100 ? 'text-green-600 dark:text-green-400' : 'text-primary-600 dark:text-primary-400'}`}>{completion}%</span>
                    </div>

                    <div className="space-y-2">
                        {checklist.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3 text-sm">
                                {item.valid ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                                ) : (
                                    <Circle className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                                )}
                                <span className={item.valid ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}>
                                    {item.label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Source Data Preview */}
                {event.source_references && event.source_references.length > 0 && (
                    <div>
                        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Primary Source Data</h3>
                        <div className="text-xs bg-gray-100 dark:bg-gray-950 p-3 rounded-lg overflow-x-auto border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 font-mono">
                            <pre>{JSON.stringify(event.source_references[0], null, 2)}</pre>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                <Button
                    variant="primary"
                    className="w-full justify-center"
                    onClick={() => {
                        onClose();
                        router.push(`/events/${event.id}`);
                    }}
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                    Edit Full Details
                </Button>
            </div>
        </div>
    );
}
