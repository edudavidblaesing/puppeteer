'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Plus, Search, Trash2, Check } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { VenueTable } from '@/components/features/tables/VenueTable';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { fetchSources } from '@/lib/api';
import { VenuesProvider, useVenuesContext } from '@/contexts/VenuesContext';
import { PaginationControls } from '@/components/ui/PaginationControls';
import clsx from 'clsx';
import { useToast } from '@/contexts/ToastContext';

function VenuesLayoutDetails({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const isDetailPage = pathname !== '/venues' && pathname !== '/venues/';

    const {
        venues,
        isLoading,
        loadVenues,
        page,
        setPage,
        totalPages,
        totalItems,
        itemsPerPage,
        searchQuery,
        setSearchQuery,
        sourceFilter,
        setSourceFilter,
        removeVenue
    } = useVenuesContext();

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const handleSelect = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const handleSelectAll = () => {
        if (selectedIds.size === venues.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(venues.map(v => v.id)));
        }
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Are you sure you want to delete ${selectedIds.size} venues?`)) return;

        // Sequential for now, or Promise.all
        const ids = Array.from(selectedIds);
        for (const id of ids) {
            await removeVenue(id);
        }
        setSelectedIds(new Set());
    };

    const [sources, setSources] = useState<any[]>([]);

    useEffect(() => {
        fetchSources().then(setSources).catch(console.error);
    }, []);

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
                            <select
                                value={sourceFilter}
                                onChange={(e) => setSourceFilter(e.target.value)}
                                className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white max-w-[150px]"
                            >
                                <option value="">All Sources</option>
                                <option value="manual">Manual</option>
                                {sources.filter(s => s.code !== 'manual' && s.code !== 'original').map(s => (
                                    <option key={s.id} value={s.code}>{s.name || s.code}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-4">
                            <VenueTable
                                venues={venues}
                                selectedIds={selectedIds}
                                onSelect={handleSelect}
                                onSelectAll={handleSelectAll}
                                onEdit={handleEdit}
                                onDelete={async (id) => {
                                    if (confirm('Delete this venue?')) {
                                        await removeVenue(id);
                                    }
                                }}
                            />
                        </div>

                        {/* Pagination Controls */}
                        {!isLoading && venues.length > 0 && (
                            <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 z-10 flex-shrink-0">
                                <PaginationControls
                                    currentPage={page}
                                    totalPages={totalPages}
                                    onPageChange={setPage}
                                    totalItems={totalItems}
                                    itemsPerPage={itemsPerPage}
                                />
                            </div>
                        )}

                        {/* Bulk Action Bar */}
                        <div className={clsx(
                            "absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl rounded-full px-6 py-3 flex items-center gap-4 transition-all duration-300 z-20",
                            selectedIds.size > 0 ? "translate-y-0 opacity-100" : "translate-y-20 opacity-0 pointer-events-none"
                        )}>
                            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 pr-4">
                                {selectedIds.size} selected
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleBulkDelete}
                                    className="p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 tooltip"
                                    title="Delete Selected"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                                <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1"></div>
                                <button
                                    onClick={() => setSelectedIds(new Set())}
                                    className="text-xs font-medium text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
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

function VenuesLayoutContent({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <VenuesLayoutDetails>{children}</VenuesLayoutDetails>
        </Suspense>
    );
}

export default function VenuesLayout({ children }: { children: React.ReactNode }) {
    return (
        <VenuesProvider>
            <VenuesLayoutContent>{children}</VenuesLayoutContent>
        </VenuesProvider>
    );
}
