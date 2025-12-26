import React from 'react';
import { Artist } from '@/types';
import { SourceIcon } from '@/components/ui/SourceIcon';
import clsx from 'clsx';
import { Music, Globe, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ArtistTableProps {
    artists: Artist[];
    selectedIds: Set<string>;
    onSelect: (id: string) => void;
    onSelectAll: () => void;
    onEdit: (artist: Artist) => void;
    onDelete?: (id: string) => void;
}

export function ArtistTable({
    artists,
    selectedIds,
    onSelect,
    onSelectAll,
    onEdit,
    onDelete
}: ArtistTableProps) {

    if (artists.length === 0) {
        return <div className="p-8 text-center text-gray-500">No artists found matching current filters.</div>;
    }

    return (
        <div className="min-w-full inline-block align-middle">
            <div className="border rounded-lg overflow-hidden dark:border-gray-800">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10">
                                <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    checked={artists.length > 0 && selectedIds.size === artists.length}
                                    onChange={onSelectAll}
                                />
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Artist</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sources</th>
                            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-950">
                        {artists.map((artist) => (
                            <tr key={artist.id} className={clsx("hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors", selectedIds.has(artist.id) && "bg-indigo-50 dark:bg-indigo-900/10")}>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        checked={selectedIds.has(artist.id)}
                                        onChange={() => onSelect(artist.id)}
                                    />
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center">
                                        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mr-3 text-purple-600 dark:text-purple-400 overflow-hidden">
                                            {artist.image_url ? (
                                                <img src={artist.image_url} alt="" className="h-full w-full object-cover" />
                                            ) : (
                                                <Music className="w-5 h-5" />
                                            )}
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-indigo-600 cursor-pointer" onClick={() => onEdit(artist)}>
                                                {artist.name}
                                            </div>
                                            {artist.content_url && (
                                                <a href={artist.content_url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-indigo-500 flex items-center gap-1">
                                                    <Globe className="w-3 h-3" />
                                                    <span className="truncate max-w-[150px]">{artist.content_url}</span>
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-gray-700 dark:text-gray-300">{artist.country || 'Unknown Country'}</span>
                                        <span className="text-xs text-gray-400">
                                            {artist.genres && Array.isArray(artist.genres) ? artist.genres.slice(0, 3).join(', ') : ''}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <div className="flex -space-x-1 overflow-hidden">
                                        {Array.from(new Set(artist.source_references?.map(s => s.source_code) || [])).map((source, idx) => (
                                            <SourceIcon key={idx} sourceCode={source} className="inline-block h-6 w-6 rounded-full ring-2 ring-white dark:ring-gray-900" />
                                        ))}
                                    </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button variant="ghost" size="sm" onClick={() => onEdit(artist)}>
                                            <Edit className="w-4 h-4" />
                                        </Button>
                                        {onDelete && (
                                            <Button variant="ghost" size="sm" onClick={() => onDelete(artist.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20">
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
