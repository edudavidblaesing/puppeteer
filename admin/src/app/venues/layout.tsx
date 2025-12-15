'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { VenueList } from '@/components/features/VenueList';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { VenuesProvider, useVenuesContext } from '@/contexts/VenuesContext';
import clsx from 'clsx';
import { useToast } from '@/contexts/ToastContext';

function VenuesLayoutContent({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const isDetailPage = pathname !== '/venues' && pathname !== '/venues/';

    const {
        venues,
        isLoading,
        loadVenues
    } = useVenuesContext();

    const [searchQuery, setSearchQuery] = useState('');
    const [isMobile, setIsMobile] = useState(false);

    // Check for mobile view
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 1024);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Initial load
    useEffect(() => {
        loadVenues();
    }, [loadVenues]);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery) {
                loadVenues({ search: searchQuery });
            } else {
                loadVenues();
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery, loadVenues]);

    const handleCreate = () => {
        router.push('/venues/new');
    };

    const handleEdit = (venue: any) => {
        router.push(`/venues/${venue.id}`);
    };

    return (
        <Layout>
            <div className="flex h-full">
                {/* Left Panel - List */}
                <div className={clsx(
                    "flex-1 flex flex-col min-w-0 bg-gray-50 dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 transition-all duration-300",
                    (!isMobile || !isDetailPage) ? "block" : "hidden",
                    isDetailPage && !isMobile ? "w-1/2 max-w-3xl" : "w-full"
                )}>
                    {/* Toolbar */}
                    <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 space-y-4">
                        <div className="flex items-center justify-between gap-4">
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Venues</h1>
                            <Button onClick={handleCreate} leftIcon={<Plus className="w-4 h-4" />}>
                                Add Venue
                            </Button>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <div className="flex-1 min-w-[200px]">
                                <Input
                                    placeholder="Search venues..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    leftIcon={<Search className="w-4 h-4" />}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        <VenueList
                            venues={venues}
                            isLoading={isLoading}
                            onEdit={handleEdit}
                        />
                    </div>
                </div>

                {/* Right Panel - Children (Form) */}
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

export default function VenuesLayout({ children }: { children: React.ReactNode }) {
    return (
        <VenuesProvider>
            <VenuesLayoutContent>{children}</VenuesLayoutContent>
        </VenuesProvider>
    );
}
