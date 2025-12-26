import React, { useState } from 'react';
import { Event } from '@/types';
import { Button } from '@/components/ui/Button';
import { Check, Clock, TrendingUp } from 'lucide-react';
import { EventListItem } from '@/components/features/EventList';

interface RecentActivityListProps {
  events: Event[];
  pipelineEvents?: Event[];
  onApprove: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
  onReject: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
}

import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import { Keyboard } from 'lucide-react';

// ... inside component ...
export function RecentActivityList({ events, pipelineEvents = [], onApprove, onReject }: RecentActivityListProps) {
  const [activeTab, setActiveTab] = useState<'pending' | 'pipeline'>('pending');
  const displayEvents = activeTab === 'pending' ? events : pipelineEvents;

  const { focusedId } = useKeyboardNavigation({
    events: displayEvents,
    onApprove: activeTab === 'pending' ? (id, e) => onApprove(id, e) : undefined,
    onReject: activeTab === 'pending' ? (id, e) => onReject(id, e) : undefined,
    onEdit: () => { } // Edit not supported in dashboard list currently, or add handler
  });

  return (
    <div className="bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm h-full flex flex-col overflow-hidden">
      <div className="p-6 pb-2 flex flex-col gap-3 flex-shrink-0">
        <div className="flex justify-between items-center">
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${activeTab === 'pending'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                }`}
            >
              Review ({events.length})
            </button>
            <button
              onClick={() => setActiveTab('pipeline')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${activeTab === 'pipeline'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                }`}
            >
              Pipeline ({pipelineEvents.length})
            </button>
          </div>
        </div>

        {/* Keyboard Legend */}
        {activeTab === 'pending' && displayEvents.length > 0 && (
          <div className="flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/50 px-2 py-1 rounded border border-gray-100 dark:border-gray-800 w-full justify-center lg:justify-start">
            <Keyboard className="w-3 h-3" />
            <span className="font-mono">↑↓</span> <span className="hidden sm:inline">Nav</span>
            <span className="text-gray-300 dark:text-gray-600 mx-1">•</span>
            <span className="font-mono">A</span> <span>Approve</span>
            <span className="text-gray-300 dark:text-gray-600 mx-1">•</span>
            <span className="font-mono">R</span> <span>Reject</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-gray-100 dark:divide-gray-800">
        {displayEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6">
            <Check className="w-12 h-12 mb-3 text-green-100 dark:text-green-900/30" />
            <p className="text-sm font-medium">
              {activeTab === 'pending' ? 'All caught up!' : 'Pipeline empty'}
            </p>
            <p className="text-xs">
              {activeTab === 'pending' ? 'No pending events to review.' : 'No approved events waiting for publish.'}
            </p>
          </div>
        ) : (
          displayEvents.map((item) => (
            <EventListItem
              key={item.id}
              event={item}
              selected={false}
              onSelect={() => { }}
              onEdit={() => { }}
              onVenueClick={() => { }}
              onArtistClick={() => { }}
              onApprove={activeTab === 'pending' ? onApprove : undefined}
              onReject={activeTab === 'pending' ? onReject : undefined}
              isFocused={focusedId === item.id}
            />
          ))
        )}
      </div>

      <div className="p-4 pt-2 text-center bg-white dark:bg-gray-900 border-t border-gray-50 dark:border-gray-800">
        <Button variant="ghost" size="sm" className="text-xs w-full">View All {activeTab === 'pending' ? 'Pending' : 'Pipeline'}</Button>
      </div>
    </div>
  );
}
