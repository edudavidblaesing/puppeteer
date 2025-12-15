import React, { useState } from 'react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { Calendar, MapPin, Building2, Music, Check, X, Clock } from 'lucide-react';
import { Event, EVENT_TYPES, getEventTiming } from '@/types';
import { Button } from '@/components/ui/Button';

interface RecentActivityListProps {
  events: Event[];
  onApprove: (id: string, e: React.MouseEvent) => void;
  onReject: (id: string, e: React.MouseEvent) => void;
}

export function RecentActivityList({ events, onApprove, onReject }: RecentActivityListProps) {
  // Filter only pending events for this view
  const pendingEvents = events.filter(e => e.publish_status === 'pending');
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;
  const totalPages = Math.ceil(pendingEvents.length / itemsPerPage);

  const displayEvents = pendingEvents.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  return (
    <div className="bg-white dark:bg-gray-900 p-6 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Pending Approvals</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">{pendingEvents.length} pending</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
        {displayEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Check className="w-12 h-12 mb-3 text-green-100 dark:text-green-900/30" />
            <p className="text-sm font-medium">All caught up!</p>
            <p className="text-xs">No pending events to review.</p>
          </div>
        ) : (
          displayEvents.map((item) => {
            // Helper for artist parsing (reused from EventList logic)
            let artistsList: string[] = [];
            if (item.artists_list && item.artists_list.length > 0) {
              artistsList = item.artists_list.map(a => {
                if (typeof a.name === 'string' && (a.name.startsWith('{') || a.name.startsWith('['))) {
                  try {
                    const parsed = JSON.parse(a.name);
                    return parsed.name || a.name;
                  } catch { return a.name; }
                }
                return a.name;
              });
            } else if (typeof item.artists === 'string') {
              try {
                // Handle potential double stringification or single object
                let parsed = JSON.parse(item.artists);
                if (typeof parsed === 'string') {
                  try { parsed = JSON.parse(parsed); } catch { }
                }

                if (Array.isArray(parsed)) {
                  artistsList = parsed.map((a: any) => typeof a === 'string' ? a : a.name || '');
                } else if (typeof parsed === 'object' && parsed !== null) {
                  artistsList = [parsed.name || ''];
                } else {
                  artistsList = [String(item.artists)];
                }
              } catch {
                artistsList = [item.artists || ''];
              }
            }

            return (
              <div
                key={item.id}
                className={clsx(
                  'group p-3 flex items-start gap-3 rounded-2xl transition-all border',
                  'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 hover:border-indigo-100 dark:hover:border-indigo-900/50 hover:shadow-md'
                )}
              >
                {/* Image */}
                <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 overflow-hidden border border-gray-200 dark:border-gray-700">
                  {item.flyer_front ? (
                    <img src={item.flyer_front} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Calendar className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-white truncate pr-2">{item.title}</h3>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => onApprove(item.id, e)}
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40 transition-colors"
                        title="Approve"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => onReject(item.id, e)}
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 transition-colors"
                        title="Reject"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {item.venue_name && (
                      <div className="flex items-center gap-1 truncate max-w-[120px]">
                        <Building2 className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{item.venue_name}</span>
                      </div>
                    )}
                    <span className="text-gray-300 dark:text-gray-700">•</span>
                    <div>{item.date ? format(new Date(item.date), 'MMM d') : 'No date'}</div>
                  </div>

                  {artistsList.length > 0 && (
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      {artistsList.slice(0, 2).map((artist, idx) => (
                        <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-gray-700">
                          {artist}
                        </span>
                      ))}
                      {artistsList.length > 2 && <span className="text-[10px] text-gray-400">+{artistsList.length - 2}</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="pt-4 mt-auto border-t border-gray-100 dark:border-gray-800 flex justify-between items-center text-xs text-gray-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="h-7 text-xs"
            >
              Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="h-7 text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
