'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useEventsContext } from '@/contexts/EventsContext';
import { EventForm } from '@/components/features/EventForm';
import { useToast } from '@/contexts/ToastContext';
import { Event } from '@/types';

export default function EventPage() {
    const params = useParams();
    const id = params.id as string;
    const router = useRouter();
    const { events, editEvent, addEvent, removeEvent, isLoading: isListLoading } = useEventsContext();
    const { success, error: showError } = useToast();

    const [localEvent, setLocalEvent] = useState<Event | null>(null);
    const [isLoading, setIsLoading] = useState(id !== 'new');

    useEffect(() => {
        if (id === 'new') {
            setIsLoading(false);
            return;
        }

        const found = events.find((e: Event) => e.id === id);
        if (found) {
            setLocalEvent(found);
            setIsLoading(false);
        } else if (!isListLoading) {
            // Stop loading if list is ready and item not found
            setIsLoading(false);
        }
    }, [events, id, isListLoading]);

    // Navigation Logic
    const currentIndex = events.findIndex((e: Event) => e.id === id);
    const prevEventId = currentIndex > 0 ? events[currentIndex - 1].id : undefined;
    const nextEventId = currentIndex >= 0 && currentIndex < events.length - 1 ? events[currentIndex + 1].id : undefined;

    const handleSubmit = async (data: Partial<Event>) => {
        try {
            if (id === 'new') {
                await addEvent(data);
                success('Event created successfully');
            } else {
                await editEvent(id, data);
                success('Event updated successfully');
            }
        } catch (error) {
            console.error(error);
            showError('Failed to save event');
            throw error; // Re-throw so form knows it failed
        }
    };

    const handleDelete = async (eventId: string) => {
        if (confirm('Are you sure you want to delete this event?')) {
            try {
                await removeEvent(eventId);
                router.push('/events');
            } catch (error) {
                showError('Failed to delete event');
            }
        }
    };

    if (isLoading || (id !== 'new' && isListLoading)) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    if (id !== 'new' && !localEvent) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500">
                Event not found
            </div>
        );
    }

    return (
        <EventForm
            initialData={localEvent || undefined}
            onSubmit={handleSubmit}
            onDelete={handleDelete}
            onCancel={() => router.push('/events')}
            prevEventId={prevEventId}
            nextEventId={nextEventId}
            onNavigate={(targetId) => router.push(`/events/${targetId}`)}
        />
    );
}
