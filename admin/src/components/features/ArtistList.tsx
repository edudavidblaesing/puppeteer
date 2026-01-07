import React from 'react';
import { Music, Link2, Globe } from 'lucide-react';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { Artist } from '@/types';
import { SelectableListItem } from '@/components/ui/SelectableListItem';

interface ArtistListProps {
  artists: Artist[];
  isLoading: boolean;
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  onEdit: (artist: Artist) => void;
  focusedId?: string | null;
}

export function ArtistList({
  artists,
  isLoading,
  selectedIds,
  onSelect,
  onSelectAll,
  onEdit,
  focusedId
}: ArtistListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (artists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        <Music className="w-12 h-12 mb-4 opacity-20" />
        <p>No artists found</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-800">
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {artists.map((artist) => (
          <SelectableListItem
            key={artist.id}
            id={artist.id}
            isActiveView={focusedId === artist.id}
            title={artist.name}
            imageUrl={artist.image_url}
            imageFallback={<Music className="w-6 h-6 text-gray-400 opacity-50" />}
            isChecked={selectedIds.has(artist.id)}
            onToggleSelection={() => onSelect(artist.id)}
            onClick={() => onEdit(artist)}
            subtitle={
              <div className="flex items-center justify-between gap-4 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-2">
                  {artist.country && (
                    <span className="text-xs px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 font-medium">
                      {artist.country}
                    </span>
                  )}
                  {artist.content_url && (
                    <a
                      href={artist.content_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400 ml-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link2 className="w-3 h-3" />
                      <span className="truncate max-w-[200px]">{artist.content_url}</span>
                    </a>
                  )}
                </div>
              </div>
            }
            metaRight={
              <div className="flex items-center gap-1 mt-1 justify-end">
                {Array.from(new Set(artist.source_references?.map(s => s.source_code) || [])).map(source => (
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

