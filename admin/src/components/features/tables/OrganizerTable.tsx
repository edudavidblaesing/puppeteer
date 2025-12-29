import React from 'react';
import { Organizer } from '@/types';
import { SourceIcon } from '@/components/ui/SourceIcon';
import clsx from 'clsx';
import { User, Globe, Link as LinkIcon, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface OrganizerTableProps {
    organizers: Organizer[];
    selectedIds: Set<string>;
    onSelect: (id: string) => void;
    onSelectAll: () => void;
    onEdit: (organizer: Organizer) => void;
    onDelete?: (id: string) => void;
}

export function OrganizerTable({
    organizers,
    selectedIds,
    onSelect,
    onSelectAll,
    onEdit,
    onDelete
}: OrganizerTableProps) {

    if (organizers.length === 0) {
        return <div className="p-8 text-center text-gray-500">No organizers found matching current filters.</div>;
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
                                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                    checked={organizers.length > 0 && selectedIds.size === organizers.length}
                                    onChange={onSelectAll}
                                />
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organizer</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sources</th>
                            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-950">
                        {organizers.map((organizer) => (
                            <tr key={organizer.id} className={clsx("hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors", selectedIds.has(organizer.id) && "bg-primary-50 dark:bg-primary-900/10")}>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                        checked={selectedIds.has(organizer.id)}
                                        onChange={() => onSelect(organizer.id)}
                                    />
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center">
                                        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-3 text-blue-600 dark:text-blue-400 overflow-hidden">
                                            {organizer.image_url ? (
                                                <img src={organizer.image_url} alt="" className="h-full w-full object-cover" />
                                            ) : (
                                                <User className="w-5 h-5" />
                                            )}
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-primary-600 cursor-pointer" onClick={() => onEdit(organizer)}>
                                                {organizer.name}
                                            </div>
                                            {organizer.website_url && (
                                                <a href={organizer.website_url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-primary-500 flex items-center gap-1">
                                                    <Globe className="w-3 h-3" />
                                                    <span className="truncate max-w-[150px]">{organizer.website_url}</span>
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-gray-700 dark:text-gray-300">{organizer.event_count || 0} Events</span>
                                        <span className="text-xs text-gray-400 capitalize">{organizer.venue_count || 0} Venues</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <div className="flex -space-x-1 overflow-hidden">
                                        {Array.from(new Set(organizer.source_references?.map(s => s.source_code) || [])).map((source, idx) => (
                                            <SourceIcon key={idx} sourceCode={source} className="inline-block h-6 w-6 rounded-full ring-2 ring-white dark:ring-gray-900" />
                                        ))}
                                    </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button variant="ghost" size="sm" onClick={() => onEdit(organizer)}>
                                            <Edit className="w-4 h-4" />
                                        </Button>
                                        {onDelete && (
                                            <Button variant="ghost" size="sm" onClick={() => onDelete(organizer.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20">
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
