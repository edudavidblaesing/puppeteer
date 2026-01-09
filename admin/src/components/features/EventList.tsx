import React from 'react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { Calendar, Music, Check, X, GitPullRequest } from 'lucide-react';
import { Event, EVENT_TYPES, getEventTiming } from '@/types';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { SelectableListItem } from '@/components/ui/SelectableListItem';

export interface EventListItemProps {
  event: Event;
  selected: boolean;
  onSelect: (id: string) => void;
  onEdit: (event: Event) => void;
  onApprove?: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
  onReject?: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
  onPublish?: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
  onVenueClick?: (id: string) => void;
  onArtistClick?: (name: string) => void;
  isFocused?: boolean;
  onRef?: (node: HTMLDivElement | null) => void;
}

export function EventListItem({
  event: item,
  selected,
  onSelect,
  onEdit,
  onApprove,
  onReject,
  onPublish,
  onVenueClick,
  onArtistClick,
  isFocused,
  onRef
}: EventListItemProps) {
  // Get unique sources
  const sources = item.source_references?.reduce((acc: string[], ref: any) => {
    if (ref.source_code && !acc.includes(ref.source_code)) acc.push(ref.source_code);
    return acc;
  }, [] as string[]) || [];

  if (item.id.startsWith('manual_') && !sources.includes('manual')) {
    sources.push('manual');
  }

  // Parse artists
  let artistsList: string[] = [];
  try {
    if (item.artists_list && item.artists_list.length > 0) {
      artistsList = item.artists_list.map(a => typeof a === 'string' ? a : a.name);
    } else if (typeof item.artists === 'string') {
      const parsed = JSON.parse(item.artists);
      artistsList = Array.isArray(parsed) ? parsed.map((a: any) => a.name || a) : [parsed.name || item.artists];
    }
  } catch {
    artistsList = [];
  }

  // Timing & Status Logic
  const getTimingStyle = (event: Event) => {
    const timing = getEventTiming(event);
    const styles = {
      upcoming: { isLive: false, isPast: false },
      ongoing: { isLive: true, isPast: false },
      recent: { isLive: false, isPast: true },
      expired: { isLive: false, isPast: true }
    };
    return styles[timing];
  };

  const timing = getTimingStyle(item);
  const isRejected = item.status === 'REJECTED' || item.publish_status === 'rejected';

  // Status Logic mirroring Dashboard (Prioritize status over deprecated publish_status)
  const s = (item.status || item.publish_status || 'MANUAL_DRAFT') as string;

  // Status Badge Component
  const StatusBadge = () => {
    let badgeText = s.replace(/_/g, ' ');
    // Default fallback
    let badgeColor = 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';

    if (s === 'APPROVED_PENDING_DETAILS' || s === 'needs_details') {
      badgeText = 'NEEDS REVIEW';
      badgeColor = 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800';
    } else if (s === 'READY_TO_PUBLISH' || s === 'ready') {
      badgeText = 'READY';
      badgeColor = 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800';
    } else if (s === 'PUBLISHED' || s === 'published') {
      if (timing.isLive) {
        badgeText = 'LIVE';
        badgeColor = 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 animate-pulse';
      } else if (timing.isPast) {
        badgeText = 'ENDED';
        badgeColor = 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700';
      } else {
        badgeText = 'PUBLISHED';
        badgeColor = 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800';
      }
    } else if (s === 'CANCELED' || s === 'canceled') {
      badgeText = 'CANCELED';
      badgeColor = 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800';
    } else if (s === 'REJECTED' || s === 'rejected') {
      badgeText = 'REJECTED';
      badgeColor = 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800';
    } else if (['MANUAL_DRAFT', 'SCRAPED_DRAFT', 'DRAFT', 'draft', 'pending'].includes(s)) {
      badgeText = 'DRAFT';
      badgeColor = 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
    }

    const isDraftState = ['MANUAL_DRAFT', 'SCRAPED_DRAFT', 'DRAFT', 'draft', 'pending'].includes(s);
    const isReadyState = s === 'READY_TO_PUBLISH' || s === 'ready';
    const showHoverActions = (isDraftState && onApprove && onReject) || (isReadyState && onPublish);

    return (
      <div className="flex items-center gap-2 justify-end min-h-[22px]">
        {item.has_pending_changes && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-500 font-medium flex items-center gap-1">
            <GitPullRequest className="w-3 h-3" />
          </span>
        )}

        {/* Badge: Hidden on hover if actions available */}
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wide ${badgeColor} ${showHoverActions ? 'group-hover:hidden' : ''}`}>
          {badgeText}
        </span>

        {/* Actions: Shown on hover */}
        {showHoverActions && (
          <div className="hidden group-hover:flex items-center gap-1">
            {isDraftState && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onApprove && onApprove(item.id, e); }}
                  className="h-5 px-2 flex items-center justify-center rounded-full border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40 text-[10px] uppercase font-bold tracking-wide transition-colors"
                  title="Approve (A)"
                >
                  Approve
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onReject && onReject(item.id, e); }}
                  className="h-5 px-2 flex items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 text-[10px] uppercase font-bold tracking-wide transition-colors"
                  title="Reject (R)"
                >
                  Reject
                </button>
              </>
            )}
            {isReadyState && (
              <button
                onClick={(e) => { e.stopPropagation(); onPublish && onPublish(item.id, e); }}
                className="h-5 px-2 flex items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 text-[10px] uppercase font-bold tracking-wide transition-colors"
                title="Publish (P)"
              >
                Publish
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const formattedDate = item.date ? format(new Date(item.date.toString().split('T')[0]), 'MMM d') : '—';

  return (
    <SelectableListItem
      id={item.id}
      title={
        <div className="flex items-center gap-2">
          <span className={clsx(isRejected && "line-through text-gray-400")}>{item.title}</span>
          {item.event_type && item.event_type !== 'event' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 font-medium leading-tight">
              {EVENT_TYPES.find(t => t.value === item.event_type)?.label || item.event_type}
            </span>
          )}
        </div>
      }
      subtitle={
        <div className="flex flex-col gap-0.5 mt-0.5">
          {item.venue_name && (
            <span
              className={clsx("text-xs text-gray-600 dark:text-gray-400 font-medium", onVenueClick && "cursor-pointer hover:underline hover:text-primary-600")}
              onClick={(e) => {
                if (onVenueClick && item.venue_id) {
                  e.stopPropagation();
                  onVenueClick(item.venue_id);
                }
              }}
            >
              {item.venue_name}
            </span>
          )}
          {artistsList.length > 0 && (
            <div className="text-[11px] text-gray-500 dark:text-gray-500 truncate">
              {artistsList.slice(0, 3).join(', ')}
              {artistsList.length > 3 && ` + ${artistsList.length - 3} more`}
            </div>
          )}
        </div>
      }
      imageUrl={item.flyer_front}
      imageFallback={<Calendar className="w-6 h-6 text-gray-400" />}
      isChecked={selected}
      onToggleSelection={() => onSelect(item.id)}
      onClick={() => onEdit(item)}
      // Force 'isActiveView' style on focus to mimic keyboard selection
      isActiveView={isFocused || false}
      className={clsx(isFocused && "ring-2 ring-primary-500 z-10")}

      statusBadge={<StatusBadge />}
      // Actions: implicitly handled by StatusBadge returning buttons on hover
      actionsHover={undefined}

      metaRight={
        <>
          <span className={clsx(
            "text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase tracking-wide text-xs mb-1 block text-right",
            formattedDate !== '—' ? "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400" : "text-red-500 border-transparent"
          )}>
            {formattedDate}
          </span>
          <div className="flex justify-end gap-1">
            {sources.map(s => <SourceIcon key={s} sourceCode={s} className="w-4 h-4" />)}
          </div>
        </>
      }
      domRef={onRef}
    />
  );
}

interface EventListProps {
  events: Event[];
  isLoading: boolean;
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  onEdit: (event: Event) => void;
  onApprove?: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
  onReject?: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
  onPublish?: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void; // Added onPublish
  onVenueClick?: (id: string) => void;
  onArtistClick?: (name: string) => void;
  focusedId?: string | null;
  onItemRef?: (index: number, node: HTMLDivElement | null) => void;
}

export function EventList({
  events,
  isLoading,
  selectedIds,
  onSelect,
  onSelectAll,
  onEdit,
  onApprove,
  onReject,
  onPublish, // Destructure onPublish
  onVenueClick,
  onArtistClick,
  focusedId,
  onItemRef
}: EventListProps) {

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
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {events.map((item, index) => (
          <EventListItem
            key={item.id}
            event={item}
            selected={selectedIds.has(item.id)}
            onSelect={onSelect}
            onEdit={onEdit} // Pass onEdit directly, as it expects the event object
            onApprove={onApprove ? (id, e) => onApprove(id, e) : undefined} // Pass id and event
            onReject={onReject ? (id, e) => onReject(id, e) : undefined} // Pass id and event
            onPublish={onPublish ? (id, e) => onPublish(id, e) : undefined} // Pass onPublish
            onVenueClick={onVenueClick}
            onArtistClick={onArtistClick}
            isFocused={focusedId === item.id}
            onRef={(node) => onItemRef?.(index, node)}
          />
        ))}
      </div>
    </div>
  );
}
