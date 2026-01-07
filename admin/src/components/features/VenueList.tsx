import React from 'react';
import { Building2, MapPin, Globe } from 'lucide-react';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { Venue } from '@/types';
import { SelectableListItem } from '@/components/ui/SelectableListItem';

interface VenueListProps {
  venues: Venue[];
  isLoading: boolean;
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  onEdit: (venue: Venue) => void;
  focusedId?: string | null;
}

export function VenueList({
  venues,
  isLoading,
  selectedIds,
  onSelect,
  onSelectAll,
  onEdit,
  focusedId
}: VenueListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (venues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        <Building2 className="w-12 h-12 mb-4 opacity-20" />
        <p>No venues found</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-800">
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {venues.map((venue) => (
          <SelectableListItem
            key={venue.id}
            id={venue.id}
            isActiveView={focusedId === venue.id}
            title={venue.name}
            subtitle={
              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                {venue.city && (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    <span>{venue.city}</span>
                  </div>
                )}
                {venue.content_url && (
                  <div className="flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    <span className="truncate max-w-[200px]">{venue.content_url}</span>
                  </div>
                )}
              </div>
            }
            // Venue does not consistently have an image field in strict types? 
            // Checking the previous file, it used Building2 icon. 
            // We can pass `imageUrl={venue.image_url}` if it exists or null.
            imageUrl={(venue as any).image_url}
            imageFallback={<Building2 className="w-6 h-6 text-gray-400 opacity-50" />}
            isChecked={selectedIds.has(venue.id)}
            onToggleSelection={() => onSelect(venue.id)}
            onClick={() => onEdit(venue)}
            metaRight={
              <div className="flex items-center gap-1 mt-1 justify-end">
                {Array.from(new Set(venue.source_references?.map(s => s.source_code) || [])).map(source => (
                  <SourceIcon key={source} sourceCode={source} className="w-4 h-4" />
                ))}
              </div>
            }
          />
        ))}
      </div>
    </div>
  );
}

