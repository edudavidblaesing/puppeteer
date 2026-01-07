import React from 'react';
import { Briefcase, Globe, Link as LinkIcon } from 'lucide-react';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { Organizer } from '@/types';
import { SelectableListItem } from '@/components/ui/SelectableListItem';

interface OrganizerListProps {
  organizers: Organizer[];
  isLoading: boolean;
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  onEdit: (organizer: Organizer) => void;
  focusedId?: string | null;
}

export function OrganizerList({
  organizers,
  isLoading,
  selectedIds,
  onSelect,
  onSelectAll,
  onEdit,
  focusedId
}: OrganizerListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (organizers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        <Briefcase className="w-12 h-12 mb-4 opacity-20" />
        <p>No organizers found</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-800">
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {organizers.map((organizer) => (
          <SelectableListItem
            key={organizer.id}
            id={organizer.id}
            isActiveView={focusedId === organizer.id}
            title={organizer.name}
            imageUrl={organizer.image_url}
            imageFallback={<Briefcase className="w-6 h-6 text-gray-400 opacity-50" />}
            isChecked={selectedIds.has(organizer.id)}
            onToggleSelection={() => onSelect(organizer.id)}
            onClick={() => onEdit(organizer)}
            subtitle={
              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                {organizer.website_url && (
                  <div className="flex items-center gap-1">
                    <LinkIcon className="w-3 h-3" />
                    <span className="truncate max-w-[200px]">{organizer.website_url}</span>
                  </div>
                )}
              </div>
            }
            metaRight={
              <div className="flex items-center gap-1 mt-1 justify-end">
                {Array.from(new Set(organizer.source_references?.map(s => s.source_code) || [])).map(source => (
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

