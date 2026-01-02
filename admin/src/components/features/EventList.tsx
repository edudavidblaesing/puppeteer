import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { Calendar, MapPin, Building2, Music, Check, X, Keyboard, GitPullRequest } from 'lucide-react';
import { Event, EVENT_TYPES, getEventTiming } from '@/types';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';

export interface EventListItemProps {
  event: Event;
  selected: boolean;
  onSelect: (id: string) => void;
  onEdit: (event: Event) => void;
  onVenueClick: (venueId: string) => void;
  onArtistClick: (artistName: string) => void;
  onApprove?: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
  onReject?: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
  isFocused?: boolean;
}

export function EventListItem({
  event: item,
  selected,
  onSelect,
  onEdit,
  onVenueClick,
  onArtistClick,
  onApprove,
  onReject,
  isFocused
}: EventListItemProps) {
  // Get unique sources from source_references
  const sources = item.source_references?.reduce((acc: string[], ref: any) => {
    if (ref.source_code && !acc.includes(ref.source_code)) acc.push(ref.source_code);
    return acc;
  }, [] as string[]) || [];

  // Add 'manual' source if ID indicates it
  if (item.id.startsWith('manual_') && !sources.includes('manual')) {
    sources.push('manual');
  }

  // Parse artists list if it's a string (legacy) or use the array
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
      // Robust parsing for various JSON states
      let parsed = JSON.parse(item.artists);
      // Handle potential double stringification
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
      artistsList = item.artists ? [item.artists] : [];
    }
  }

  const getTimingStyle = (event: Event) => {
    const timing = getEventTiming(event);
    const styles = {
      upcoming: { dateClass: 'text-gray-900 dark:text-gray-100', isLive: false, isPast: false },
      ongoing: { dateClass: 'text-emerald-600 dark:text-emerald-400 font-semibold', isLive: true, isPast: false },
      recent: { dateClass: 'text-gray-400 dark:text-gray-500', isLive: false, isPast: true },
      expired: { dateClass: 'text-gray-400 dark:text-gray-500', isLive: false, isPast: true }
    };
    return styles[timing];
  };

  const timing = getTimingStyle(item);
  const isRejected = item.publish_status === 'rejected';
  const isPending = item.publish_status === 'pending';
  const isPast = timing.isPast;
  const isLive = timing.isLive;

  return (
    <div
      id={`event-item-${item.id}`}
      onClick={() => onEdit(item)}
      className={clsx(
        'px-6 py-4 flex items-center gap-3 cursor-pointer transition-colors relative group',
        isFocused && 'ring-2 ring-primary-500 z-10 bg-primary-50 dark:bg-primary-900/20',
        isRejected && 'bg-gray-50 dark:bg-gray-900/50',
        isPending && 'pending-stripes',
        !isRejected && !isPending && !isFocused && 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800',
        isPast && !isRejected && 'opacity-60'
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => { e.stopPropagation(); onSelect(item.id); }}
        className="w-4 h-4 rounded text-primary-600 dark:text-primary-500 border-gray-300 dark:border-gray-600 focus:ring-primary-500"
      />

      <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 overflow-hidden border border-gray-200 dark:border-gray-700">
        {item.flyer_front ? (
          <img src={item.flyer_front} alt="" className="w-full h-full object-cover" />
        ) : (
          <Calendar className="w-6 h-6 text-gray-400 dark:text-gray-500" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 mb-1">
          <h3 className={clsx(
            'font-medium text-sm truncate flex-1',
            isRejected ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'
          )}>{item.title}</h3>

          {item.event_type && item.event_type !== 'event' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 font-medium flex-shrink-0 leading-tight whitespace-nowrap">
              {EVENT_TYPES.find(t => t.value === item.event_type)?.icon} {EVENT_TYPES.find(t => t.value === item.event_type)?.label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-x-2 gap-y-1 flex-wrap text-xs text-gray-500 dark:text-gray-400">
          {item.venue_name && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (item.venue_id) onVenueClick(item.venue_id);
              }}
              className={clsx(
                'flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400 transition-colors',
                !item.venue_id && 'cursor-default hover:text-gray-500 dark:hover:text-gray-400'
              )}
              disabled={!item.venue_id}
            >
              <Building2 className="w-3 h-3" />
              <span className={clsx(isRejected && 'line-through')}>{item.venue_name}</span>
            </button>
          )}

          {item.venue_city && (
            <>
              <span className="text-gray-300 dark:text-gray-600">•</span>
              <span className={clsx(isRejected && 'line-through')}>{item.venue_city}</span>
            </>
          )}
        </div>

        {artistsList.length > 0 && (
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            <Music className="w-3 h-3 text-gray-400 dark:text-gray-500 mr-1" />
            {artistsList.slice(0, 3).map((artistName, idx) => (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  onArtistClick(artistName);
                }}
                className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-700 dark:hover:text-primary-400 transition-colors border border-gray-200 dark:border-gray-700"
              >
                {artistName}
              </button>
            ))}
            {artistsList.length > 3 && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500">+{artistsList.length - 3}</span>
            )}
          </div>
        )}
      </div>

      <div className="text-right flex-shrink-0 self-start flex flex-col items-end gap-1">
        {isLive ? (
          <div className="flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">LIVE</span>
          </div>
        ) : (
          <p className={clsx(
            'text-sm font-medium whitespace-nowrap',
            timing.dateClass,
            isRejected && 'line-through'
          )}>
            {item.date ? format(new Date(`${item.date.toString().split('T')[0]}T00:00:00`), 'MMM d') : '—'}
          </p>
        )}

        <div className="flex items-center gap-1 mt-1 justify-end">
          {item.has_pending_changes && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1">
              <GitPullRequest className="w-3 h-3" />
              Updates
            </span>
          )}
          {item.status === 'PUBLISHED' && (
            <>
              {isLive ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium animate-pulse">
                  Live
                </span>
              ) : isPast ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium">
                  Ended
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium">
                  Published
                </span>
              )}
            </>
          )}
          {item.status === 'READY_TO_PUBLISH' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
              Ready
            </span>
          )}
          {item.status === 'CANCELED' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium">
              Canceled
            </span>
          )}
          {sources.map((source) => (
            <SourceIcon key={source} sourceCode={source} className="w-4 h-4" />
          ))}
        </div>

        {(isPending && onApprove && onReject) && (
          <div className="flex items-center gap-1 mt-2 justify-end">
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
        )}
      </div>
    </div >
  );
}

