'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Layout } from '@/components/Layout';
import { EventList } from '@/components/features/EventList';
import { EventForm } from '@/components/features/EventForm';
import { ScrapeDashboard } from '@/components/features/ScrapeDashboard';
import { Modal } from '@/components/ui/Modal';
import { useEvents } from '@/hooks/useEvents';
import { useScraper } from '@/hooks/useScraper';
import { Event } from '@/types';
import clsx from 'clsx';

export default function ScrapePage() {
  const router = useRouter();
  const {
    filteredEvents,
    isLoading: isEventsLoading,
    loadEvents,
    editEvent,
    removeEvent,
    setStatusFilter,
    statusFilter
  } = useEvents();

  const {
    stats,
    history,
    isSyncing,
    syncProgress,
    loadStats,
    runScraper,
    runMatching
  } = useScraper();

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Check for mobile view
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initial load
  useEffect(() => {
    setStatusFilter('pending');
    loadEvents();
    loadStats();
  }, [loadEvents, loadStats, setStatusFilter]);

  const handleEdit = (event: Event) => {
    setSelectedEvent(event);
  };

  const handleClosePanel = () => {
    setSelectedEvent(null);
  };

  const handleSubmit = async (data: Partial<Event>) => {
    try {
      if (selectedEvent) {
        await editEvent(selectedEvent.id, data);
      }
      handleClosePanel();
    } catch (error) {
      console.error(error);
      alert('Failed to save event');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this event?')) {
      await removeEvent(id);
      if (selectedEvent?.id === id) {
        handleClosePanel();
      }
    }
  };

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
    if (selectedIds.size === filteredEvents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEvents.map((e: any) => e.id)));
    }
  };

  return (
    <Layout>
      <div className="flex h-full">
        {/* Left Panel - List */}
        <div className={clsx(
          "flex-1 flex flex-col min-w-0 bg-gray-50 dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 transition-all duration-300",
          (selectedEvent || !isMobile) ? "w-1/2 max-w-3xl" : "w-full"
        )}>
          {/* Toolbar */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Scraper & Pending</h1>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {filteredEvents.length} pending events review
            </div>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto p-4">
            <EventList
              events={filteredEvents}
              isLoading={isEventsLoading}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              onSelectAll={handleSelectAll}
              onEdit={handleEdit}
              onVenueClick={(id) => router.push(`/venues?venueId=${id}`)}
              onArtistClick={(name) => router.push(`/artists?search=${encodeURIComponent(name)}`)}
            />
          </div>
        </div>

        {/* Right Panel - Dashboard or Edit */}
        {!isMobile && (
          <div className="flex-1 min-w-0 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-xl z-10">
            {selectedEvent ? (
              <EventForm
                initialData={selectedEvent}
                onSubmit={handleSubmit}
                onDelete={handleDelete}
                onCancel={handleClosePanel}
              />
            ) : (
              <ScrapeDashboard
                stats={stats}
                history={history}
                isSyncing={isSyncing}
                syncProgress={syncProgress}
                onRunScraper={runScraper}
                onRunMatching={runMatching}
              />
            )}
          </div>
        )}

        {/* Mobile Modal - Edit */}
        {isMobile && (
          <Modal
            isOpen={!!selectedEvent}
            onClose={handleClosePanel}
            title="Edit Event"
          >
            <EventForm
              initialData={selectedEvent || undefined}
              onSubmit={handleSubmit}
              onDelete={handleDelete}
              onCancel={handleClosePanel}
            />
          </Modal>
        )}
      </div>
    </Layout>
  );
}
