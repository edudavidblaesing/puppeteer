'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useArtistsContext } from '@/contexts/ArtistsContext';
import { ArtistForm } from '@/components/features/ArtistForm';
import { useToast } from '@/contexts/ToastContext';
import { Artist } from '@/types';
import { fetchArtist } from '@/lib/api';

export default function ArtistPage() {
    const params = useParams();
    const id = params.id as string;
    const router = useRouter();
    const { editArtist, addArtist, removeArtist } = useArtistsContext();
    const { success, error: showError } = useToast();

    const [localArtist, setLocalArtist] = useState<Artist | null>(null);
    const [isLoading, setIsLoading] = useState(id !== 'new');

    useEffect(() => {
        if (id === 'new') {
            setIsLoading(false);
            return;
        }

        const loadDetails = async () => {
            try {
                setIsLoading(true);
                const data = await fetchArtist(id);
                setLocalArtist(data);
            } catch (err) {
                console.error('Failed to fetch artist details', err);
            } finally {
                setIsLoading(false);
            }
        };

        loadDetails();
    }, [id]);

    const handleSubmit = async (data: Partial<Artist>) => {
        try {
            if (id === 'new') {
                await addArtist(data);
                success('Artist created successfully');
            } else {
                await editArtist(id, data);
                success('Artist updated successfully');
            }
            router.push('/artists');
        } catch (error) {
            console.error(error);
            showError('Failed to save artist');
        }
    };

    const handleDelete = async (artistId: string) => {
        if (confirm('Are you sure you want to delete this artist?')) {
            try {
                await removeArtist(artistId);
                router.push('/artists');
            } catch (error) {
                showError('Failed to delete artist');
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

    if (id !== 'new' && !localArtist) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500">
                Artist not found
            </div>
        );
    }

    return (
        <ArtistForm
            initialData={localArtist || undefined}
            onSubmit={handleSubmit}
            onDelete={handleDelete}
            onCancel={() => router.push('/artists')}
        />
    );
}
