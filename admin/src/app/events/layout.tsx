'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { EventWorkflowTable } from '@/components/features/workflow/EventWorkflowTable';
import { EventQuickEdit } from '@/components/features/workflow/EventQuickEdit';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EventsProvider, useEventsContext } from '@/contexts/EventsContext';
import { PaginationControls } from '@/components/ui/PaginationControls';
import clsx from 'clsx';
import { useToast } from '@/contexts/ToastContext';
import { Check, X as XIcon, Globe, Trash2 } from 'lucide-react';

import { Suspense } from 'react';

function EventsLayoutDetails({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    // Determine if we are on a detail page
    const isDetailPage = pathname !== '/events' && pathname !== '/events/';

    const {
        filteredEvents,
        isLoading,
        loadEvents,
        setSearchQuery,
        setStatusFilter,
        searchQuery,
        statusFilter,
        updatesFilter,
        setUpdatesFilter,
        timeFilter,
        setTimeFilter,
        sourceFilter,
        setSourceFilter,
        page,
        setPage,
        totalPages,
        totalItems,
        itemsPerPage
    } = useEventsContext();

    const { success, error } = useToast();

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isMobile, setIsMobile] = useState(false);
    const [sources, setSources] = useState<any[]>([]);
    const [quickEditEvent, setQuickEditEvent] = useState<any>(null);

    const { updateStatus } = useEventsContext();

    // Check for mobile view
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 1024);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Sync URL params
    useEffect(() => {
        if (searchParams.get('hasUpdates') === 'true') {
            setUpdatesFilter('updated');
        }
    }, [searchParams, setUpdatesFilter]);

    // Initial load and fetch sources
    useEffect(() => {
        loadEvents();

        // Fetch sources for dropdown
        fetch('/api/sources').then(res => {
            if (res.ok) return res.json();
            // Fallback if proxy not set or direct call needed
            // Actually we usually import fetchSources from api
            return import('@/lib/api').then(mod => mod.fetchSources());
        }).then(data => {
            // Handle both array or object with data property
            const list = Array.isArray(data) ? data : (data.data || []);
            setSources(list);
        }).catch(err => console.error('Failed to fetch sources', err));

    }, [loadEvents]);

    const handleCreate = () => {
        router.push('/events/new');
    };

    const handleEdit = (event: any) => {
        router.push(`/events/${event.id}`);
    };

    const handleSelect = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) newSelected.delete(id);
        else newSelected.add(id);
        setSelectedIds(newSelected);
    };

    const handleSelectAll = () => {
        if (selectedIds.size === filteredEvents.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(filteredEvents.map(e => e.id)));
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
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Events</h1>
                            <div className="flex items-center gap-2">
                                <Button onClick={handleCreate} leftIcon={<Plus className="w-4 h-4" />}>
                                    Add Event
                                </Button>
                            </div>
                        </div>

                        {/* Filters Row */}
                        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
                            <div className="min-w-[180px] flex-shrink-0">
                                <Input
                                    placeholder="Search events..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    leftIcon={<Search className="w-4 h-4" />}
                                />
                            </div>

                            <select
                                value={timeFilter}
                                onChange={(e) => setTimeFilter(e.target.value as any)}
                                className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                            >
                                <option value="upcoming">Next / Upcoming</option>
                                <option value="past">Past Events</option>
                                <option value="all">Anytime (All)</option>
                            </select>

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

                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as any)}
                                className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                            >
                                <option value="all">All Status</option>
                                <option value="pending">Pending</option>
                                <option value="approved">Approved</option>
                                <option value="rejected">Rejected</option>
                            </select>

                            <select
                                value={updatesFilter}
                                onChange={(e) => setUpdatesFilter(e.target.value as any)}
                                className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                            >
                                <option value="all">Show All</option>
                                <option value="new">New Events</option>
                                <option value="updated">With Updates</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-4">
                            <EventWorkflowTable
                                events={filteredEvents}
                                selectedIds={selectedIds}
                                onSelect={handleSelect}
                                onSelectAll={handleSelectAll}
                                onEdit={handleEdit}
                                onStatusChange={async (id, status) => {
                                    try {
                                        await updateStatus([id], status);
                                        loadEvents();
                                        success('Status updated successfully');
                                    } catch (err: any) {
                                        console.error(err);
                                        error(err.message || 'Failed to update status');
                                    }
                                }}
                            />
                        </div>

                        {/* Pagination Controls */}
                        {!isLoading && (
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
                                    onClick={async () => {
                                        if (confirm(`Approve ${selectedIds.size} events to Pending Details?`)) {
                                            try {
                                                await updateStatus(Array.from(selectedIds), 'APPROVED_PENDING_DETAILS');
                                                loadEvents();
                                                setSelectedIds(new Set());
                                                success(`Approved ${selectedIds.size} events`);
                                            } catch (err: any) {
                                                console.error(err);
                                                error(err.message || 'Failed to approve events');
                                            }
                                        }
                                    }}
                                    className="p-2 rounded-full hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 tooltip"
                                    title="Approve to Pending Details"
                                >
                                    <Check className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={async () => {
                                        // Filter only events that are ready to publish
                                        const readyIds = filteredEvents
                                            .filter(e => selectedIds.has(e.id) && e.status === 'READY_TO_PUBLISH')
                                            .map(e => e.id);

                                        if (readyIds.length === 0) {
                                            error("None of the selected events are 'Ready to Publish'. Please complete their details first.");
                                            return;
                                        }

                                        if (confirm(`Publish ${readyIds.length} ready events? (${selectedIds.size - readyIds.length} skipped)`)) {
                                            try {
                                                await updateStatus(readyIds, 'PUBLISHED');
                                                loadEvents();
                                                setSelectedIds(new Set());
                                                success(`Published ${readyIds.length} events`);
                                            } catch (err: any) {
                                                console.error(err);
                                                error(err.message || 'Failed to publish events');
                                            }
                                        }
                                    }}
                                    className="p-2 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 tooltip"
                                    title="Publish (Ready events only)"
                                >
                                    <Globe className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={async () => {
                                        if (confirm(`Reject ${selectedIds.size} events?`)) {
                                            try {
                                                await updateStatus(Array.from(selectedIds), 'REJECTED');
                                                loadEvents();
                                                setSelectedIds(new Set());
                                                success(`Rejected ${selectedIds.size} events`);
                                            } catch (err: any) {
                                                console.error(err);
                                                error(err.message || 'Failed to reject events');
                                            }
                                        }
                                    }}
                                    className="p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 tooltip"
                                    title="Reject Selected"
                                >
                                    <XIcon className="w-5 h-5" />
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
                    (isDetailPage && !quickEditEvent) ? (isMobile ? "fixed inset-0 z-50 overflow-auto" : "flex-1 min-w-0") : "hidden"
                )}>
                    {children}
                </div>

                {/* Quick Edit Panel */}
                <EventQuickEdit
                    event={quickEditEvent}
                    isOpen={!!quickEditEvent}
                    onClose={() => setQuickEditEvent(null)}
                />

            </div>
        </Layout >
    );
}

function EventsLayoutContent({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <EventsLayoutDetails>{children}</EventsLayoutDetails>
        </Suspense>
    );
}

export default function EventsLayout({ children }: { children: React.ReactNode }) {
    return (
        <EventsProvider>
            <EventsLayoutContent>{children}</EventsLayoutContent>
        </EventsProvider>
    );
}
