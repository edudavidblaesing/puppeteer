'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useVenuesContext } from '@/contexts/VenuesContext';
import { VenueForm } from '@/components/features/VenueForm';
import { useToast } from '@/contexts/ToastContext';
import { Venue } from '@/types';
import { fetchVenue } from '@/lib/api';

export default function VenuePage() {
    const params = useParams();
    const id = params.id as string;
    const router = useRouter();
    const { editVenue, addVenue, removeVenue } = useVenuesContext();
    const { success, error: showError } = useToast();

    const [localVenue, setLocalVenue] = useState<Venue | null>(null);
    const [isLoading, setIsLoading] = useState(id !== 'new');

    useEffect(() => {
        if (id === 'new') {
            setIsLoading(false);
            return;
        }

        const loadDetails = async () => {
            try {
                setIsLoading(true);
                const data = await fetchVenue(id);
                setLocalVenue(data);
            } catch (err) {
                console.error('Failed to fetch venue details', err);
                // Could fallback to context venues default values logic if needed?
            } finally {
                setIsLoading(false);
            }
        };

        loadDetails();
    }, [id]);

    const handleSubmit = async (data: Partial<Venue>) => {
        try {
            if (id === 'new') {
                await addVenue(data);
                success('Venue created successfully');
            } else {
                await editVenue(id, data);
                success('Venue updated successfully');
            }
            router.push('/venues');
        } catch (error) {
            console.error(error);
            showError('Failed to save venue');
        }
    };

    const handleDelete = async (venueId: string) => {
        if (confirm('Are you sure you want to delete this venue?')) {
            try {
                await removeVenue(venueId);
                router.push('/venues');
            } catch (error) {
                showError('Failed to delete venue');
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

    if (id !== 'new' && !localVenue) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500">
                Venue not found
            </div>
        );
    }

    return (
        <VenueForm
            initialData={localVenue || undefined}
            onSubmit={handleSubmit}
            onDelete={handleDelete}
            onCancel={() => router.push('/venues')}
        />
    );
}
