import React, { useState } from 'react';
import { Event, EventStatus } from '@/types';
import { Check, X, Upload, MoreHorizontal, Edit, Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface EventActionCellProps {
    event: Event;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
    onPublish: (id: string) => void;
    onEdit: (event: Event) => void;
}

export function EventActionCell({ event, onApprove, onReject, onPublish, onEdit }: EventActionCellProps) {
    const [loading, setLoading] = useState(false);

    const handleAction = async (action: () => void) => {
        setLoading(true);
        try {
            await action();
        } finally {
            setLoading(false);
        }
    };

    switch (event.status) {
        case 'MANUAL_DRAFT':
        case 'SCRAPED_DRAFT':
            return (
                <div className="flex items-center justify-end gap-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={() => handleAction(() => onApprove(event.id))}
                        disabled={loading}
                        title="Approve / Mark as Draft"
                    >
                        <Check className="w-4 h-4" />
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleAction(() => onReject(event.id))}
                        disabled={loading}
                        title="Reject"
                    >
                        <X className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onEdit(event)}>
                        <Edit className="w-4 h-4 text-gray-500" />
                    </Button>
                </div>
            );

        case 'APPROVED_PENDING_DETAILS':
            return (
                <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="secondary" onClick={() => onEdit(event)}>
                        Complete Details
                    </Button>
                </div>
            );

        case 'READY_TO_PUBLISH':
            return (
                <div className="flex items-center justify-end gap-1">
                    <Button
                        size="sm"
                        variant="primary"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        onClick={() => handleAction(() => onPublish(event.id))}
                        disabled={loading}
                    >
                        <Upload className="w-4 h-4 mr-1" /> Publish
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onEdit(event)}>
                        <Edit className="w-4 h-4 text-gray-500" />
                    </Button>
                </div>
            );

        case 'PUBLISHED':
            return (
                <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onEdit(event)}>
                        <Edit className="w-4 h-4 text-gray-500" />
                    </Button>
                </div>
            );

        default:
            return (
                <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onEdit(event)}>
                        <Edit className="w-4 h-4 text-gray-500" />
                    </Button>
                </div>
            );
    }
}
