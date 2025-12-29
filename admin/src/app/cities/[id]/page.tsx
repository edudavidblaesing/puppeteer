'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCitiesContext } from '@/contexts/CitiesContext';
import { CityForm } from '@/components/features/CityForm';
import { useToast } from '@/contexts/ToastContext';
import { City } from '@/types';

export default function CityPage() {
    const params = useParams();
    const id = params.id as string;
    const router = useRouter();
    const { cities, editCity, addCity, removeCity, isLoading: isListLoading } = useCitiesContext();
    const { success, error: showError } = useToast();

    const [localCity, setLocalCity] = useState<City | null>(null);
    const [isLoading, setIsLoading] = useState(id !== 'new');

    useEffect(() => {
        if (id === 'new') {
            setIsLoading(false);
            return;
        }

        const found = cities.find(c => c.id === Number(id));
        if (found) {
            setLocalCity(found);
            setIsLoading(false);
        } else if (!isListLoading) {
            // Stop loading
            setIsLoading(false);
        }
    }, [cities, id, isListLoading]);

    const handleSubmit = async (data: Partial<City>) => {
        try {
            if (id === 'new') {
                await addCity(data);
                success('City created successfully');
            } else {
                await editCity(Number(id), data);
                success('City updated successfully');
            }
            router.push('/cities');
        } catch (error) {
            console.error(error);
            showError('Failed to save city');
        }
    };

    const handleDelete = async (cityId: string) => {
        if (confirm('Are you sure you want to delete this city?')) {
            try {
                await removeCity(Number(cityId));
                router.push('/cities');
            } catch (error) {
                showError('Failed to delete city');
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

    if (id !== 'new' && !localCity) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500">
                City not found
            </div>
        );
    }

    return (
        <CityForm
            initialData={localCity || undefined}
            onSubmit={handleSubmit}
            onDelete={handleDelete}
            onCancel={() => router.push('/cities')}
        />
    );
}
