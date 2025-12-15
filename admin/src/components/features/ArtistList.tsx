import React from 'react';
import clsx from 'clsx';
import { Music, Globe, Link2, Image as ImageIcon } from 'lucide-react';
import { Artist } from '@/types';

interface ArtistListProps {
  artists: Artist[];
  isLoading: boolean;
  onEdit: (artist: Artist) => void;
}

export function ArtistList({
  artists,
  isLoading,
  onEdit
}: ArtistListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
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
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">{artists.length} artists</span>
        </div>
      </div>

      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {artists.map((artist) => (
          <div
            key={artist.id}
            onClick={() => onEdit(artist)}
            className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors group"
          >
            <div className="flex items-start gap-4">
              {/* Artist Image or Placeholder */}
              <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 overflow-hidden border border-gray-200 dark:border-gray-700">
                {artist.image_url ? (
                  <img src={artist.image_url} alt={artist.name} className="w-full h-full object-cover" />
                ) : (
                  <Music className="w-6 h-6 text-gray-400" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {artist.name}
                  </h3>
                  {artist.country && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                      {artist.country}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                  {artist.content_url && (
                    <a 
                      href={artist.content_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link2 className="w-3 h-3" />
                      <span className="truncate max-w-[200px]">{artist.content_url}</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
