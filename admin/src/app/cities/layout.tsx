'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { CityList } from '@/components/features/CityList';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CitiesProvider, useCitiesContext } from '@/contexts/CitiesContext';
import clsx from 'clsx';
import { useToast } from '@/contexts/ToastContext';

function CitiesLayoutContent({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const isDetailPage = pathname !== '/cities' && pathname !== '/cities/';

    const {
        filteredCities,
        isLoading,
        loadCities,
        setSearchQuery,
        searchQuery
    } = useCitiesContext();

    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 1024);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        loadCities();
    }, [loadCities]);

    const handleCreate = () => {
        router.push('/cities/new');
    };

    const handleEdit = (city: any) => {
        router.push(`/cities/${city.id}`);
    };

    return (
        <Layout>
            <div className="flex h-full">
                {/* Left Panel */}
                <div className={clsx(
                    "flex-1 flex flex-col min-w-0 bg-gray-50 dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 transition-all duration-300",
                    (!isMobile || !isDetailPage) ? "block" : "hidden",
                    isDetailPage && !isMobile ? "w-1/2 max-w-3xl" : "w-full"
                )}>
                    {/* Toolbar */}
                    <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 space-y-4">
                        <div className="flex items-center justify-between gap-4">
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Cities</h1>
                            <Button onClick={handleCreate} leftIcon={<Plus className="w-4 h-4" />}>
                                Add City
                            </Button>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <div className="flex-1 min-w-[200px]">
                                <Input
                                    placeholder="Search cities..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    leftIcon={<Search className="w-4 h-4" />}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        <CityList
                            cities={filteredCities}
                            isLoading={isLoading}
                            onEdit={handleEdit}
                        />
                    </div>
                </div>

                {/* Right Panel */}
                <div className={clsx(
                    "bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-xl z-10 transition-all",
                    isDetailPage ? (isMobile ? "fixed inset-0 z-50 overflow-auto" : "flex-1 min-w-0") : "hidden"
                )}>
                    {children}
                </div>

            </div>
        </Layout>
    );
}

export default function CitiesLayout({ children }: { children: React.ReactNode }) {
    return (
        <CitiesProvider>
            <CitiesLayoutContent>{children}</CitiesLayoutContent>
        </CitiesProvider>
    );
}
