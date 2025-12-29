'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOrganizersContext } from '@/contexts/OrganizersContext';
import { OrganizerForm } from '@/components/features/OrganizerForm';
import { useToast } from '@/contexts/ToastContext';
import { Organizer } from '@/types';
import { fetchOrganizer } from '@/lib/api';

export default function OrganizerPage() {
    const params = useParams();
    const id = params.id as string;
    const router = useRouter();
    const { editOrganizer, addOrganizer, removeOrganizer } = useOrganizersContext();
    const { success, error: showError } = useToast();

    const [localOrganizer, setLocalOrganizer] = useState<Organizer | null>(null);
    const [isLoading, setIsLoading] = useState(id !== 'new');

    useEffect(() => {
        if (id === 'new') {
            setIsLoading(false);
            return;
        }

        const loadDetails = async () => {
            try {
                setIsLoading(true);
                const data = await fetchOrganizer(id);
                setLocalOrganizer(data);
            } catch (err) {
                console.error('Failed to fetch organizer details', err);
            } finally {
                setIsLoading(false);
            }
        };

        loadDetails();
    }, [id]);

    const handleSubmit = async (data: Partial<Organizer>) => {
        try {
            if (id === 'new') {
                await addOrganizer(data);
                success('Organizer created successfully');
            } else {
                await editOrganizer(id, data);
                success('Organizer updated successfully');
            }
            router.push('/organizers');
        } catch (error) {
            console.error(error);
            showError('Failed to save organizer');
        }
    };

    const handleDelete = async (organizerId: string) => {
        if (confirm('Are you sure you want to delete this organizer?')) {
            try {
                await removeOrganizer(organizerId);
                router.push('/organizers');
            } catch (error) {
                showError('Failed to delete organizer');
            }
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    if (id !== 'new' && !localOrganizer) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500">
                Organizer not found
            </div>
        );
    }

    return (
        <OrganizerForm
            initialData={localOrganizer || undefined}
            onSubmit={handleSubmit}
            onDelete={handleDelete}
            onCancel={() => router.push('/organizers')}
        />
    );
}