interface EventListProps {
  events: Event[];
  isLoading: boolean;
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  onEdit: (event: Event) => void;
  onVenueClick: (venueId: string) => void;
  onArtistClick: (artistName: string) => void;
  onApprove?: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
  onReject?: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
}


export function EventList({
  events,
  isLoading,
  selectedIds,
  onSelect,
  onSelectAll,
  onEdit,
  onVenueClick,
  onArtistClick,
  onApprove,
  onReject
}: EventListProps) {
  const { focusedId } = useKeyboardNavigation({
    events,
    onApprove: onApprove ? (id, e) => onApprove(id, e) : undefined,
    onReject: onReject ? (id, e) => onReject(id, e) : undefined,
    onEdit: (id) => {
      const event = events.find(e => e.id === id);
      if (event) onEdit(event);
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        <Calendar className="w-12 h-12 mb-4 opacity-20" />
        <p>No events found</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-800">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500 dark:text-gray-400">{events.length} events</span>
          <div className="flex items-center gap-2 text-[10px] md:text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">
            <Keyboard className="w-3 h-3" />
            <span className="font-mono">↑↓</span> <span className="hidden sm:inline">Nav</span>
            <span className="text-gray-300 dark:text-gray-600 mx-1">•</span>
            <span className="font-mono">A</span> <span className="hidden sm:inline">Approve</span>
            <span className="text-gray-300 dark:text-gray-600 mx-1">•</span>
            <span className="font-mono">R</span> <span className="hidden sm:inline">Reject</span>
            <span className="text-gray-300 dark:text-gray-600 mx-1">•</span>
            <span className="font-mono">Enter</span> <span className="hidden sm:inline">Edit</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={events.length > 0 && selectedIds.size === events.length}
              onChange={onSelectAll}
              className="rounded text-primary-600 dark:text-primary-500 border-gray-300 dark:border-gray-600 focus:ring-primary-500"
            />
            Select all
          </label>
        </div>
      </div>

      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {events.map((item) => (
          <EventListItem
            key={item.id}
            event={item}
            selected={selectedIds.has(item.id)}
            onSelect={onSelect}
            onEdit={onEdit}
            onVenueClick={onVenueClick}
            onArtistClick={onArtistClick}
            onApprove={onApprove}
            onReject={onReject}
            isFocused={focusedId === item.id}
          />
        ))}
      </div>
    </div>
  );
}
