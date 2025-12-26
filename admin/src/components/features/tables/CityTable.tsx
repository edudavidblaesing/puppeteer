import React from 'react';
import { City } from '@/types';
import { SourceIcon } from '@/components/ui/SourceIcon';
import clsx from 'clsx';
import { MapPin, Building2, Calendar, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface CityTableProps {
    cities: City[];
    selectedIds: Set<string>;
    onSelect: (id: string) => void;
    onSelectAll: () => void;
    onEdit: (city: City) => void;
    onDelete?: (id: string) => void;
}

export function CityTable({
    cities,
    selectedIds,
    onSelect,
    onSelectAll,
    onEdit,
    onDelete
}: CityTableProps) {

    if (cities.length === 0) {
        return <div className="p-8 text-center text-gray-500">No cities found matching current filters.</div>;
    }

    // Helper to get ID string ref
    const getId = (city: City) => city.id?.toString() || '';

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
                                    checked={cities.length > 0 && selectedIds.size === cities.length}
                                    onChange={onSelectAll}
                                />
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">City</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stats</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sources</th>
                            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-950">
                        {cities.map((city) => (
                            <tr key={city.id} className={clsx("hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors", selectedIds.has(getId(city)) && "bg-indigo-50 dark:bg-indigo-900/10")}>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        checked={selectedIds.has(getId(city))}
                                        onChange={() => onSelect(getId(city))}
                                    />
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center">
                                        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-3 text-blue-600 dark:text-blue-400">
                                            <MapPin className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-indigo-600 cursor-pointer" onClick={() => onEdit(city)}>
                                                {city.name}
                                            </div>
                                            <div className="text-xs text-gray-500">{city.country}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                    <div className="flex gap-4">
                                        <div className="flex items-center gap-1" title="Events">
                                            <Calendar className="w-4 h-4 text-gray-400" />
                                            <span>{city.event_count || 0}</span>
                                        </div>
                                        <div className="flex items-center gap-1" title="Venues">
                                            <Building2 className="w-4 h-4 text-gray-400" />
                                            <span>{city.venue_count || 0}</span>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <div className="flex -space-x-1 overflow-hidden">
                                        {Array.from(new Set(city.source_references?.map(s => s.source_code) || [])).map((source, idx) => (
                                            <SourceIcon key={idx} sourceCode={source} className="inline-block h-6 w-6 rounded-full ring-2 ring-white dark:ring-gray-900" />
                                        ))}
                                    </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button variant="ghost" size="sm" onClick={() => onEdit(city)}>
                                            <Edit className="w-4 h-4" />
                                        </Button>
                                        {onDelete && (
                                            <Button variant="ghost" size="sm" onClick={() => onDelete(getId(city))} className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20">
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
